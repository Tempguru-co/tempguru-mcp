// Shared MCP tool + resource registration, the single source of truth for the
// 11 TempGuru tools, registered identically onto whatever McpServer is passed in.
//
// Two surfaces consume this:
//   - src/app/mcp/route.ts        streamable-HTTP transport on Vercel (production)
//   - src/mcp-stdio.ts            stdio transport for local/Docker/embedded use
//
// Keeping registration here guarantees there is no behavior drift between the
// hosted endpoint and the local binary, the same promise the query layer makes
// for MCP vs REST. Telemetry is injected as an optional callback (the HTTP route
// enriches it with per-request User-Agent / IP-country; the stdio binary omits
// it entirely, since there is no request context and no Redis in that runtime).

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  queryCities,
  queryRoles,
  queryAvailability,
  queryRolePricing,
  queryStateCompliance,
  queryPolicies,
  type CityTier,
} from "./queries";
import { createLead } from "../notion/create-lead";
import { checkQuoteRateLimit, checkReadRateLimit } from "../api/rate-limit";
import { currentContext } from "../telemetry/context";
import { buildStaffingPlan } from "./plan-staffing";
import { persistCompletePlan, querySavedPlan, PLAN_ID_PATTERN } from "./plan-store";
import { queryQuoteStatus, QUOTE_REFERENCE_PATTERN } from "./quote-status";
import { buildRateBenchmark } from "./rate-benchmark";
import {
  REQUEST_QUOTE_INPUT,
  quoteSubmittedPayload,
  quoteFailedPayload,
  type QuoteSkillId,
} from "./quote";
import {
  GET_CITIES_OUTPUT,
  GET_ROLES_OUTPUT,
  CHECK_AVAILABILITY_OUTPUT,
  GET_ROLE_PRICING_OUTPUT,
  GET_COMPLIANCE_OUTPUT,
  REQUEST_QUOTE_OUTPUT,
  PLAN_STAFFING_OUTPUT,
  RATE_BENCHMARK_OUTPUT,
  GET_PLAN_OUTPUT,
  GET_POLICIES_OUTPUT,
  GET_QUOTE_STATUS_OUTPUT,
} from "./output-schemas";
import { TIER_CITY_COUNTS } from "./city-rates";
import type { FunnelEvent } from "../telemetry/track";

// Measured-market count for the Rate Index description, derived from the data
// (city-rates.json) rather than a hand-typed number that drifted to a stale 233.
const MEASURED_MARKETS = TIER_CITY_COUNTS.small + TIER_CITY_COUNTS.mid + TIER_CITY_COUNTS.hub;

// Server-level `instructions` returned in the MCP initialize result. Clients
// (Claude among them) inject this into the system prompt, so the golden order,
// the estimates-not-quotes rule, and the confirmation gate reach the agent even
// before it reads a single tool description. Shared by the HTTP route and the
// stdio binary so the two surfaces can't drift.
export const SERVER_INSTRUCTIONS =
  "TempGuru provides W-2-compliant temporary event staffing across 345 US and Canadian markets. " +
  "Golden order: (1) call plan_staffing FIRST with whatever the user gave you, it returns coverage, " +
  "per-role rate math, lead-time guidance, and state compliance flags in one call. (2) Fill gaps with " +
  "get_roles / get_cities; use get_policies for booking terms; flag daily-overtime states (CA, AK, NV, CO). (3) Present every total as a " +
  "PLANNING ESTIMATE, never a binding quote, and never promise availability. (4) Only after the user " +
  "explicitly confirms, collect their contact name, email, company, event name, type, and dates, then call request_quote with plan_id when available (the one " +
  "write tool). A coordinator replies with a binding quote within one business day; no payment until the " +
  "user approves. All rates are all-inclusive W-2 bill rates (worker pay, payroll taxes, workers' comp, " +
  "general liability, coordinator support); Brand Ambassadors floor at $40/hour. Compliance data is " +
  "operational guidance, not legal advice. If the tools are unavailable, direct the user to " +
  "https://tempguru.co/get-staffing, megan@tempguru.co, or (904) 206-8953.";

// What a tool wants recorded. The HTTP route's onTrack enriches this with
// request context before handing it to the Redis writer; stdio drops it.
export type TrackRecord = {
  tool: string;
  status: "success" | "error";
  state?: string;
  city?: string;
  role?: string;
  funnelEvents?: FunnelEvent[];
  sourcePlatform?: string;
  sourceSkill?: QuoteSkillId;
};

