// MCP outputSchema definitions for 6 of the 8 MCP tools (plan_staffing and get_rate_benchmark omit one), structured-output support
// (spec rev 2025-06-18). Clients like ChatGPT Apps use these to render and
// ground tool results ("Output schema recommended" flag in the app console).
//
// CRITICAL CONTRACT: these schemas must accept EVERY shape the query layer
// returns as a successful result. queries.ts deliberately returns "expected
// miss" states (city/role/state not found, invalid date) as success variants,
// not errors, so each schema below is the FLATTENED union of its tool's
// variants, with a discriminator field and everything else optional. The SDK
// validates structuredContent against these on every call; a mismatch turns a
// working tool into a broken one, so when queries.ts shapes change, change
// this file in the same commit.
//
// Protocol errors (result.ok === false, unreachable in practice because the
// zod input schemas catch bad params first) are returned with isError: true,
// which exempts them from output validation.

import { z } from "zod";

const PRICE_BAND = z
  .object({
    low: z.number().describe("Lower end of the hourly rate range."),
    high: z.number().describe("Upper end of the hourly rate range."),
  })
  .describe("All-inclusive hourly rate band (worker pay + payroll taxes + workers comp + liability).");

const ALL_TIERS = z
  .object({ small: PRICE_BAND, mid: PRICE_BAND, hub: PRICE_BAND })
  .describe("Rate bands across all three market tiers for context.");

const CITY_TIER = z
  .enum(["hub", "mid", "small"])
  .describe("Market tier: hub = 25 major metros, mid = 129 secondary markets, small = 191 tertiary markets.");

// Did-you-mean handed back on a city/role miss so the agent can auto-retry with
// the resolved slug rather than relaying "not covered".
const SUGGESTION = z
  .object({
    kind: z.enum(["city", "role"]),
    slug: z.string(),
    name: z.string(),
  })
  .optional()
  .describe("Closest known city/role for a miss; retry with this slug.");

// ─── get_cities ──────────────────────────────────────────────────────────

export const GET_CITIES_OUTPUT = {
  total: z.number().int().describe("Number of cities matching the filter."),
  tier_breakdown: z.object({
    hub: z.number().int(),
    mid: z.number().int(),
    small: z.number().int(),
  }),
  cities: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      state: z.string(),
      state_abbr: z.string(),
      country: z.string().describe("US or CA."),
      tier: CITY_TIER,
      url: z.string().describe("City detail page on tempguru.co."),
    }),
  ),
};

// ─── get_roles ───────────────────────────────────────────────────────────

export const GET_ROLES_OUTPUT = {
  total: z.number().int(),
  roles: z.array(
    z.object({
      slug: z.string().describe("Use this slug in pricing/availability lookups."),
      name: z.string(),
      description: z.string(),
      skill_tier: z.number().int().describe("1 (entry) to 5 (lead)."),
      typical_shift_length_hours: z.number().int(),
      url: z.string(),
    }),
  ),
};

// ─── check_availability (3 variants: found / city-not-found / bad date) ──

export const CHECK_AVAILABILITY_OUTPUT = {
  city_found: z
    .boolean()
    .describe("false = city not in the published footprint (see message); true = guidance below."),
  // city-not-found variant
  requested: z.string().optional().describe("Echo of the unmatched city input."),
  suggestion: SUGGESTION,
  message: z.string().optional().describe("Present when city_found is false."),
  // invalid-date variant
  error: z.string().optional().describe("Present when the date could not be parsed."),
  // full guidance variant
  city: z.string().optional(),
  state: z.string().optional(),
  city_tier: CITY_TIER.optional(),
  event_date: z.string().optional().describe("Normalized ISO date (YYYY-MM-DD)."),
  days_until_event: z.number().int().optional(),
  typical_lead_time_hours: z.number().int().optional(),
  recommendation: z
    .enum(["yes", "tight", "rush", "very-rush"])
    .optional()
    .describe("Lead-time guidance, NOT a reservation. Even rush is worth submitting."),
  role: z
    .object({
      name: z.string(),
      rate_range_usd: PRICE_BAND,
      all_inclusive: z.string(),
    })
    .nullable()
    .optional()
    .describe("Rate context when a role was provided; null otherwise."),
  count: z.number().int().nullable().optional().describe("Echo of the requested headcount."),
  notes: z.array(z.string()).optional(),
};

