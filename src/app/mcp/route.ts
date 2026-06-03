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
          "List all cities TempGuru serves, with tier classification (hub/mid/small). Optional filter by state or tier.",
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
          "List all event staffing roles TempGuru provides, with descriptions and skill tiers.",
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
          "Check expected staffing availability for an event. Returns lead-time guidance based on city tier and how far out the event is. Not a real-time inventory check — TempGuru staffs to demand via a 100,000+ worker W-2 network across 300+ markets.",
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
          "Get all-inclusive hourly rate range for a specific role in a specific city. Returns a range (low–high) reflecting event type and shift variability. All rates include W-2 worker pay, workers comp, general liability, and payroll taxes.",
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
          "Get event staffing compliance summary for a US state. Returns minimum wage, overtime rules, and state-specific quirks. NOT legal advice — consult employment counsel for binding interpretation.",
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
    serverInfo: {
      name: "tempguru-mcp",
      version: "1.0.0",
    },
  },
  {
    // Endpoint at /mcp (default streamableHttpEndpoint with empty basePath)
    verboseLogs: process.env.NODE_ENV !== "production",
    disableSse: true, // SSE removed from MCP spec 2025-03-26
    maxDuration: 60,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
