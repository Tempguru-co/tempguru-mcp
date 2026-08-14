// MCP outputSchema definitions for all 11 MCP tools, structured-output support
// (dual-era MCP, preferred rev 2026-07-28). Clients like ChatGPT Apps use these to render and
// ground tool results ("Output schema recommended" flag in the app console).
//
// CRITICAL CONTRACT: these schemas must accept EVERY shape the query layer
// returns as a successful result. queries.ts deliberately returns "expected
// miss" states (city/role/state not found, invalid date) as success variants,
// not errors, so each schema below is the FLATTENED union of its tool's
// variants, with a discriminator field and everything else optional in the
// advertised JSON Schema. SDK 1.26 cannot normalize a root discriminatedUnion
// (it drops outputSchema and breaks calls), so each variant tool also exports a
// root-object runtime schema with superRefine branch requirements. This keeps
// the wire format backward-compatible while rejecting incomplete branches.
//
// Protocol errors (result.ok === false, unreachable in practice because the
// zod input schemas catch bad params first) are returned with isError: true,
// which exempts them from output validation.

import { z } from "zod";

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function requireFields(
  value: Record<string, unknown>,
  ctx: z.core.$RefinementCtx,
  variant: string,
  fields: string[],
) {
  const missing = fields.filter((field) => !hasOwn(value, field) || value[field] === undefined);
  if (missing.length) {
    ctx.addIssue({
      code: "custom",
      message: `${variant} output is missing required field(s): ${missing.join(", ")}`,
    });
  }
}

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
  .describe("Market tier: hub = 25 major metros, mid = 128 secondary markets, small = 192 tertiary markets.");

// Did-you-mean handed back on a city/role miss. CONFIRM with the user before
// using it — never auto-retry a suggestion as if the user had typed it.
const SUGGESTION = z
  .object({
    kind: z.enum(["city", "role"]),
    slug: z.string(),
    name: z.string(),
  })
  .optional()
  .describe("Closest known city/role for a miss. Confirm with the user before using it; do not auto-apply.");

// ─── get_cities ──────────────────────────────────────────────────────────

const CITY_ROW = z.object({
  slug: z.string(),
  name: z.string(),
  state: z.string(),
  state_abbr: z.string(),
  country: z.string().describe("US or CA."),
  tier: CITY_TIER,
  url: z.string().describe("City detail page on tempguru.co."),
});

// Two variants: a filtered LIST, or a single-city catalog check
// (catalog_check:true). A match never means order coverage or availability.
export const GET_CITIES_OUTPUT = {
  // list variant
  total: z.number().int().optional().describe("Total cities matching the filter (before limit)."),
  returned: z.number().int().optional().describe("Number of cities in the cities array (after limit)."),
  tier_breakdown: z
    .object({ hub: z.number().int(), mid: z.number().int(), small: z.number().int() })
    .optional(),
  cities: z.array(CITY_ROW).optional(),
  coverage_confirmation_required: z.literal(true).optional(),
  catalog_qualification: z.string().optional(),
  note: z.string().optional().describe("Present when the list was truncated by limit."),
  // catalog-check variant (city param)
  catalog_check: z.literal(true).optional().describe("Present when a single-city catalog check was requested."),
  catalog_match: z.boolean().optional().describe("Whether the city resolved to a configured catalog entry; not an availability or coverage promise."),
  requested: z.string().optional(),
  suggestion: SUGGESTION,
  city: CITY_ROW.nullable().optional().describe("The matched configured entry, or null when there was no catalog match."),
  message: z.string().optional(),
};

export const GET_CITIES_SCHEMA = z.object(GET_CITIES_OUTPUT).superRefine((value, ctx) => {
  if (value.catalog_check === true) {
    requireFields(value, ctx, "catalog", [
      "requested",
      "catalog_match",
      "coverage_confirmation_required",
      "catalog_qualification",
      "city",
      "message",
    ]);
  } else {
    requireFields(value, ctx, "list", [
      "total",
      "returned",
      "tier_breakdown",
      "cities",
      "coverage_confirmation_required",
      "catalog_qualification",
    ]);
  }
});

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
    .describe("false = city did not match the configured catalog (see message); true = planning guidance below, not confirmed coverage."),
  // city-not-found variant
  requested: z.string().optional().describe("Echo of the unmatched city input."),
  suggestion: SUGGESTION,
  message: z.string().optional().describe("Present when city_found is false."),
  // invalid-date variant
  error: z.string().optional().describe("Present when the date could not be parsed."),
  // full guidance variant
  catalog_match: z.literal(true).optional(),
  coverage_confirmation_required: z.literal(true).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  city_tier: CITY_TIER.optional(),
  event_date: z.string().optional().describe("Normalized ISO date (YYYY-MM-DD)."),
  days_until_event: z.number().int().optional(),
  in_past: z
    .boolean()
    .optional()
    .describe("True when the requested date is already in the past — confirm the date before planning."),
  typical_lead_time_hours: z.number().int().optional(),
  recommendation: z
    .enum(["yes", "tight", "rush", "very-rush"])
    .optional()
    .describe("Lead-time guidance, NOT a reservation. Even rush is worth submitting."),
  role_found: z
    .boolean()
    .nullable()
    .optional()
    .describe("null = no role requested; false = the requested role didn't match the catalog (see notes)."),
  role_suggestion: SUGGESTION,
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

