// TempGuru MCP server — read-only + write tools for AI agents.
//
// Exposes 6 tools:
//   - get_cities                 list all cities TempGuru serves (with tier)
//   - get_roles                  list all staffing roles with descriptions
//   - check_availability         deterministic lead-time guidance for a city/date
//   - get_role_pricing           rate range for a role in a specific city
//   - get_compliance_by_state    state-level employment compliance summary
//   - request_quote              submit a staffing plan → Notion Inbound Deal Pipeline
//
// Transport: streamable HTTP (MCP spec rev 2025-03-26). SSE disabled.
// Public endpoint: https://mcp.tempguru.co/mcp
//
// Business logic lives in @/lib/mcp/queries — the same functions are called
// from src/app/api/v1/*/route.ts to serve the public REST surface. The MCP
// route is intentionally thin: each tool calls a query function and wraps
// the resulting data shape in jsonContent. No behavior drift between MCP
// and REST is possible because there is no behavior here to drift.

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  queryCities,
  queryRoles,
  queryAvailability,
  queryRolePricing,
  queryStateCompliance,
  type CityTier,
} from "@/lib/mcp/queries";
import { runWithContext, currentContext } from "@/lib/telemetry/context";
import { track } from "@/lib/telemetry/track";
import { createLead } from "@/lib/notion/create-lead";

// ─── Skill resource content ───────────────────────────────────────────────
//
// Both SKILL.md files are loaded once at module-init time and served as MCP
// resources. Source-of-truth is /content/skills/*.md in this repo, kept in
// sync with the canonical files at tempguru.co/.well-known/skills/<name>/SKILL.md.
//
// Loading at module-init (not per-request) avoids filesystem reads on every
// resources/read call. Vercel's Fluid Compute reuses module state across
// requests, so the read happens once per cold start.
const SKILLS_DIR = join(process.cwd(), "content", "skills");
const ORDERING_SKILL = readFileSync(join(SKILLS_DIR, "event-staffing-ordering.md"), "utf-8");
const COMPLIANCE_SKILL = readFileSync(join(SKILLS_DIR, "event-staffing-compliance.md"), "utf-8");

// ─── Helpers ──────────────────────────────────────────────────────────────