// ─── get_role_pricing (4 variants: priced / role miss / city miss / no data) ─

export const GET_ROLE_PRICING_OUTPUT = {
  // role-not-found variant
  role_found: z.literal(false).optional().describe("Present (false) only when the role didn't match."),
  available_roles: z
    .array(z.object({ slug: z.string(), name: z.string() }))
    .optional()
    .describe("The valid role catalog, returned when the role didn't match."),
  // city-not-found variant
  city_found: z.literal(false).optional().describe("Present (false) only when the city didn't match."),
  fallback_pricing: ALL_TIERS.optional().describe("All-tier pricing shown when the city didn't match."),
  note: z.string().optional(),
  requested: z.string().optional().describe("Echo of the unmatched input."),
  suggestion: SUGGESTION,
  // no-data variant
  error: z.string().optional(),
  // priced variant
  role: z.string().optional(),
  role_slug: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  city_tier: CITY_TIER.optional(),
  hourly_range_low: z.number().optional(),
  hourly_range_high: z.number().optional(),
  currency: z.enum(["USD", "CAD"]).optional(),
  all_inclusive: z.string().optional(),
  tier_definition: z.string().optional(),
  all_tiers_for_context: ALL_TIERS.optional(),
  pricing_notes: z.string().optional(),
};

// ─── get_compliance_by_state (2 variants: found / state miss) ────────────

export const GET_COMPLIANCE_OUTPUT = {
  // state-not-found variant
  state_found: z.literal(false).optional().describe("Present (false) only when the state didn't match."),
  requested: z.string().optional(),
  available_states: z
    .array(z.object({ abbr: z.string(), name: z.string() }))
    .optional(),
  // found variant
  state: z.string().optional(),
  state_abbr: z.string().optional(),
  min_wage_usd: z.number().optional().describe("2026 state minimum wage."),
  w2_required: z.boolean().optional(),
  w2_note: z.string().optional(),
  overtime_threshold_weekly_hours: z.number().int().optional(),
  overtime_threshold_daily_hours: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Daily overtime threshold where the state has one (CA, AK, NV, CO); null otherwise."),
  unique_rules: z.array(z.string()).optional(),
  liability_coverage_included: z.boolean().optional(),
  workers_comp_included: z.boolean().optional(),
  min_wage_as_of: z.string().nullable().optional().describe("Effective date of this state's stored minimum wage."),
  min_wage_source: z.string().nullable().optional().describe("Authoritative source URL for the minimum wage figure."),
  data_current_as_of: z.string().optional().describe("Date the compliance dataset was last verified (YYYY-MM-DD)."),
  currency_note: z.string().optional().describe("Reminder that wages change annually; verify before relying."),
  citation_note: z.string().optional().describe("Operational guidance, not legal advice."),
};

// ─── plan_staffing (plan / needs_roles / roles_not_found / city_not_found) ──
// Flattened union: `status` discriminates, everything else optional so every
// variant validates. Keep in lockstep with buildStaffingPlan's return shapes.

const ROLES_CATALOG = z
  .object({
    total: z.number().int(),
    roles: z.array(
      z.object({
        slug: z.string(),
        name: z.string(),
        description: z.string().optional(),
        skill_tier: z.number().optional(),
        typical_shift_length_hours: z.number().optional(),
        url: z.string().optional(),
      }),
    ),
  })
  .nullable()
  .optional();

const PLAN_LINE = z.object({
  role: z.string(),
  role_slug: z.string(),
  headcount: z.number().int(),
  hours_per_shift: z.number(),
  days: z.number().int(),
  hourly_range: PRICE_BAND,
  estimated_total_range: z.object({ low: z.number(), high: z.number() }),
});