export const CHECK_AVAILABILITY_SCHEMA = z.object(CHECK_AVAILABILITY_OUTPUT).superRefine((value, ctx) => {
  if (value.city_found === false) {
    requireFields(value, ctx, "city_not_found", ["requested", "message"]);
  } else if (value.error !== undefined) {
    requireFields(value, ctx, "invalid_date", ["city", "error"]);
  } else {
    requireFields(value, ctx, "availability", [
      "city",
      "catalog_match",
      "coverage_confirmation_required",
      "state",
      "city_tier",
      "event_date",
      "days_until_event",
      "in_past",
      "typical_lead_time_hours",
      "recommendation",
      "role_found",
      "role",
      "count",
      "notes",
    ]);
  }
});

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
  role_note: z
    .string()
    .optional()
    .describe("Caveat about the resolved role (e.g. 'security' maps to unarmed Crowd Control, not licensed security)."),
};

export const GET_ROLE_PRICING_SCHEMA = z.object(GET_ROLE_PRICING_OUTPUT).superRefine((value, ctx) => {
  if (value.role_found === false) {
    requireFields(value, ctx, "role_not_found", ["requested", "available_roles"]);
  } else if (value.city_found === false) {
    requireFields(value, ctx, "city_not_found", ["requested", "role", "fallback_pricing", "note"]);
  } else if (value.error !== undefined) {
    requireFields(value, ctx, "rate_unavailable", ["error"]);
  } else {
    requireFields(value, ctx, "priced", [
      "role",
      "role_slug",
      "city",
      "state",
      "city_tier",
      "hourly_range_low",
      "hourly_range_high",
      "currency",
      "all_inclusive",
      "tier_definition",
      "all_tiers_for_context",
      "pricing_notes",
    ]);
  }
});

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
  overtime_daily_double_hours: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Start of the double-time band (hours/day) where the state has one (CA: 12); null otherwise."),
  seventh_day_overtime: z
    .boolean()
    .optional()
    .describe("True where a seventh-consecutive-day premium applies (CA)."),
  unique_rules: z.array(z.string()).optional(),
  liability_coverage_included: z.boolean().optional(),
  workers_comp_included: z.boolean().optional(),
  min_wage_as_of: z.string().nullable().optional().describe("Effective date of this state's stored minimum wage."),
  min_wage_source: z.string().nullable().optional().describe("Authoritative source URL for the minimum wage figure."),
  data_version: z.string().optional().describe("Version of the compliance dataset used for this result."),
  data_current_as_of: z.string().optional().describe("Date the compliance dataset was last verified (YYYY-MM-DD)."),
  currency_note: z.string().optional().describe("Reminder that wages change annually; verify before relying."),
  citation_note: z.string().optional().describe("Operational guidance, not legal advice."),
};

export const GET_COMPLIANCE_SCHEMA = z.object(GET_COMPLIANCE_OUTPUT).superRefine((value, ctx) => {
  if (value.state_found === false) {
    requireFields(value, ctx, "state_not_found", ["requested", "available_states"]);
  } else {
    requireFields(value, ctx, "compliance", [
      "state",
      "state_abbr",
      "min_wage_usd",
      "w2_required",
      "w2_note",
      "overtime_threshold_weekly_hours",
      "overtime_threshold_daily_hours",
      "overtime_daily_double_hours",
      "seventh_day_overtime",
      "unique_rules",
      "liability_coverage_included",
      "workers_comp_included",
      "min_wage_as_of",
      "min_wage_source",
      "data_version",
      "data_current_as_of",
      "currency_note",
      "citation_note",
    ]);
  }
});

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

const UNPRICED_ROLE = z.object({
  role: z.string(),
  headcount: z.number().int().optional(),
  hours_per_shift: z.number().optional(),
  days: z.number().optional(),
  suggestion: SUGGESTION,
});

