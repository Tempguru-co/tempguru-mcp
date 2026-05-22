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
// No auth on v1 — all tools return public data equivalent to what's on
// tempguru.co. When write tools land in Phase 2c, switch to withMcpAuth().

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  CITIES,
  ROLES,
  PRICING,
  PRICING_META,
  STATES,
  STATE_META,
  findCity,
  findRole,
  findState,
  type CityTier,
} from "@/lib/mcp/data";

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

/** Lead time (in hours) by city tier. */
const LEAD_TIME_HOURS: Record<CityTier, number> = {
  hub: 48,
  mid: 72,
  small: 168, // 1 week
};

function recommendationLabel(daysUntilEvent: number, leadHours: number) {
  const hoursUntil = daysUntilEvent * 24;
  if (hoursUntil >= leadHours * 2) return "yes";
  if (hoursUntil >= leadHours) return "tight";
  if (hoursUntil >= 24) return "rush";
  return "very-rush";
}

// ─── Handler ──────────────────────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    // ─── get_cities ─────────────────────────────────────────────────────
    server.tool(
      "get_cities",
      "List all cities TempGuru serves, with tier classification (hub/mid/small). Optional filter by state or tier.",
      {
        state: z
          .string()
          .optional()
          .describe("Optional 2-letter state code (e.g., 'CA') or full state name."),
        tier: z
          .enum(["hub", "mid", "small"])
          .optional()
          .describe("Optional filter to one tier only."),
      },
      async ({ state, tier }) => {
        let result = CITIES;
        if (tier) {
          result = result.filter((c) => c.tier === tier);
        }
        if (state) {
          const s = state.trim().toUpperCase();
          const sLower = state.trim().toLowerCase();
          result = result.filter(
            (c) =>
              c.state_abbr === s || c.state.toLowerCase() === sLower,
          );
        }
        return jsonContent({
          total: result.length,
          tier_breakdown: {
            hub: result.filter((c) => c.tier === "hub").length,
            mid: result.filter((c) => c.tier === "mid").length,
            small: result.filter((c) => c.tier === "small").length,
          },
          cities: result.map((c) => ({
            slug: c.slug,
            name: c.name,
            state: c.state,
            state_abbr: c.state_abbr,
            country: c.country,
            tier: c.tier,
            url: `https://tempguru.co/insights/${c.slug}`,
          })),
        });
      },
    );

    // ─── get_roles ──────────────────────────────────────────────────────
    server.tool(
      "get_roles",
      "List all event staffing roles TempGuru provides, with descriptions and skill tiers.",
      {},
      async () => {
        return jsonContent({
          total: ROLES.length,
          roles: ROLES.map((r) => ({
            ...r,
            url: `https://tempguru.co/insights/${r.slug}-in-new-york-city`,
          })),
        });
      },
    );

    // ─── check_availability ─────────────────────────────────────────────
    server.tool(
      "check_availability",
      "Check expected staffing availability for an event. Returns lead-time guidance based on city tier and how far out the event is. Not a real-time inventory check — TempGuru staffs to demand via a 100,000+ worker W-2 network across 300+ markets.",
      {
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
      async ({ date, city, role, count }) => {
        const cityMatch = findCity(city);
        if (!cityMatch) {
          return jsonContent({
            city_found: false,
            requested: city,
            message: `TempGuru does not have a dedicated city page for "${city}". We serve 300+ markets — contact us at https://tempguru.co/get-staffing for coverage confirmation.`,
          });
        }

        const eventDate = new Date(date);
        if (isNaN(eventDate.getTime())) {
          return jsonContent({
            city_found: true,
            city: cityMatch.name,
            error: `Invalid date: "${date}". Expected ISO format (YYYY-MM-DD) or recognizable date string.`,
          });
        }

        const now = new Date();
        const daysUntilEvent = Math.ceil(
          (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const leadHours = LEAD_TIME_HOURS[cityMatch.tier];
        const recommendation = recommendationLabel(daysUntilEvent, leadHours);

        const roleMatch = role ? findRole(role) : null;
        const pricing = roleMatch ? PRICING[roleMatch.slug]?.[cityMatch.tier] : null;

        return jsonContent({
          city_found: true,
          city: cityMatch.name,
          state: cityMatch.state,
          city_tier: cityMatch.tier,
          event_date: eventDate.toISOString().slice(0, 10),
          days_until_event: daysUntilEvent,
          typical_lead_time_hours: leadHours,
          recommendation,
          role: roleMatch
            ? {
                name: roleMatch.name,
                rate_range_usd: pricing,
                all_inclusive: "Workers comp, liability, payroll taxes included.",
              }
            : null,
          count: count ?? null,
          notes: [
            `${cityMatch.name} is a ${cityMatch.tier}-tier market.`,
            `Typical lead time for ${cityMatch.tier} cities: ${leadHours} hours.`,
            daysUntilEvent < 0
              ? "Event date is in the past."
              : `Event is ${daysUntilEvent} days out — ${recommendation} window.`,
            "To book, visit https://tempguru.co/get-staffing or request a quote via the dashboard.",
          ],
        });
      },
    );

    // ─── get_role_pricing ───────────────────────────────────────────────
    server.tool(
      "get_role_pricing",
      "Get all-inclusive hourly rate range for a specific role in a specific city. Returns a range (low–high) reflecting event type and shift variability. All rates include W-2 worker pay, workers comp, general liability, and payroll taxes.",
      {
        role: z
          .string()
          .describe("Role name (e.g., 'Brand Ambassadors') or slug (e.g., 'brand-ambassadors')."),
        city: z
          .string()
          .describe("City name (e.g., 'Boston') or slug (e.g., 'boston-event-staffing')."),
      },
      async ({ role, city }) => {
        const roleMatch = findRole(role);
        if (!roleMatch) {
          return jsonContent({
            role_found: false,
            requested: role,
            available_roles: ROLES.map((r) => ({ slug: r.slug, name: r.name })),
          });
        }
        const cityMatch = findCity(city);
        if (!cityMatch) {
          return jsonContent({
            city_found: false,
            requested: city,
            role: roleMatch.name,
            fallback_pricing: PRICING[roleMatch.slug],
            note: "City not in TempGuru's 345-page footprint. Showing pricing across all tiers as fallback.",
          });
        }
        const pricing = PRICING[roleMatch.slug];
        if (!pricing) {
          return jsonContent({
            error: `No pricing data for role "${roleMatch.slug}".`,
          });
        }
        const tierPricing = pricing[cityMatch.tier];
        return jsonContent({
          role: roleMatch.name,
          role_slug: roleMatch.slug,
          city: cityMatch.name,
          state: cityMatch.state,
          city_tier: cityMatch.tier,
          hourly_range_low: tierPricing.low,
          hourly_range_high: tierPricing.high,
          currency: cityMatch.country === "CA" ? "CAD" : "USD",
          all_inclusive:
            "Workers comp, general liability, and payroll taxes (FICA/FUTA/SUTA) included.",
          tier_definition: PRICING_META.tier_definitions[cityMatch.tier],
          all_tiers_for_context: pricing,
          pricing_notes: PRICING_META.notes,
        });
      },
    );

    // ─── get_compliance_by_state ────────────────────────────────────────
    server.tool(
      "get_compliance_by_state",
      "Get event staffing compliance summary for a US state. Returns minimum wage, overtime rules, and state-specific quirks. NOT legal advice — consult employment counsel for binding interpretation.",
      {
        state: z
          .string()
          .describe("Two-letter state code (e.g., 'CA') or full state name (e.g., 'California')."),
      },
      async ({ state }) => {
        const match = findState(state);
        if (!match) {
          return jsonContent({
            state_found: false,
            requested: state,
            available_states: Object.entries(STATES).map(([abbr, data]) => ({
              abbr,
              name: data.name,
            })),
          });
        }
        return jsonContent({
          state: match.data.name,
          state_abbr: match.abbr,
          min_wage_usd: match.data.min_wage,
          w2_required: true,
          w2_note: "TempGuru classifies ALL workers as W-2 employees regardless of state.",
          overtime_threshold_weekly_hours: match.data.overtime_weekly,
          overtime_threshold_daily_hours: match.data.overtime_daily,
          unique_rules: match.data.unique_rules,
          liability_coverage_included: true,
          workers_comp_included: true,
          citation_note: STATE_META.citation_note,
        });
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
