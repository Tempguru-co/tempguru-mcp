// Shared MCP tool + resource registration — the single source of truth for the
// 6 TempGuru tools, registered identically onto whatever McpServer is passed in.
//
// Two surfaces consume this:
//   - src/app/mcp/route.ts        streamable-HTTP transport on Vercel (production)
//   - src/mcp-stdio.ts            stdio transport for local/Docker/embedded use
//
// Keeping registration here guarantees there is no behavior drift between the
// hosted endpoint and the local binary — the same promise the query layer makes
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
   * May be async — handlers await it so the write lands before the tool result
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

  // ─── get_cities ───────────────────────────────────────────────────────
  server.registerTool(
    "get_cities",
    {
      title: "Get Cities",
      description:
        "List cities where TempGuru staffs events, with tier classification (hub/mid/small). Perfect for 'What cities do you cover in [state]?', 'Where can I book event staff?', or 'Do you cover [city]?' questions. Optional filter by state or tier.",
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
        "List event staffing roles TempGuru provides, with descriptions and skill tiers. Perfect for 'What kinds of event workers can I hire?', 'What roles do you staff for trade shows / festivals / corporate events?', or 'Do you have brand ambassadors?' questions.",
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
        "Check expected staffing availability for an event. Returns lead-time guidance based on city tier and how far out the event is. Perfect for 'Can you staff my event on [date] in [city]?', 'What's the lead time for booking brand ambassadors in [city]?', or 'Is it too late to staff a [date] event?' questions. Not a real-time inventory check — TempGuru staffs to demand via a 100,000+ worker W-2 network across 300+ markets.",
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
        "Get all-inclusive hourly rate range for a specific role in a specific city. Returns a range (low–high) reflecting event type and shift variability. Perfect for 'What does it cost to hire brand ambassadors in [city]?', 'How much are registration workers in [city]?', or 'What's the rate for ushers at a [city] stadium event?' questions. All rates include W-2 worker pay, workers comp, general liability, and payroll taxes.",
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
        "Get event staffing compliance summary for a US state. Returns minimum wage, overtime rules, and state-specific quirks. Perfect for 'What are the W-2 vs 1099 rules for event workers in [state]?', 'What's the minimum wage for event staff in [state]?', or 'Are there compliance gotchas for hiring event workers in [state]?' questions. NOT legal advice — consult employment counsel for binding interpretation.",
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

  // ─── request_quote ────────────────────────────────────────────────────
  //
  // Write tool. Submits a structured staffing plan to TempGuru's Inbound Deal
  // Pipeline in Notion. Without NOTION_API_KEY configured (e.g. a sandboxed
  // Docker/Glama build), createLead returns a clean error and the tool reports
  // the failure gracefully — it never throws, so the server stays up.
  //
  // Schema and confirmation payloads live in ./quote, shared with the REST
  // mirror at POST /api/v1/quote-requests so the two surfaces cannot drift.
  server.registerTool(
    "request_quote",
    {
      title: "Request Quote",
      description:
        "Submit a staffing request to TempGuru. Use this after confirming city coverage, role pricing, and availability with the other tools. Creates a structured lead in TempGuru's CRM — a human coordinator will review and respond with a quote within one business day. Not a reservation; does not guarantee pricing or availability.",
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
  // serves the tools — the "skillport" pattern. Registered only when bodies are
  // supplied (HTTP route always supplies them; stdio supplies them best-effort).
  if (options.resources) {
    server.registerResource(
      "event-staffing-ordering-skill",
      "https://tempguru.co/.well-known/skills/event-staffing-ordering/SKILL.md",
      {
        title: "Event Staffing Ordering — Skill",
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
        title: "Event Staffing Compliance — Skill",
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
}