export const PLAN_STAFFING_OUTPUT = {
  status: z
    .enum(["plan", "needs_roles", "roles_not_found", "city_not_found"])
    .describe("Discriminator. Branch on this before reading the rest."),
  plan_complete: z
    .boolean()
    .optional()
    .describe(
      "status:plan only. false = one or more requested roles could not be priced and are EXCLUDED from all totals (see unpriced_roles) — resolve them and re-plan before presenting a budget or quoting.",
    ),
  message: z.string().optional(),
  tip: z.string().optional(),
  available_roles: ROLES_CATALOG,
  // city_not_found
  requested_city: z.string().optional(),
  suggestion: SUGGESTION,
  next_steps: z.array(z.string()).optional(),
  // roles_not_found / partial plan
  requested_roles: z.array(z.string()).optional(),
  unresolved_roles: z.array(UNPRICED_ROLE).optional(),
  unpriced_roles: z
    .array(UNPRICED_ROLE)
    .optional()
    .describe("status:plan with plan_complete:false — the requested lines missing from every total."),
  // plan / roles_not_found event block
  event: z
    .object({
      city: z.string(),
      state: z.string(),
      market_tier: z.string(),
      catalog_match: z.literal(true),
      coverage_confirmation_required: z.literal(true),
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
      includes_double_time: z
        .boolean()
        .optional()
        .describe("True when a 2x band (CA/BC >12h/day, CA 7th consecutive day) is included."),
      note: z.string(),
    })
    .nullable()
    .optional()
    .describe("Present (non-null) only when daily/weekly OT (or a double-time band) applies to the schedule."),
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
      jurisdiction: z.string().describe("US state or Canadian province the rules below belong to."),
      min_wage_usd: z
        .number()
        .nullable()
        .describe("US states only; null for Canadian provinces (coordinator confirms provincial wage floors)."),
      overtime_weekly_hours: z.number().int().nullable(),
      overtime_daily_hours: z.number().int().nullable(),
      unique_rules: z.array(z.string()),
      data_version: z.string().describe("Version identifier for the jurisdiction dataset used by the plan."),
      data_current_as_of: z.string().describe("Date the jurisdiction dataset was last verified (YYYY-MM-DD)."),
      min_wage_as_of: z.string().nullable().describe("Effective date of the stored wage floor; null when no wage is stored."),
      min_wage_source: z.string().url().nullable().describe("Authoritative wage source; null for Canadian plans where the coordinator confirms the floor."),
      currency_note: z.string(),
      citation_note: z.string(),
      note: z.string(),
    })
    .nullable()
    .optional(),
  staffing_notes: z.array(z.string()).optional(),
  offer_note: z
    .string()
    .optional()
    .describe("Published first-order offer note. Totals remain undiscounted planning estimates."),
  plan_id: z
    .string()
    .regex(/^[A-HJ-NP-Z2-9]{12}$/)
    .optional()
    .describe("Complete plans only. Non-PII plan reference retained for 30 days when Redis persistence succeeds."),
  continuation: z
    .object({ form_url: z.string().url(), note: z.string() })
    .optional()
    .describe("Complete plans only. Prefilled website handoff; may be present without plan_id when storage fails open."),
};

export const PLAN_STAFFING_SCHEMA = z.object(PLAN_STAFFING_OUTPUT).superRefine((value, ctx) => {
  if (value.status === "city_not_found") {
    requireFields(value, ctx, value.status, ["requested_city", "message", "next_steps"]);
  } else if (value.status === "needs_roles") {
    requireFields(value, ctx, value.status, ["event", "message", "available_roles", "tip"]);
  } else if (value.status === "roles_not_found") {
    requireFields(value, ctx, value.status, [
      "event",
      "requested_roles",
      "unresolved_roles",
      "available_roles",
      "message",
      "next_steps",
    ]);
  } else {
    requireFields(value, ctx, value.status, [
      "plan_complete",
      "event",
      "plan_lines",
      "estimated_total_range",
      "overtime_adjusted_total_range",
      "lead_time",
      "compliance",
      "staffing_notes",
      "next_steps",
    ]);
    if (value.plan_complete === false) {
      requireFields(value, ctx, "partial_plan", ["unpriced_roles"]);
    }
  }
});

// ─── save_staffing_plan (saved / incomplete / limited / unavailable) ─────
//
// The explicit write recomputes the plan from bounded event inputs. It never
// accepts caller-supplied rates or totals. `status` distinguishes the durable
// artifact from expected operational misses without turning them into protocol
// errors.

const SAVE_PLAN_CONTINUATION = z.object({
  form_url: z.string().url(),
  note: z.string(),
});