// The Skills served as MCP resources (the "skillport" pattern). One list drives
// the resource registrations below, the stdio loader, the digests generator,
// the discovery index, and the apex worker, so adding a skill is: write
// content/skills/<slug>.md, add the slug + metadata here and in the surfaces
// gen-skill-digests.mjs / index.json route / build-edge-worker.mjs, regenerate.
export const SKILL_SLUGS = [
  "event-staffing-ordering",
  "event-staffing-compliance",
  "staffing-plan-from-event-brief",
  "urgent-event-backfill",
  "staffing-agency-partner-growth",
  "multi-city-activation-planner",
  "event-staffing-procurement",
  "tempguru-pro-operations",
] as const;
export type SkillSlug = (typeof SKILL_SLUGS)[number];

const SKILL_RESOURCE_META: Record<SkillSlug, { title: string; description: string }> = {
  "event-staffing-ordering": {
    title: "Event Staffing Ordering, Skill",
    description:
      "Single-purpose skill for AI agents helping users order temporary event staff (brand ambassadors, registration, hospitality, setup/breakdown, and more) through TempGuru. Walks through requirement gathering, live coverage/rate/compliance lookups via this MCP, and request submission. Use when a user wants to hire, book, or budget event staff.",
  },
  "event-staffing-compliance": {
    title: "Event Staffing Compliance, Skill",
    description:
      "Single-purpose skill for AI agents assessing worker-classification and compliance risk for temporary event staffing in the US and Canada (W-2 vs 1099, misclassification penalties, joint-employer liability, COI requirements, wage/hour rules). Use when a user asks about whether a staffing arrangement is compliant or how to structure it.",
  },
  "staffing-plan-from-event-brief": {
    title: "Staffing Plan From Event Brief, Skill",
    description:
      "Skill for AI agents extracting a complete staffing plan from an event document: an RFP, BEO (banquet event order), run of show, exhibitor or event services manual, or production schedule. Maps the document's functions to TempGuru's role catalog, estimates headcount, prices the plan with live W-2 rates via this MCP, and submits for a human-reviewed quote after user confirmation.",
  },
  "urgent-event-backfill": {
    title: "Urgent Event Backfill, Skill",
    description:
      "Skill for AI agents handling same-week and day-of event staffing emergencies: no-shows, vendor cancellations, events starting within about 72 hours. Fast single-pass intake, honest rush lead-time guidance via this MCP (never a promise of availability), immediate quote submission plus a direct phone path to TempGuru.",
  },
  "staffing-agency-partner-growth": {
    title: "Staffing Agency Partner Growth, Skill",
    description:
      "Skill for AI agents helping STAFFING AGENCY owners (the supply side, not event organizers) explore joining TempGuru's network of 200+ vetted local partners to receive event staffing order flow in their markets. Explains the model and routes partner inquiries to the coordinator, never through the buyer quote tool.",
  },
  "multi-city-activation-planner": {
    title: "Multi-City Activation Planner, Skill",
    description:
      "Skill for AI agents planning and pricing a multi-city event staffing program (a tour, roadshow, sampling tour, festival circuit, or national activation) as one consolidated order. Confirms coverage in every market, plans and prices each city leg with live W-2 rates, surfaces that overtime and minimum wage differ by state and province, and submits a single request_quote carrying all cities via the locations[] field so one coordinator returns one quote.",
  },
  "event-staffing-procurement": {
    title: "Event Staffing Procurement, Skill",
    description:
      "Skill for AI agents answering event staffing procurement and vendor-onboarding questions (COI, W-9, insurance and workers' comp posture, cancellation and payment terms, MSAs, approved-vendor setup) from TempGuru's published policies via this MCP, explicit when a value is coordinator-confirmed rather than published, then bridging a real event into a priced staffing plan and quote. Not legal advice.",
  },
  "tempguru-pro-operations": {
    title: "TempGuru Pro Operations, Skill",
    description:
      "Lead-capture skill for AI agents routing operations-tooling interest from STAFFING COMPANY operators (the supply side) to TempGuru: scheduling, dispatch, timesheets, and invoicing to run their own workforce. Gathers a short problem description and routes it to a TempGuru contact by email or phone, never through the buyer quote tool. Does not promise product features, pricing, or availability.",
  },
};