function jsonContent(obj: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(obj, null, 2),
      },
    ],
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    // ─── get_cities ─────────────────────────────────────────────────────
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
        annotations: {
          title: "Get Cities",
          readOnlyHint: true,
        },
      },
      async ({ state, tier }) => {
        const result = queryCities({ state, tier: tier as CityTier | undefined });
        const ctx = currentContext();
        track({
          tool: "get_cities",
          userAgent: ctx.userAgent,
          ipCountry: ctx.ipCountry,
          status: result.ok ? "success" : "error",
          state,
        });
        if (!result.ok) return jsonContent({ error: result.error.message });
        return jsonContent(result.data);
      },
    );

    // ─── get_roles ──────────────────────────────────────────────────────
    server.registerTool(
      "get_roles",
      {
        title: "Get Roles",
        description:
          "List event staffing roles TempGuru provides, with descriptions and skill tiers. Perfect for 'What kinds of event workers can I hire?', 'What roles do you staff for trade shows / festivals / corporate events?', or 'Do you have brand ambassadors?' questions.",
        inputSchema: {},
        annotations: {
          title: "Get Roles",
          readOnlyHint: true,
        },
      },
      async () => {
        const result = queryRoles();
        const ctx = currentContext();
        track({
          tool: "get_roles",
          userAgent: ctx.userAgent,
          ipCountry: ctx.ipCountry,
          status: result.ok ? "success" : "error",
        });
        if (!result.ok) return jsonContent({ error: result.error.message });
        return jsonContent(result.data);
      },
    );

    // ─── check_availability ─────────────────────────────────────────────
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
        annotations: {
          title: "Check Availability",
          readOnlyHint: true,
        },
      },
      async ({ date, city, role, count }) => {
        const result = queryAvailability({ date, city, role, headcount: count });
        const ctx = currentContext();
        track({
          tool: "check_availability",
          userAgent: ctx.userAgent,
          ipCountry: ctx.ipCountry,
          status: result.ok ? "success" : "error",
          city,
          role,
        });
        if (!result.ok) return jsonContent({ error: result.error.message });
        return jsonContent(result.data);
      },
    );

    // ─── get_role_pricing ───────────────────────────────────────────────
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
        annotations: {
          title: "Get Role Pricing",
          readOnlyHint: true,
        },
      },
      async ({ role, city }) => {
        const result = queryRolePricing({ role, city });
        const ctx = currentContext();
        track({
          tool: "get_role_pricing",
          userAgent: ctx.userAgent,
          ipCountry: ctx.ipCountry,
          status: result.ok ? "success" : "error",
          role,
          city,
        });
        if (!result.ok) return jsonContent({ error: result.error.message });
        return jsonContent(result.data);
      },
    );

    // ─── get_compliance_by_state ────────────────────────────────────────
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
        annotations: {
          title: "Get Compliance By State",
          readOnlyHint: true,
        },
      },
      async ({ state }) => {
        const result = queryStateCompliance({ state });
        const ctx = currentContext();
        track({
          tool: "get_compliance_by_state",
          userAgent: ctx.userAgent,
          ipCountry: ctx.ipCountry,
          status: result.ok ? "success" : "error",
          state,
        });
        if (!result.ok) return jsonContent({ error: result.error.message });
        return jsonContent(result.data);
      },
    );

    // ─── request_quote ──────────────────────────────────────────────────
    //
    // Write tool. Submits a structured staffing plan to TempGuru's Inbound
    // Deal Pipeline in Notion. TempGuru responds with a manual quote within
    // one business day. Does NOT create a contract or reservation.

    server.tool(
      "request_quote",
      "Submit a staffing request to TempGuru. Use this after confirming city coverage, role pricing, and availability with the other tools. Creates a structured lead in TempGuru's CRM — a human coordinator will review and respond with a quote within one business day. Not a reservation; does not guarantee pricing or availability.",
      {
        contact_name: z.string().describe("Full name of the contact person"),
        contact_email: z.string().email().describe("Contact email address for the quote response"),
        company: z.string().describe("Company or organization name"),
        event_name: z.string().describe("Name of the event (e.g. 'HIMSS 2026', 'Brand Fest Austin')"),
        event_type: z.string().describe("Event type: trade-show, conference, festival, concert, sporting-event, corporate, brand-activation, or other"),
        city: z.string().describe("City where the event is held"),
        event_dates: z.string().describe("Event dates as a human-readable string, e.g. 'June 15–17, 2026'"),
        roles: z.array(
          z.object({
            role: z.string().describe("Staffing role name, e.g. brand-ambassadors, registration-staff"),
            headcount: z.number().int().positive().describe("Number of staff needed"),
            shifts: z.string().optional().describe("Shift description, e.g. '2 days × 8h'"),
          })
        ).describe("Roles and headcount needed for the event"),
        budget_range: z.string().optional().describe("Estimated total budget range if calculated, e.g. '$8,400–$12,600'"),
        attire: z.string().optional().describe("Staff attire requirements"),
        special_requirements: z.string().optional().describe("Any special requirements: language skills, certifications, overnight shifts, etc."),
        compliance_notes: z.string().optional().describe("Any compliance flags surfaced by get_compliance_by_state"),
      },
      {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      async (input) => {
        const ctx = currentContext();
        const result = await createLead(input);

        track({
          tool: "request_quote",
          userAgent: ctx.userAgent,
          ipCountry: ctx.ipCountry,
          status: result.success ? "success" : "error",
          city: input.city,
        });

        if (!result.success) {
          return jsonContent({
            submitted: false,
            error: result.error,
            message: "Submission failed. Please have the user contact TempGuru directly at megan@tempguru.co or (904) 206-8953.",
          });
        }

        return jsonContent({
          submitted: true,
          deal_name: result.deal_name,
          message: "Your staffing request has been submitted to TempGuru. A coordinator will review the details and respond with a quote within one business day. Orders are confirmed within 48 hours of approval. Contact megan@tempguru.co or (904) 206-8953 for urgent requests.",
          next_steps: [
            "Watch for a quote email at " + input.contact_email,
            "TempGuru may follow up to confirm shift details or attire",
            "No payment or commitment is required until you approve the quote",
          ],
        });
      },
    );

    // ─── Resources ──────────────────────────────────────────────────────
    //
    // Two Anthropic-spec-compliant Skills (SKILL.md files) exposed as MCP
    // resources. Clients that support resources (Claude.ai, Claude Code,
    // Claude Desktop, Cursor, most MCP clients) can read the playbook
    // through the same connection that provides the tools — no separate
    // skill-installation step required.
    //
    // The "skillport" pattern: bundle the skills with the data pipe.

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
            text: ORDERING_SKILL,
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
            text: COMPLIANCE_SKILL,
          },
        ],
      }),
    );
  },
  {
    // mcp-handler v1.1.0's serverInfo type only exposes `name` and `version`,
    // but the value is passed verbatim into the MCP SDK's `new McpServer(...)`,
    // whose Implementation/BaseMetadata shape accepts the wider set defined by
    // MCP spec rev 2025-03-26: title, description, icons. Casting through
    // `as { name: string; version: string }` keeps the call type-correct from
    // mcp-handler's perspective while still passing the extra fields through
    // to the SDK at runtime. Surfaces these in registry scanners (Smithery,
    // ClawHub) and Claude.ai connector listings.
    serverInfo: {
      name: "tempguru-mcp",
      version: "1.0.0",
      title: "TempGuru Event Staffing",
      description:
        "W-2 event staffing data for AI agents: 300+ US/CA markets, brand ambassadors, registration, hospitality, setup/breakdown. Read-only — coverage, rates, lead times, and state compliance summaries. No authentication required.",
      icons: [
        {
          src: "https://mcp.tempguru.co/logo.svg",
          mimeType: "image/svg+xml",
          // sizes must be an array per MCP spec rev 2025-03-26 (and Glama's
          // strict validator) — single string "any" was rejected with:
          // { expected: 'array', code: 'invalid_type', path: ['serverInfo',
          //   'icons', 0, 'sizes'], message: 'Invalid input' }
          sizes: ["any"],
        },
      ],
    } as { name: string; version: string },
  },
  {
    // Endpoint at /mcp (default streamableHttpEndpoint with empty basePath)
    verboseLogs: process.env.NODE_ENV !== "production",
    disableSse: true, // SSE removed from MCP spec 2025-03-26
    maxDuration: 60,
  },
);