const SAVE_PLAN_NEXT_ACTION = z.enum([
  "share",
  "revise",
  "request_quote",
  "plan_again",
  "retry_save",
  "continue_on_website",
]);

export const SAVE_STAFFING_PLAN_OUTPUT = {
  status: z
    .enum([
      "saved",
      "plan_incomplete",
      "rate_limited",
      "storage_unavailable",
    ])
    .describe("Discriminator. Only status:saved means a resumable plan_id exists."),
  schema_version: z.literal("1.0").optional(),
  plan_id: z
    .string()
    .regex(/^[A-HJ-NP-Z2-9]{12}$/)
    .optional()
    .describe("12-character reference for the saved non-PII snapshot."),
  created_at: z.string().datetime().optional(),
  expires_at: z
    .string()
    .datetime()
    .optional()
    .describe("Conservative 30-day expiry for the saved snapshot."),
  resource_uri: z
    .string()
    .url()
    .optional()
    .describe("Public no-store REST URI that restores the saved artifact."),
  continuation: SAVE_PLAN_CONTINUATION.optional(),
  quote_readiness: z
    .literal("buyer_submission_required")
    .optional()
    .describe("The buyer must open the handoff form and personally submit their contact details."),
  plan_status: z
    .enum(["plan", "needs_roles", "roles_not_found", "city_not_found"])
    .optional()
    .describe("Planner branch that prevented persistence."),
  retry_after_seconds: z.number().int().positive().optional(),
  message: z.string(),
  next_actions: z.array(SAVE_PLAN_NEXT_ACTION),
};

export const SAVE_STAFFING_PLAN_SCHEMA = z
  .object(SAVE_STAFFING_PLAN_OUTPUT)
  .superRefine((value, ctx) => {
    if (value.status === "saved") {
      requireFields(value, ctx, value.status, [
        "schema_version",
        "plan_id",
        "created_at",
        "expires_at",
        "resource_uri",
        "continuation",
        "quote_readiness",
      ]);
    } else if (value.status === "plan_incomplete") {
      requireFields(value, ctx, value.status, ["plan_status"]);
    } else if (value.status === "rate_limited") {
      requireFields(value, ctx, value.status, [
        "retry_after_seconds",
        "continuation",
      ]);
    } else {
      requireFields(value, ctx, value.status, ["continuation"]);
    }
  });

// ─── get_plan (found / not found) ───────────────────────────────────────

const PLAN_SNAPSHOT = z.object({
  city: z.object({ slug: z.string(), name: z.string(), state: z.string() }),
  event: z.object({
    event_date: z.string().nullable(),
    event_type: z.string().nullable(),
    attendees: z.number().int().nullable(),
  }),
  plan_lines: z.array(PLAN_LINE),
  estimated_total_range: z.object({
    low: z.number(),
    high: z.number(),
    currency: z.enum(["USD", "CAD"]),
    basis: z.string(),
  }),
  overtime_adjusted_total_range: z
    .object({
      low: z.number(),
      high: z.number(),
      currency: z.enum(["USD", "CAD"]),
      includes_double_time: z.boolean().optional(),
      note: z.string(),
    })
    .nullable(),
  compliance_jurisdiction: z.string().nullable(),
  created_at: z.string(),
  channel: z.enum(["mcp", "rest"]),
  source: z.string().nullable(),
});

export const GET_PLAN_OUTPUT = {
  plan_found: z.boolean().describe("Discriminator. false means the reference was absent or expired."),
  plan_id: z.string(),
  snapshot: PLAN_SNAPSHOT.optional(),
  continuation: z.object({ form_url: z.string().url(), note: z.string() }).optional(),
  offer_note: z
    .string()
    .optional()
    .describe("Published first-order offer note. Snapshot totals remain undiscounted."),
  message: z.string(),
  next_steps: z.array(z.string()),
};

export const GET_PLAN_SCHEMA = z.object(GET_PLAN_OUTPUT).superRefine((value, ctx) => {
  requireFields(value, ctx, value.plan_found ? "plan_found" : "plan_not_found", [
    "plan_id",
    "message",
    "next_steps",
  ]);
  if (value.plan_found) requireFields(value, ctx, "plan_found", ["snapshot", "continuation"]);
});

// ─── get_policies (all/one topic / topic not found) ─────────────────────

const POLICY = z.object({
  topic: z.string(),
  title: z.string(),
  confirmed_claims: z.array(z.string()),
  confirm_with_coordinator: z.boolean(),
  todo_for_megan: z.array(z.string()),
  sources: z.array(z.string()),
  code: z.string().optional(),
  discount_percent: z.number().optional(),
  cap_usd: z.number().optional(),
  expires: z.iso.date().optional().describe("Offer expiry date in YYYY-MM-DD format."),
  scope: z.string().optional(),
});