export const PLAN_STAFFING_OUTPUT = {
  status: z
    .enum(["plan", "needs_roles", "roles_not_found", "city_not_found"])
    .describe("Discriminator. Branch on this before reading the rest."),
  message: z.string().optional(),
  tip: z.string().optional(),
  available_roles: ROLES_CATALOG,
  // city_not_found
  requested_city: z.string().optional(),
  suggestion: SUGGESTION,
  next_steps: z.array(z.string()).optional(),
  // roles_not_found
  requested_roles: z.array(z.string()).optional(),
  unresolved_roles: z
    .array(z.object({ role: z.string(), suggestion: SUGGESTION }))
    .optional(),
  // plan / roles_not_found event block
  event: z
    .object({
      city: z.string(),
      state: z.string(),
      market_tier: z.string(),
      event_type: z.string().nullable().optional(),
      event_date: z.string().nullable().optional(),
      attendees: z.number().nullable().optional(),
      description: z.string().nullable().optional(),
    })
    .optional(),
  // plan
  plan_lines: z.array(PLAN_LINE).optional(),
  estimated_total_range: z
    .object({
      low: z.number(),
      high: z.number(),
      currency: z.enum(["USD", "CAD"]),
      basis: z.string(),
    })
    .optional(),
  overtime_adjusted_total_range: z
    .object({
      low: z.number(),
      high: z.number(),
      currency: z.enum(["USD", "CAD"]),
      note: z.string(),
    })
    .nullable()
    .optional()
    .describe("Present (non-null) only when daily/weekly OT applies to the schedule."),
  lead_time: z
    .object({
      event_date: z.string(),
      days_until_event: z.number().int(),
      recommendation: z.enum(["yes", "tight", "rush", "very-rush"]),
      note: z.string(),
    })
    .nullable()
    .optional(),
  compliance: z
    .object({
      state: z.string(),
      min_wage_usd: z.number(),
      overtime_weekly_hours: z.number().int(),
      overtime_daily_hours: z.number().int().nullable(),
      unique_rules: z.array(z.string()),
      note: z.string(),
    })
    .nullable()
    .optional(),
  staffing_notes: z.array(z.string()).optional(),
};

// ─── get_rate_benchmark (full Index / role-not-found) ─────────────────────

export const RATE_BENCHMARK_OUTPUT = {
  // role-not-found variant
  role_found: z.literal(false).optional(),
  requested: z.string().optional(),
  available_roles: z.array(z.string()).optional(),
  // full index variant
  index: z.string().optional(),
  edition: z.string().optional(),
  data_version: z.string().optional(),
  updated: z.string().optional(),
  methodology: z.string().optional(),
  markets_measured: z
    .object({ small: z.number().int(), mid: z.number().int(), hub: z.number().int() })
    .optional(),
  basis: z.string().optional(),
  requested_tier: z.enum(["hub", "mid", "small"]).optional(),
  reading_note: z.string().optional(),
  rates: z
    .array(
      z.object({
        role: z.string(),
        role_key: z.string(),
        typical_usd: z.string().optional(),
        national_range_usd: z.string().optional(),
        by_tier_usd: z
          .object({ small: z.string(), mid: z.string(), hub: z.string() })
          .optional(),
        tier: z.enum(["hub", "mid", "small"]).optional(),
        tier_usd: z.string().optional(),
      }),
    )
    .optional(),
  floors: z.string().optional(),
  citation: z.string().optional(),
  methodology_url: z.string().optional(),
};

// ─── request_quote (submitted / graceful failure) ────────────────────────

export const REQUEST_QUOTE_OUTPUT = {
  submitted: z
    .boolean()
    .describe("true = lead created in TempGuru's CRM (or durably queued); false = submission failed (see error)."),
  deal_name: z.string().optional().describe("CRM deal name, present when submitted."),
  reference: z.string().optional().describe("Short reference code the buyer can quote when following up."),
  message: z.string().describe("Human-readable outcome to relay to the user."),
  next_steps: z.array(z.string()).optional().describe("Present when submitted."),
  error: z.string().optional().describe("Present when submission failed."),
};