// ─── Accept header normalization wrapper ────────────────────────────────
//
// mcp-handler enforces the MCP spec rev 2025-03-26 requirement that
// clients MUST send `Accept: application/json, text/event-stream`. Real-
// world clients (Anthropic's claude.ai connectors among them) often send
// only `application/json` and get a 406 — which surfaces as "This connector
// has no tools available" with no further diagnostic.
//
// We rewrite the incoming Accept header to include both content types when
// either is missing, so the downstream handler always sees a spec-compliant
// request. Responses are unchanged (SSE-framed), which any compliant MCP
// client handles correctly.
//
// Remove this wrapper when mcp-handler upgrades to the 2026-07-28 spec
// (stateless protocol — Accept enforcement is relaxed in that revision).

// ─── CORS headers ──────────────────────────────────────────────────────
//
// Glama's health checker, in-browser MCP clients (Claude.ai connector
// surface, future web-based MCP playgrounds), and any directory scanner
// that probes from a browser context all require CORS preflight to
// succeed before the actual request lands.
//
// Until 2026-06-04 ~04:30 UTC the route returned 204 to OPTIONS without
// Access-Control-* headers — mcp-handler's built-in OPTIONS handler does
// the bare minimum. That looked fine to server-to-server clients
// (Anthropic's connectors, Smithery's scanner, our own curl probes) but
// silently failed Glama's browser-context health probe, which surfaced
// as a generic "unhealthy" status with no diagnostic.
//
// Wide-open CORS is correct for this server: no auth, no sensitive
// data, no per-client config, no credentialed requests. Allow-list any
// origin, expose the MCP-Session-Id and Last-Event-ID headers used by
// streamable HTTP, and apply on every response — including OPTIONS
// preflights.

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers":
    "Content-Type, Accept, Mcp-Session-Id, Last-Event-ID, Authorization",
  "access-control-expose-headers": "Mcp-Session-Id, WWW-Authenticate",
  "access-control-max-age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function withAcceptNormalization(request: Request): Promise<Response> {
  // Short-circuit OPTIONS preflights with a CORS-only 204 — no need to
  // run them through the MCP handler.
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  // Bind per-request context (User-Agent + Vercel IP-country header) so
  // each tool handler can record telemetry without threading the request.
  const ctx = {
    userAgent: request.headers.get("user-agent") ?? "",
    ipCountry: request.headers.get("x-vercel-ip-country") ?? "",
  };

  return runWithContext(ctx, async () => {
    const accept = request.headers.get("accept") ?? "";

    if (accept.includes("application/json") && accept.includes("text/event-stream")) {
      return withCors(await handler(request));
    }

    // Clone the request with a normalized Accept header. Body must be read first
    // because Request bodies are one-shot streams under Node's fetch.
    const normalizedHeaders = new Headers(request.headers);
    normalizedHeaders.set("accept", "application/json, text/event-stream");

    let body: BodyInit | null = null;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.text();
    }

    const normalized = new Request(request.url, {
      method: request.method,
      headers: normalizedHeaders,
      body,
    });

    return withCors(await handler(normalized));
  });
}

export {
  withAcceptNormalization as GET,
  withAcceptNormalization as POST,
  withAcceptNormalization as DELETE,
  withAcceptNormalization as OPTIONS,
};