export const GET_POLICIES_OUTPUT = {
  status: z.enum(["policies", "policy_not_found"]),
  policy_found: z.boolean().describe("Discriminator. false means the requested topic is not published."),
  data_version: z.string().optional(),
  updated: z.string().optional(),
  scope: z.string().optional(),
  policies: z.array(POLICY).optional(),
  todo_for_megan: z.array(z.string()).optional(),
  disclaimer: z.string().optional(),
  requested: z.string().optional(),
  available_topics: z.array(z.string()).optional(),
  message: z.string().optional(),
};

export const GET_POLICIES_SCHEMA = z.object(GET_POLICIES_OUTPUT).superRefine((value, ctx) => {
  if (value.policy_found) {
    if (value.status !== "policies") {
      ctx.addIssue({
        code: "custom",
        message: "policy_found:true requires status:policies",
      });
    }
    requireFields(value, ctx, "policies", [
      "data_version",
      "updated",
      "scope",
      "policies",
      "todo_for_megan",
      "disclaimer",
    ]);
  } else {
    if (value.status !== "policy_not_found") {
      ctx.addIssue({
        code: "custom",
        message: "policy_found:false requires status:policy_not_found",
      });
    }
    requireFields(value, ctx, "policy_not_found", ["requested", "available_topics", "message"]);
  }
});

// ─── get_quote_status (found / not found) ───────────────────────────────

export const GET_QUOTE_STATUS_OUTPUT = {
  quote_found: z.boolean().describe("Discriminator. false means the status stub is absent or expired."),
  reference: z.string(),
  status: z.enum(["received", "queued"]).optional(),
  created_at: z.string().optional(),
  deal_name: z.string().optional(),
  channel: z.enum(["mcp", "rest"]).optional(),
  message: z.string(),
  follow_up: z.string(),
};

export const GET_QUOTE_STATUS_SCHEMA = z.object(GET_QUOTE_STATUS_OUTPUT).superRefine((value, ctx) => {
  requireFields(value, ctx, value.quote_found ? "quote_found" : "quote_not_found", [
    "reference",
    "message",
    "follow_up",
  ]);
  if (value.quote_found) {
    requireFields(value, ctx, "quote_found", ["status", "created_at", "deal_name", "channel"]);
  }
});

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

export const RATE_BENCHMARK_SCHEMA = z.object(RATE_BENCHMARK_OUTPUT).superRefine((value, ctx) => {
  if (value.role_found === false) {
    requireFields(value, ctx, "role_not_found", ["requested", "available_roles"]);
  } else {
    requireFields(value, ctx, "benchmark", [
      "index",
      "edition",
      "data_version",
      "updated",
      "methodology",
      "markets_measured",
      "basis",
      "reading_note",
      "rates",
      "floors",
      "citation",
      "methodology_url",
    ]);
  }
});

// ─── request_quote (authless buyer handoff; never submits contact data) ───

export const REQUEST_QUOTE_HANDOFF_OUTPUT = {
  handoff_ready: z
    .boolean()
    .describe("true when the saved plan resolved and a prefilled buyer form URL was created."),
  buyer_submission_required: z
    .literal(true)
    .describe("Always true. The buyer, not the agent, must enter contact details and submit the form."),
  plan_found: z
    .boolean()
    .describe("Whether the supplied non-PII plan_id resolved before expiry."),
  plan_id: z.string().regex(/^[A-HJ-NP-Z2-9]{12}$/),
  form_url: z
    .string()
    .url()
    .optional()
    .describe("Prefilled TempGuru-owned review form. Present only when handoff_ready is true."),
  message: z.string().describe("Human-readable outcome to relay to the buyer."),
  next_steps: z.array(z.string()).describe("Safe next actions; no agent-side contact collection."),
};

export const REQUEST_QUOTE_HANDOFF_SCHEMA = z
  .object(REQUEST_QUOTE_HANDOFF_OUTPUT)
  .superRefine((value, ctx) => {
    if (value.handoff_ready) {
      requireFields(value, ctx, "handoff_ready", ["form_url"]);
      if (!value.plan_found) {
        ctx.addIssue({
          code: "custom",
          path: ["plan_found"],
          message: "handoff_ready requires plan_found:true",
        });
      }
    } else if (value.plan_found) {
      ctx.addIssue({
        code: "custom",
        path: ["handoff_ready"],
        message: "plan_found:true requires handoff_ready:true",
      });
    }
  });
