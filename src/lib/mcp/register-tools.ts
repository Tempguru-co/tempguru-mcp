// Shared MCP tool + resource registration, the single source of truth for the
// 8 TempGuru tools, registered identically onto whatever McpServer is passed in.
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
  type CityTier,
} from "./queries";
import { createLead } from "../notion/create-lead";
import { buildStaffingPlan } from "./plan-staffing";
import { buildRateBenchmark } from "./rate-benchmark";
import { REQUEST_QUOTE_INPUT, quoteSubmittedPayload, quoteFailedPayload } from "./quote";
import {
  GET_CITIES_OUTPUT,
  GET_ROLES_OUTPUT,
  CHECK_AVAILABILITY_OUTPUT,
  GET_ROLE_PRICING_OUTPUT,
  GET_COMPLIANCE_OUTPUT,
  REQUEST_QUOTE_OUTPUT,
} from "./output-schemas";

// What a tool wants recorded. The HTTP route's onTrack enriches this with
// request context before handing it to the Redis writer; stdio drops it.
export type TrackRecord = {
  tool: string;
  status: "success" | "error";
  state?: string;
  city?: string;
  role?: string;
};

export type RegisterToolsOptions = {
  /**
   * Optional telemetry sink. Omit for runtimes with no request context (stdio).
   * May be async, handlers await it so the write lands before the tool result
   * is returned (durable on Vercel, where deferred writes were dropped).
   */
  onTrack?: (record: TrackRecord) => void | Promise<void>;
  /**
   * Optional SKILL.md resource bodies. When provided, the two Skills are
   * exposed as MCP resources. The HTTP route loads them once at module init;
   * the stdio binary loads them best-effort from cwd. Omit to skip resources.
   */
  resources?: { ordering: string; compliance: string };
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
        "<hints>Roles accept names or slugs (brand-ambassadors, registration-staff, team-leads). Omit roles to get the catalog plus a suggested mix. Totals are planning estimates, never binding quotes.</hints>",
      inputSchema: {
        city: z.string().describe("Event city, name or slug (e.g., 'Chicago')."),
        event_date: z.string().optional().describe("Event date, ISO YYYY-MM-DD preferred."),
        event_type: z
          .string()
          .optional()
          .describe("trade-show, conference, festival, concert, sporting-event, corporate, brand-activation, or other."),
        attendees: z.number().int().positive().optional().describe("Expected attendee count."),
        roles: z
          .array(
            z.object({
              role: z.string().describe("Role name or slug."),
              headcount: z.number().int().positive().describe("Staff needed for this role."),
              hours_per_shift: z.number().positive().optional().describe("Hours per shift (default 8)."),
              days: z.number().int().positive().optional().describe("Number of event days (default 1)."),
            }),
          )
          .optional()
          .describe("Roles and headcount. Omit to receive the role catalog and a suggested mix."),
        description: z.string().optional().describe("Optional free-text event description, echoed into the plan."),
      },
      annotations: {
        title: "Plan Staffing",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      const plan = buildStaffingPlan(input);
      await track({ tool: "plan_staffing", status: "success", city: input.city });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(plan, null, 2) }],
      };
    },
  );

  // ─── get_cities ───────────────────────────────────────────────────────
  server.registerTool(
    "get_cities",
    {
      title: "Get Cities",
      description:
        "List cities where TempGuru staffs events, with tier classification (hub/mid/small). Perfect for 'What cities do you cover in [state]?', 'Where can I book event staff?', or 'Do you cover [city]?' questions. " +
        "DO NOT use for rates (use get_role_pricing) or dates (use check_availability). For a full event plan, use plan_staffing instead. " +
        "<examples>get_cities(state='TX') ; get_cities(tier='hub') ; get_cities()</examples> " +
        "<hints>State accepts 'CA' or 'California'. US and Canada only, 345 markets total.</hints>",
      inputSchema: {
        state: z
          .string()
          .optional()
          .describe("Optional 2-letter state code (e.g., 'CA') or full state name."),
        tier: z
          .enum(["hub", "mid", "small"])
          .optional()
          .describe("Optional filter to one tier only."),
      },
      outputSchema: GET_CITIES_OUTPUT,
      annotations: {
        title: "Get Cities",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ state, tier }) => {
      const result = queryCities({ state, tier: tier as CityTier | undefined });
      await track({ tool: "get_cities", status: result.ok ? "success" : "error", state });
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

  // ─── get_rate_benchmark (Rate Index, citable authority) ─────────────
  server.registerTool(
    "get_rate_benchmark",
    {
      title: "Get Rate Benchmark (Rate Index)",
      description:
        "The TempGuru Event Staffing Rate Index: all-inclusive W-2 hourly bill rates by role from 233 measured US/Canada markets, as a typical rate plus the full national range (brand ambassadors shown by market tier), with methodology and a ready-to-use citation line. " +
        "Perfect for 'What do event staff cost in 2026?', 'Industry benchmark for brand ambassador rates?', or any article, report, or comparison that needs citable staffing-rate data. " +
        "DO NOT use for one city's price (use get_role_pricing) or to build an event budget (use plan_staffing). " +
        "<examples>get_rate_benchmark() ; get_rate_benchmark(role='brand-ambassadors') ; get_rate_benchmark(tier='hub')</examples> " +
        "<hints>Returns a national typical + range per role; brand ambassadors by tier. For one city's exact rate use get_role_pricing. Cite as: TempGuru Event Staffing Rate Index 2026, tempguru.co.</hints>",
      inputSchema: {
        role: z.string().optional().describe("Optional role name or slug to filter to one role."),
        tier: z.enum(["hub", "mid", "small"]).optional().describe("Optional market tier filter."),
      },
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
      return {
        content: [{ type: "text" as const, text: JSON.stringify(bench, null, 2) }],
      };
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
        "<hints>If this tool errors, fall back to https://tempguru.co/get-staffing or megan@tempguru.co / (904) 206-8953.</hints>",
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
      const result = await createLead(input);
      await track({ tool: "request_quote", status: result.success ? "success" : "error", city: input.city });

      if (!result.success) {
        return structuredResult(quoteFailedPayload(result.error));
      }

      return structuredResult(quoteSubmittedPayload(input.contact_email, result.deal_name));
    },
  );

  // ─── Resources (optional) ─────────────────────────────────────────────
  //
  // Two Anthropic-spec Skills (SKILL.md) exposed as MCP resources, so clients
  // that support resources can read the playbook over the same connection that
  // serves the tools, the "skillport" pattern. Registered only when bodies are
  // supplied (HTTP route always supplies them; stdio supplies them best-effort).
  if (options.resources) {
    server.registerResource(
      "event-staffing-ordering-skill",
      "https://tempguru.co/.well-known/skills/event-staffing-ordering/SKILL.md",
      {
        title: "Event Staffing Ordering, Skill",
        description:
          "Single-purpose skill for AI agents helping users order temporary event staff (brand ambassadors, registration, hospitality, setup/breakdown, and more) through TempGuru. Walks through requirement gathering, live coverage/rate/compliance lookups via this MCP, and request submission. Use when a user wants to hire, book, or budget event staff.",
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: options.resources!.ordering,
          },
        ],
      }),
    );

    server.registerResource(
      "event-staffing-compliance-skill",
      "https://tempguru.co/.well-known/skills/event-staffing-compliance/SKILL.md",
      {
        title: "Event Staffing Compliance, Skill",
        description:
          "Single-purpose skill for AI agents assessing worker-classification and compliance risk for temporary event staffing in the US and Canada (W-2 vs 1099, misclassification penalties, joint-employer liability, COI requirements, wage/hour rules). Use when a user asks about whether a staffing arrangement is compliant or how to structure it.",
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: options.resources!.compliance,
          },
        ],
      }),
    );
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