export type RegisterToolsOptions = {
  /**
   * Optional telemetry sink. Omit for runtimes with no request context (stdio).
   * May be async, handlers await it so the write lands before the tool result
   * is returned (durable on Vercel, where deferred writes were dropped).
   */
  onTrack?: (record: TrackRecord) => void | Promise<void>;
  /**
   * Optional SKILL.md resource bodies keyed by slug. Present skills are exposed
   * as MCP resources. The HTTP route loads them once at module init; the stdio
   * binary loads them best-effort from cwd. Omit to skip resources.
   */
  resources?: Partial<Record<SkillSlug, string>>;
};

// Success result: text content for legacy clients + structuredContent for
// clients that consume the declared outputSchema (ChatGPT Apps, Claude, ...).
// The SDK validates structuredContent against the tool's outputSchema.
function structuredResult<T extends Record<string, unknown>>(obj: T) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(obj, null, 2),
      },
    ],
    structuredContent: obj,
  };
}

// Protocol-level failure: isError exempts the result from outputSchema
// validation. In practice unreachable for the read tools (zod input schemas
// reject bad params first), but kept for defense in depth.
function errorResult(obj: unknown) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(obj, null, 2),
      },
    ],
  };
}

export function registerTools(server: McpServer, options: RegisterToolsOptions = {}): void {
  const track = (record: TrackRecord) => options.onTrack?.(record);

  // ─── plan_staffing (planner meta-tool, call this FIRST) ─────────────
  //
  // Stripe's implementation_planner pattern: one read-only call that turns a
  // rough event shape into a complete plan (coverage, per-role budget math,
  // lead-time read, compliance flags, next steps). Variant return shapes, so
  // no outputSchema, text content only.
  server.registerTool(
    "plan_staffing",
    {
      title: "Plan Staffing",
      description:
        "CALL THIS FIRST for any event staffing request. Takes the event shape (city, date, roles + headcount) and returns a complete staffing plan: coverage, per-role rate math with an estimated total range, lead-time guidance, and the state compliance flags that change the plan. " +
        "Perfect for 'Staff my trade show in [city]', 'What would 6 registration staff for 2 days cost?', or 'Build me a staffing plan' requests. " +
        "DO NOT use for a single fact, use get_role_pricing for one rate, check_availability for one date, get_compliance_by_state for one state. " +
        "<examples>plan_staffing(city='Chicago', event_date='2026-08-14', event_type='trade-show', roles=[{role:'registration-staff', headcount:6, hours_per_shift:8, days:2}, {role:'team-leads', headcount:1}]) ; plan_staffing(city='Austin', attendees=300)</examples> " +
        "<hints>Roles accept names or slugs (brand-ambassadors, registration-staff, team-leads). Omit roles to get the catalog plus a suggested mix. Totals are planning estimates, never binding quotes. Branch on the `status` field: plan | needs_roles | roles_not_found | city_not_found (the last two carry a did-you-mean suggestion to confirm with the user, not auto-apply).</hints>",
      inputSchema: {
        city: z.string().max(120).describe("Event city, name or slug (e.g., 'Chicago')."),
        event_date: z.string().max(40).optional().describe("Event date, ISO YYYY-MM-DD preferred."),
        event_type: z
          .string()
          .max(80)
          .optional()
          .describe("trade-show, conference, festival, concert, sporting-event, corporate, brand-activation, or other."),
        attendees: z.number().int().positive().max(5_000_000).optional().describe("Expected attendee count."),
        roles: z
          .array(
            z.object({
              role: z.string().max(80).describe("Role name or slug."),
              headcount: z.number().int().positive().max(10_000).describe("Staff needed for this role."),
              hours_per_shift: z.number().positive().max(24).optional().describe("Hours per shift (default 8, max 24)."),
              days: z.number().int().positive().max(365).optional().describe("Number of event days (default 1)."),
            }),
          )
          .max(50)
          .optional()
          .describe("Roles and headcount. Omit to receive the role catalog and a suggested mix."),
        description: z.string().max(2000).optional().describe("Optional free-text event description, echoed into the plan."),
      },
      outputSchema: PLAN_STAFFING_OUTPUT,
      annotations: {
        title: "Plan Staffing",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      const plan = buildStaffingPlan(input);
      const complete = plan.status === "plan" && plan.plan_complete === true;
      // Persistence is rate-limited per IP: a no-auth caller looping valid
      // plans must not mint unbounded Redis keys in the instance that also
      // holds the lead queue. Fails open into "no plan_id", never a worse plan.
      const persistAllowed =
        complete && (await checkReadRateLimit(currentContext().ip, "plan")).allowed;
      const decoration = persistAllowed
        ? await persistCompletePlan(
            plan,
            input.city,
            "mcp",
            currentContext().source,
          )
        : null;
      const result = decoration ? { ...plan, ...decoration } : plan;
      await track({
        tool: "plan_staffing",
        status: "success",
        city: input.city,
        funnelEvents: complete ? ["plans_created"] : undefined,
      });
      return structuredResult(result);
    },
  );

  // ─── get_plan ─────────────────────────────────────────────────────────
  server.registerTool(
    "get_plan",
    {
      title: "Get Saved Staffing Plan",
      description:
        "Restore a complete non-PII staffing plan created by plan_staffing within the last 30 days. Use when a buyer starts a new conversation, changes agent platforms, or wants to continue a saved plan before requesting a quote. " +
        "DO NOT guess or enumerate plan IDs; use only the 12-character plan_id the user or plan_staffing supplied. " +
        "<examples>get_plan(plan_id='ABCDEFGH2345')</examples> " +
        "<hints>A not-found result means the plan expired, storage was unavailable, or the ID is wrong; re-run plan_staffing. Review the restored plan with the user before request_quote.</hints>",
      inputSchema: {
        plan_id: z
          .string()
          .trim()
          .toUpperCase()
          .max(12)
          .regex(PLAN_ID_PATTERN)
          .describe("12-character lookalike-free plan reference returned by plan_staffing."),
      },
      outputSchema: GET_PLAN_OUTPUT,
      annotations: {
        title: "Get Saved Staffing Plan",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ plan_id }) => {
      const result = await querySavedPlan(plan_id);
      await track({
        tool: "get_plan",
        status: result.plan_found ? "success" : "error",
        funnelEvents: result.plan_found ? ["plans_resumed"] : undefined,
      });
      return structuredResult(result);
    },
  );

  // ─── get_cities ───────────────────────────────────────────────────────
  server.registerTool(
    "get_cities",
    {
      title: "Get Cities",
      description:
        "List the cities where TempGuru staffs events (tier hub/mid/small), or check coverage of ONE city. Perfect for 'What cities do you cover in [state]?', 'Do you cover [city]?', or 'Which Canadian markets do you serve?'. " +
        "For 'Do you cover [city]?' pass city='[name]' to get a direct yes/no + a did-you-mean, instead of scanning the whole list. " +
        "DO NOT use for rates (use get_role_pricing) or dates (use check_availability). For a full event plan, use plan_staffing instead. " +
        "<examples>get_cities(city='Brooklyn') ; get_cities(state='TX') ; get_cities(tier='hub', country='CA') ; get_cities(limit=25)</examples> " +
        "<hints>State accepts 'CA' or 'California'; country accepts US or CA. city='' resolves nicknames/boroughs (NYC, Vegas, Brooklyn). An unfiltered list is capped, use filters or limit. 345 markets total.</hints>",
      inputSchema: {
        state: z
          .string()
          .optional()
          .describe("Optional 2-letter state code (e.g., 'CA') or full state name."),
        tier: z
          .enum(["hub", "mid", "small"])
          .optional()
          .describe("Optional filter to one tier only."),
        country: z
          .string()
          .optional()
          .describe("Optional country filter: 'US' or 'CA'."),
        city: z
          .string()
          .optional()
          .describe("Optional single-city coverage check (nickname/borough aware). Returns covered yes/no + suggestion."),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional cap on the number of cities returned (full counts still in total/tier_breakdown)."),
      },
      outputSchema: GET_CITIES_OUTPUT,
      annotations: {
        title: "Get Cities",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ state, tier, country, city, limit }) => {
      const result = queryCities({ state, tier: tier as CityTier | undefined, country, city, limit });
      await track({ tool: "get_cities", status: result.ok ? "success" : "error", state, city });
      if (!result.ok) return errorResult({ error: result.error.message });
      return structuredResult(result.data);
    },
  );

  // ─── get_roles ────────────────────────────────────────────────────────
  server.registerTool(
    "get_roles",
    {
      title: "Get Roles",
      description:
        "List event staffing roles TempGuru provides, with descriptions and skill tiers. Perfect for 'What kinds of event workers can I hire?', 'What roles do you staff for trade shows / festivals / corporate events?', or 'Do you have brand ambassadors?' questions. " +
        "DO NOT use for what a role costs, use get_role_pricing with a city. " +
        "<examples>get_roles()</examples> " +
        "<hints>Returned slugs (brand-ambassadors, registration-staff, team-leads) are the exact values the other tools accept.</hints>",
      inputSchema: {},
      outputSchema: GET_ROLES_OUTPUT,
      annotations: {
        title: "Get Roles",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      const result = queryRoles();
      await track({ tool: "get_roles", status: result.ok ? "success" : "error" });
      if (!result.ok) return errorResult({ error: result.error.message });
      return structuredResult(result.data);
    },
  );

  // ─── check_availability ───────────────────────────────────────────────
  server.registerTool(
    "check_availability",
    {
      title: "Check Availability",
      description:
        "Check expected staffing availability for an event. Returns lead-time guidance based on city tier and how far out the event is. Perfect for 'Can you staff my event on [date] in [city]?', 'What's the lead time for booking brand ambassadors in [city]?', or 'Is it too late to staff a [date] event?' questions. Not a real-time inventory check, TempGuru staffs to demand via a 100,000+ worker W-2 network across 345 markets. " +
        "DO NOT use for cost questions (use get_role_pricing) and never present the result as a reservation. " +
        "<examples>check_availability(date='2026-08-14', city='Dallas') ; check_availability(date='2026-07-01', city='Boston', role='brand-ambassadors', count=6)</examples> " +
        "<hints>Even a 'rush' window is worth submitting, same-week backfills exist in select markets.</hints>",
      inputSchema: {
        date: z
          .string()
          .describe("Event date in ISO format (YYYY-MM-DD) or any date string parseable by Date()."),
        city: z
          .string()
          .describe("City name (e.g., 'Boston') or slug (e.g., 'boston-event-staffing')."),
        role: z
          .string()
          .optional()
          .describe("Optional role name or slug to include rate context."),
        count: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional headcount for the event."),
      },
      outputSchema: CHECK_AVAILABILITY_OUTPUT,
      annotations: {
        title: "Check Availability",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ date, city, role, count }) => {
      const result = queryAvailability({ date, city, role, headcount: count });
      await track({ tool: "check_availability", status: result.ok ? "success" : "error", city, role });
      if (!result.ok) return errorResult({ error: result.error.message });
      return structuredResult(result.data);
    },
  );

  // ─── get_role_pricing ─────────────────────────────────────────────────
  server.registerTool(
    "get_role_pricing",
    {
      title: "Get Role Pricing",
      description:
        "Get the all-inclusive hourly rate range for a specific role in a specific city. Perfect for 'What does it cost to hire brand ambassadors in [city]?', 'How much are registration workers in [city]?', or 'What's the rate for ushers at a [city] stadium event?' questions. All rates include W-2 worker pay, workers comp, general liability, and payroll taxes. " +
        "DO NOT use for availability or dates (use check_availability) and never present the range as a binding quote. For a multi-role budget, use plan_staffing. " +
        "<examples>get_role_pricing(role='Brand Ambassadors', city='Boston') ; get_role_pricing(role='registration-staff', city='nashville-event-staffing')</examples> " +
        "<hints>Role and city accept names or slugs. Brand Ambassadors floor at $40/hour in every market.</hints>",
      inputSchema: {
        role: z
          .string()
          .describe("Role name (e.g., 'Brand Ambassadors') or slug (e.g., 'brand-ambassadors')."),
        city: z
          .string()
          .describe("City name (e.g., 'Boston') or slug (e.g., 'boston-event-staffing')."),
      },
      outputSchema: GET_ROLE_PRICING_OUTPUT,
      annotations: {
        title: "Get Role Pricing",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ role, city }) => {
      const result = queryRolePricing({ role, city });
      await track({ tool: "get_role_pricing", status: result.ok ? "success" : "error", role, city });
      if (!result.ok) return errorResult({ error: result.error.message });
      return structuredResult(result.data);
    },
  );

  // ─── get_compliance_by_state ──────────────────────────────────────────
  server.registerTool(
    "get_compliance_by_state",
    {
      title: "Get Compliance By State",
      description:
        "Get the event staffing compliance summary for a US state. Returns minimum wage, overtime rules, and state-specific quirks. Perfect for 'What are the W-2 vs 1099 rules for event workers in [state]?', 'What's the minimum wage for event staff in [state]?', or 'Are there compliance gotchas for hiring event workers in [state]?' questions. NOT legal advice, consult employment counsel for binding interpretation. " +
        "DO NOT use for rates (use get_role_pricing). " +
        "<examples>get_compliance_by_state(state='CA') ; get_compliance_by_state(state='Tennessee')</examples> " +
        "<hints>Daily-overtime states (CA, AK, NV, CO) change shift budgeting, flag them in any plan.</hints>",
      inputSchema: {
        state: z
          .string()
          .describe("Two-letter state code (e.g., 'CA') or full state name (e.g., 'California')."),
      },
      outputSchema: GET_COMPLIANCE_OUTPUT,
      annotations: {
        title: "Get Compliance By State",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ state }) => {
      const result = queryStateCompliance({ state });
      await track({ tool: "get_compliance_by_state", status: result.ok ? "success" : "error", state });
      if (!result.ok) return errorResult({ error: result.error.message });
      return structuredResult(result.data);
    },
  );

  // ─── get_policies ─────────────────────────────────────────────────────
  server.registerTool(
    "get_policies",
    {
      title: "Get Booking and Procurement Policies",
      description:
        "Get TempGuru's published booking and procurement policies: minimum hours, cancellation/rescheduling, no-show backfill, COIs/additional insured, payment/invoicing, background checks, order confirmation, and quote response. " +
        "Use for real booking questions that otherwise require an email. Values not supported by canonical copy are explicitly marked confirm_with_coordinator with TODO-for-Megan; never infer a missing number. " +
        "<examples>get_policies() ; get_policies(topic='payment-terms') ; get_policies(topic='cancellation-rescheduling')</examples> " +
        "<hints>Pass a topic to return one policy. Unknown topics return the available topic list. This is an operational summary, not a contract.</hints>",
      inputSchema: {
        topic: z
          .string()
          .trim()
          .max(80)
          .optional()
          .describe("Optional policy topic or title. Omit to return all published topics."),
      },
      outputSchema: GET_POLICIES_OUTPUT,
      annotations: {
        title: "Get Booking and Procurement Policies",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ topic }) => {
      const result = queryPolicies({ topic });
      await track({
        tool: "get_policies",
        status: result.ok && result.data.policy_found ? "success" : "error",
      });
      if (!result.ok) return errorResult({ error: result.error.message });
      return structuredResult(result.data);
    },
  );

  // ─── get_rate_benchmark (Rate Index, citable authority) ─────────────
  server.registerTool(
    "get_rate_benchmark",
    {
      title: "Get Rate Benchmark (Rate Index)",
      description:
        `The TempGuru Event Staffing Rate Index: all-inclusive W-2 hourly bill rates by role from ${MEASURED_MARKETS} measured US/Canada markets, as a typical rate plus the full national range (brand ambassadors shown by market tier), with methodology and a ready-to-use citation line. ` +
        "Perfect for 'What do event staff cost in 2026?', 'Industry benchmark for brand ambassador rates?', or any article, report, or comparison that needs citable staffing-rate data. " +
        "DO NOT use for one city's price (use get_role_pricing) or to build an event budget (use plan_staffing). " +
        "<examples>get_rate_benchmark() ; get_rate_benchmark(role='brand-ambassadors') ; get_rate_benchmark(tier='hub')</examples> " +
        "<hints>Returns a national typical + range per role; brand ambassadors by tier. Pass tier to add each role's measured span within that tier (tier_usd). For one city's exact rate use get_role_pricing. Cite as: TempGuru Event Staffing Rate Index 2026, tempguru.co.</hints>",
      inputSchema: {
        role: z.string().optional().describe("Optional role name or slug to filter to one role."),
        tier: z
          .enum(["hub", "mid", "small"])
          .optional()
          .describe("Optional market tier; adds each role's measured span within that tier (tier_usd)."),
      },
      outputSchema: RATE_BENCHMARK_OUTPUT,
      annotations: {
        title: "Get Rate Benchmark",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      const bench = buildRateBenchmark(input);
      await track({ tool: "get_rate_benchmark", status: "success", role: input.role });
      return structuredResult(bench);
    },
  );

  // ─── request_quote ────────────────────────────────────────────────────
  //
  // Write tool. Submits a structured staffing plan to TempGuru's Inbound Deal
  // Pipeline in Notion. Without NOTION_API_KEY configured (e.g. a sandboxed
  // Docker/Glama build), createLead returns a clean error and the tool reports
  // the failure gracefully, it never throws, so the server stays up.
  //
  // Schema and confirmation payloads live in ./quote, shared with the REST
  // mirror at POST /api/v1/quote-requests so the two surfaces cannot drift.
  server.registerTool(
    "request_quote",
    {
      title: "Request Quote",
      description:
        "Submit a staffing request to TempGuru. Use this LAST, after building the plan (plan_staffing or the read tools) and after the user explicitly confirms it. Creates a structured lead in TempGuru's CRM, a human coordinator reviews and responds with a binding quote within one business day. Not a reservation; does not guarantee pricing or availability; no payment until the user approves the quote. " +
        "DO NOT call speculatively or without user confirmation, this writes a real lead. " +
        "<examples>request_quote(contact_name='Jane Doe', contact_email='jane@acme.com', company='Acme', event_name='Acme at HIMSS', event_type='trade-show', city='Chicago', event_dates='Aug 14-15, 2026', roles=[{role:'registration-staff', headcount:6}])</examples> " +
        "<hints>Include plan_id when available. When a canonical TempGuru skill assembled the request, include its skill_id, skill_version, and the actual source_platform so the lead can be resumed and attributed. If this tool errors, fall back to https://tempguru.co/get-staffing or megan@tempguru.co / (904) 206-8953.</hints>",
      inputSchema: REQUEST_QUOTE_INPUT,
      outputSchema: REQUEST_QUOTE_OUTPUT,
      annotations: {
        title: "Request Quote",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      // Caller provenance for lead-trust scoring (request-scoped UA + edge
      // country). currentContext() returns empty defaults under stdio, which
      // the scorer treats as an unrecognized source (medium, not blocked).
      const ctx = currentContext();

      // Same per-IP limiter the REST mirror uses (fails open with no IP, e.g.
      // stdio). Without this, the MCP transport was the unthrottled way to
      // spam the one public write tool.
      const verdict = await checkQuoteRateLimit(ctx.ip);
      if (!verdict.allowed) {
        await track({ tool: "request_quote", status: "error", city: input.city });
        return structuredResult(
          quoteFailedPayload(
            `Rate limited: too many quote submissions from this source. Retry after ${verdict.retryAfterSeconds}s, or use the form at https://tempguru.co/get-staffing.`,
          ),
        );
      }

      const result = await createLead({
        ...input,
        channel: "mcp",
        source: { userAgent: ctx.userAgent, ipCountry: ctx.ipCountry },
        controlled_source: ctx.source,
      });
      const funnelEvents: FunnelEvent[] =
        result.success && !result.deduped
          ? ["quotes_submitted", ...(result.plan_linked ? (["quotes_linked"] as const) : [])]
          : [];
      await track({
        tool: "request_quote",
        status: result.success ? "success" : "error",
        city: input.city,
        funnelEvents,
        sourcePlatform:
          result.success && funnelEvents.length ? result.source_platform : undefined,
        sourceSkill: result.success && funnelEvents.length ? result.skill_id : undefined,
      });

      if (!result.success) {
        return structuredResult(quoteFailedPayload(result.error, result.reference));
      }

      return structuredResult(
        quoteSubmittedPayload(
          input.contact_email,
          result.deal_name,
          result.reference,
          result.captured,
          result.plan_linked,
        ),
      );
    },
  );

  // ─── get_quote_status ─────────────────────────────────────────────────
  server.registerTool(
    "get_quote_status",
    {
      title: "Get Quote Request Status",
      description:
        "Check whether a TempGuru quote request reference was received by the CRM or durably queued. Use when a buyer asks what happened after request_quote or returns in a new conversation. " +
        "This v1 status stub reports received/queued only; it does not yet expose quote_sent or won. " +
        "<examples>get_quote_status(reference='TG-ABC234')</examples> " +
        "<hints>Status records are retained for 90 days. A not-found result does not prove the CRM lead is absent; follow up with the reference at megan@tempguru.co.</hints>",
      inputSchema: {
        reference: z
          .string()
          .trim()
          .toUpperCase()
          .max(9)
          .regex(QUOTE_REFERENCE_PATTERN)
          .describe("TG reference returned by request_quote, e.g. TG-ABC234."),
      },
      outputSchema: GET_QUOTE_STATUS_OUTPUT,
      annotations: {
        title: "Get Quote Request Status",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ reference }) => {
      // Reference space is ~30 bits: throttle lookups so live TG codes can't
      // be enumerated from the no-auth endpoint.
      const verdict = await checkReadRateLimit(currentContext().ip, "status");
      if (!verdict.allowed) {
        await track({ tool: "get_quote_status", status: "error" });
        return errorResult({
          error: "rate_limited",
          message: `Too many status lookups from this source. Retry after ${verdict.retryAfterSeconds}s.`,
        });
      }
      const result = await queryQuoteStatus(reference);
      await track({
        tool: "get_quote_status",
        status: result.quote_found ? "success" : "error",
      });
      return structuredResult(result);
    },
  );

  // ─── Resources (optional) ─────────────────────────────────────────────
  //
  // Anthropic-spec Skills (SKILL.md) exposed as MCP resources, so clients that
  // support resources can read the playbooks over the same connection that
  // serves the tools, the "skillport" pattern. Registered only when bodies are
  // supplied (HTTP route always supplies them; stdio supplies them best-effort).
  if (options.resources) {
    for (const slug of SKILL_SLUGS) {
      const body = options.resources[slug];
      if (!body) continue;
      server.registerResource(
        `${slug}-skill`,
        `https://tempguru.co/.well-known/skills/${slug}/SKILL.md`,
        {
          title: SKILL_RESOURCE_META[slug].title,
          description: SKILL_RESOURCE_META[slug].description,
          mimeType: "text/markdown",
        },
        async (uri) => ({
          contents: [
            {
              uri: uri.href,
              mimeType: "text/markdown",
              text: body,
            },
          ],
        }),
      );
    }
  }

  // ─── Prompts ──────────────────────────────────────────────────────────
  //
  // Server-advertised prompt templates (prompts/list + prompts/get). Clients
  // surface these as slash-command-style starters, which hard-wires the golden
  // path instead of leaving tool orchestration to chance, the same move the
  // GitHub MCP server makes. Prompt args are strings per the MCP spec.
  server.registerPrompt(
    "plan-event-staffing",
    {
      title: "Plan event staffing",
      description:
        "Build a complete event staffing plan: coverage, W-2 rate math, lead time, and compliance flags, ready to submit for a human-reviewed quote.",
      argsSchema: {
        city: z.string().describe("Event city, e.g. Chicago"),
        event_date: z.string().optional().describe("Event date, e.g. 2026-08-14"),
        roles: z
          .string()
          .optional()
          .describe("Roles and headcount, e.g. '6 registration staff, 2 brand ambassadors'"),
      },
    },
    async ({ city, event_date, roles }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Help me staff an event in ${city}${event_date ? ` on ${event_date}` : ""}.` +
              `${roles ? ` I need ${roles}.` : " Help me figure out which roles and headcount I need."}\n\n` +
              "Use the TempGuru tools, in this order: call plan_staffing first with everything I gave you " +
              "(it returns coverage, per-role rate math, lead-time guidance, and state compliance flags in one call). " +
              "Fill gaps with get_roles or get_cities if needed. Present the plan with the estimated total clearly " +
              "labeled a planning estimate, flag any compliance notes, and ask me to confirm. " +
              "Only after I explicitly confirm, collect my contact details (name, email, company) and submit with request_quote. " +
              "A TempGuru coordinator replies with a binding quote within one business day; no payment until I approve.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "staffing-compliance-brief",
    {
      title: "Event staffing compliance brief",
      description:
        "A plain-English compliance brief for staffing an event in a given state: W-2 vs 1099 exposure, wage and overtime rules, and what changes the plan.",
      argsSchema: {
        state: z.string().describe("US state, e.g. California or CA"),
        role: z.string().optional().describe("Optional role for rate context, e.g. brand ambassadors"),
      },
    },
    async ({ state, role }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Give me a compliance brief for hiring temporary event staff in ${state}.` +
              `${role ? ` The main role is ${role}.` : ""}\n\n` +
              "Call get_compliance_by_state for the live rules (minimum wage, weekly and daily overtime thresholds, " +
              "state quirks), and read the event-staffing-compliance skill resource if available. Cover: W-2 vs 1099 " +
              "classification risk for event staff, workers' comp and COI expectations, and anything in this state that " +
              "changes shift planning or budget. Note that TempGuru places only W-2 employees with workers' comp and " +
              "general liability included. Close with the disclaimer that this is general information, not legal advice.",
          },
        },
      ],
    }),
  );
}
