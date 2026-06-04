// TempGuru MCP server — read-only tools for AI agents.
//
// Exposes 5 tools:
//   - get_cities                 list all cities TempGuru serves (with tier)
//   - get_roles                  list all staffing roles with descriptions
//   - check_availability         deterministic lead-time guidance for a city/date
//   - get_role_pricing           rate range for a role in a specific city
//   - get_compliance_by_state    state-level employment compliance summary
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
import {
  queryCities,
  queryRoles,
  queryAvailability,
  queryRolePricing,
  queryStateCompliance,
  type CityTier,
} from "@/lib/mcp/queries";

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
        if (!result.ok) return jsonContent({ error: result.error.message });
        return jsonContent(result.data);
      },
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
          sizes: "any",
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

async function withAcceptNormalization(request: Request): Promise<Response> {
  const accept = request.headers.get("accept") ?? "";
  const wantsJson = accept.includes("application/json") || accept.includes("*/*") || accept === "";
  const wantsSse = accept.includes("text/event-stream") || accept.includes("*/*") || accept === "";

  if (wantsJson && wantsSse && accept.includes("application/json") && accept.includes("text/event-stream")) {
    return handler(request);
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

  return handler(normalized);
}

export {
  withAcceptNormalization as GET,
  withAcceptNormalization as POST,
  withAcceptNormalization as DELETE,
};
