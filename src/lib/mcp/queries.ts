// Pure data query functions. No HTTP, no MCP, no I/O, just business logic.
//
// These functions are the single source of truth for what every public surface
// (MCP tools, REST endpoints) returns. The MCP route and REST routes both call
// these, so there can be no behavior drift between the two interfaces.
//
// Each function returns a Result type, { ok: true, data } | { ok: false, error }
// so callers can translate to their own envelope (MCP tool result vs HTTP status).

import {
  CITIES,
  ROLES,
  PRICING,
  PRICING_META,
  STATES,
  STATE_META,
  POLICIES,
  POLICIES_META,
  findCity,
  findRole,
  findState,
  cityDetailUrl,
  roleDetailUrl,
  suggestCity,
  suggestRole,
  isSecurityPhrase,
  SECURITY_ROLE_NOTE,
  type Role,
  type CityTier,
  type PriceBand,
  type RolePricing,
  type Policy,
} from "./data";
import { parseEventStart } from "../dates/parse-event-start";

// Re-export shared types so REST/MCP route files can import everything
// query-related from one place.
export type { CityTier, Role, PriceBand, RolePricing, Policy } from "./data";

// ─── Result type ─────────────────────────────────────────────────────────

export type QueryErrorCode =
  | "missing_required"
  | "invalid_param"
  | "not_found";

export type QueryError = {
  code: QueryErrorCode;
  message: string;
  field?: string;
  /** Optional best-match suggestion when the input didn't resolve to a known entity. */
  suggestion?: { kind: "city" | "role" | "state"; slug?: string; name: string };
};

export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: QueryError };

const ok = <T>(data: T): QueryResult<T> => ({ ok: true, data });
const fail = (error: QueryError): QueryResult<never> => ({ ok: false, error });

// A did-you-mean handed back on a miss so the agent can auto-retry with the
// resolved slug instead of relaying "not covered". Populated from the same
// fuzzy layer findCity/findRole use, at a looser threshold.
export type EntitySuggestion = { kind: "city" | "role"; slug: string; name: string };
const citySuggestion = (q: string): EntitySuggestion | undefined => {
  const c = suggestCity(q);
  return c ? { kind: "city", slug: c.slug, name: c.name } : undefined;
};
const roleSuggestion = (q: string): EntitySuggestion | undefined => {
  const r = suggestRole(q);
  return r ? { kind: "role", slug: r.slug, name: r.name } : undefined;
};

// ─── Shared availability heuristics ──────────────────────────────────────

export const LEAD_TIME_HOURS: Record<CityTier, number> = {
  hub: 48,
  mid: 72,
  small: 168, // 1 week
};

export function recommendationLabel(daysUntilEvent: number, leadHours: number) {
  const hoursUntil = daysUntilEvent * 24;
  if (hoursUntil >= leadHours * 2) return "yes";
  if (hoursUntil >= leadHours) return "tight";
  if (hoursUntil >= 24) return "rush";
  return "very-rush";
}

// ─── Cities ──────────────────────────────────────────────────────────────

export type CitiesQuery = {
  state?: string;
  tier?: CityTier;
  country?: string;
  limit?: number;
  /** When set, answers a single "do you cover X?" coverage check instead of listing. */
  city?: string;
};

type CityRow = {
  slug: string;
  name: string;
  state: string;
  state_abbr: string;
  country: string;
  tier: CityTier;
  url: string;
};

const cityRow = (c: (typeof CITIES)[number]): CityRow => ({
  slug: c.slug,
  name: c.name,
  state: c.state,
  state_abbr: c.state_abbr,
  country: c.country,
  tier: c.tier,
  url: cityDetailUrl(c),
});

export type CitiesData = {
  total: number;
  returned: number;
  tier_breakdown: Record<CityTier, number>;
  cities: CityRow[];
  note?: string;
};

export type CityCoverage = {
  coverage_check: true;
  requested: string;
  covered: boolean;
  city: CityRow | null;
  suggestion?: EntitySuggestion;
  message: string;
};

export function queryCities(input: CitiesQuery): QueryResult<CitiesData | CityCoverage> {
  // Single-city coverage check: "do you cover Brooklyn?" resolves through the
  // alias/borough-aware findCity and returns a direct yes/no + did-you-mean,
  // instead of dumping the whole catalog for the agent to scan.
  if (input.city) {
    const match = findCity(input.city);
    if (match) {
      return ok({
        coverage_check: true,
        requested: input.city,
        covered: true,
        city: cityRow(match),
        message: `Yes, TempGuru staffs ${match.name}, ${match.state_abbr} (${match.tier}-tier market).`,
      });
    }
    const suggestion = citySuggestion(input.city);
    return ok({
      coverage_check: true,
      requested: input.city,
      covered: false,
      city: null,
      suggestion,
      message: suggestion
        ? `No exact match for "${input.city}" in TempGuru's 345 US/CA markets. Closest covered market: ${suggestion.name}, confirm with the user before assuming. Coverage: https://tempguru.co/get-staffing.`
        : `"${input.city}" is not in TempGuru's 345 US/CA markets. Confirm coverage at https://tempguru.co/get-staffing.`,
    });
  }

  let result = CITIES;
  if (input.tier) {
    if (input.tier !== "hub" && input.tier !== "mid" && input.tier !== "small") {
      return fail({
        code: "invalid_param",
        message: `tier must be one of: hub, mid, small. Got: "${input.tier}".`,
        field: "tier",
      });
    }
    result = result.filter((c) => c.tier === input.tier);
  }
  if (input.state) {
    const s = input.state.trim().toUpperCase();
    const sLower = input.state.trim().toLowerCase();
    result = result.filter(
      (c) => c.state_abbr === s || c.state.toLowerCase() === sLower,
    );
  }
  if (input.country) {
    // Exact alias sets only. Prefix matching made "USSR" → US and
    // "United Kingdom" → US; an unrecognized country is an explicit error.
    const cc = input.country.trim().toUpperCase().replace(/\./g, "");
    const want = ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA", "AMERICA"].includes(cc)
      ? "US"
      : ["CA", "CAN", "CANADA"].includes(cc)
        ? "CA"
        : null;
    if (!want) {
      return fail({
        code: "invalid_param",
        message: `country must be US or CA (accepted: US, USA, United States, CA, CAN, Canada). Got: "${input.country}". TempGuru serves the United States and Canada only.`,
        field: "country",
      });
    }
    result = result.filter((c) => c.country.toUpperCase() === want);
  }

  const total = result.length;
  const tier_breakdown = {
    hub: result.filter((c) => c.tier === "hub").length,
    mid: result.filter((c) => c.tier === "mid").length,
    small: result.filter((c) => c.tier === "small").length,
  };
  // Cap the returned array so an unfiltered call doesn't dump ~35KB (345 rows)
  // into the model's context. The full counts are always in total/tier_breakdown;
  // an explicit limit overrides the default cap (up to 1000 = everything).
  const DEFAULT_LIMIT = 100;
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 1000) : Math.min(DEFAULT_LIMIT, total);
  const capped = result.slice(0, limit);
  return ok({
    total,
    returned: capped.length,
    tier_breakdown,
    cities: capped.map(cityRow),
    ...(capped.length < total
      ? {
          note: `Showing ${capped.length} of ${total} matching markets. Narrow with state/tier/country, pass city='<name>' for a single coverage check, or raise limit.`,
        }
      : {}),
  });
}

// ─── Roles ───────────────────────────────────────────────────────────────

export type RolesData = {
  total: number;
  roles: Array<Role & { url: string }>;
};

export function queryRoles(): QueryResult<RolesData> {
  return ok({
    total: ROLES.length,
    roles: ROLES.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      skill_tier: r.skill_tier,
      typical_shift_length_hours: r.typical_shift_length_hours,
      url: roleDetailUrl(r),
    })),
  });
}

// ─── Availability ────────────────────────────────────────────────────────

export type AvailabilityQuery = {
  date: string;
  city: string;
  role?: string;
  headcount?: number;
};

export type AvailabilityCityNotFound = {
  city_found: false;
  requested: string;
  suggestion?: EntitySuggestion;
  message: string;
};

export type AvailabilityDateInvalid = {
  city_found: true;
  city: string;
  error: string;
};

export type AvailabilityData = {
  city_found: true;
  city: string;
  state: string;
  city_tier: CityTier;
  event_date: string;
  days_until_event: number;
  /** True when the requested date is already in the past — confirm the date, don't plan against it. */
  in_past: boolean;
  typical_lead_time_hours: number;
  recommendation: ReturnType<typeof recommendationLabel>;
  /** null when no role param; false when a role was given but didn't resolve. */
  role_found: boolean | null;
  role_suggestion?: EntitySuggestion;
  role: null | {
    name: string;
    rate_range_usd: PriceBand;
    all_inclusive: string;
  };
  count: number | null;
  notes: string[];
};

/**
 * Returns availability guidance. Several "expected error" states (city not
 * found, date invalid) are returned as successful results with shape variants
 * to preserve byte-identical MCP tool behavior. REST routes use the
 * discriminator helpers below to decide HTTP status. `fail()` is only used
 * for missing required params, which MCP's zod schema prevents from ever
 * reaching here in practice.
 */
export function queryAvailability(
  input: AvailabilityQuery,
): QueryResult<AvailabilityData | AvailabilityCityNotFound | AvailabilityDateInvalid> {
  if (!input.city) {
    return fail({ code: "missing_required", message: "city is required", field: "city" });
  }
  if (!input.date) {
    return fail({ code: "missing_required", message: "date is required", field: "date" });
  }

  const cityMatch = findCity(input.city);
  if (!cityMatch) {
    const suggestion = citySuggestion(input.city);
    return ok({
      city_found: false,
      requested: input.city,
      suggestion,
      message: suggestion
        ? `No exact match for "${input.city}" among TempGuru's 345 US/CA markets. The closest covered market is ${suggestion.name}, confirm with the user before using it (do not assume). Coverage: https://tempguru.co/get-staffing.`
        : `No match for "${input.city}" among TempGuru's 345 US/CA markets. Confirm coverage at https://tempguru.co/get-staffing.`,
    });
  }

  // Strict ISO validation first: JS Date rolls impossible dates over
  // (2027-02-30 → Mar 2), which silently plans against a date the user never
  // gave. Recognized human dates use the same deterministic parser as lead
  // trust and saved plans; native Date parsing misreads ranges such as
  // "Aug 14-15, 2026" as a date in 2015.
  const iso = input.date.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let eventDate: Date;
  if (iso) {
    const [y, mo, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
      return ok({
        city_found: true,
        city: cityMatch.name,
        error: `Impossible calendar date: "${input.date}" (that month has no such day). Confirm the intended date.`,
      });
    }
    eventDate = dt;
  } else {
    const parsed = parseEventStart(input.date);
    if (!parsed) {
      return ok({
        city_found: true,
        city: cityMatch.name,
        error: `Invalid date: "${input.date}". Expected ISO format (YYYY-MM-DD) or recognizable date string.`,
      });
    }
    eventDate = parsed;
  }

  const now = new Date();
  const daysUntilEvent = Math.ceil(
    (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  const inPast = daysUntilEvent < 0;
  const leadHours = LEAD_TIME_HOURS[cityMatch.tier];
  const recommendation = recommendationLabel(daysUntilEvent, leadHours);

  const roleMatch = input.role ? findRole(input.role) : null;
  const roleMissed = !!input.role && !roleMatch;
  const pricing = roleMatch ? PRICING[roleMatch.slug]?.[cityMatch.tier] ?? null : null;

  const notes = [
    `${cityMatch.name} is a ${cityMatch.tier}-tier market.`,
    `Typical lead time for ${cityMatch.tier} cities: ${leadHours} hours.`,
    inPast
      ? `The requested date is in the past — confirm the intended date with the user before planning or quoting.`
      : `Event is ${daysUntilEvent} days out, ${recommendation} window.`,
  ];
  if (roleMissed) {
    const rs = roleSuggestion(input.role!);
    notes.push(
      rs
        ? `Role "${input.role}" didn't match the catalog. Did you mean ${rs.name}? Confirm, or check get_roles.`
        : `Role "${input.role}" didn't match the catalog — check get_roles for exact names. Guidance below is city-level only.`,
    );
  }
  if (input.role && roleMatch && isSecurityPhrase(input.role)) {
    notes.push(SECURITY_ROLE_NOTE);
  }
  notes.push("To book, visit https://tempguru.co/get-staffing or request a quote via the dashboard.");

  return ok({
    city_found: true,
    city: cityMatch.name,
    state: cityMatch.state,
    city_tier: cityMatch.tier,
    event_date: eventDate.toISOString().slice(0, 10),
    days_until_event: daysUntilEvent,
    in_past: inPast,
    typical_lead_time_hours: leadHours,
    recommendation,
    role_found: input.role ? !!roleMatch : null,
    ...(roleMissed && roleSuggestion(input.role!) ? { role_suggestion: roleSuggestion(input.role!) } : {}),
    role:
      roleMatch && pricing
        ? {
            name: roleMatch.name,
            rate_range_usd: pricing,
            all_inclusive: "Workers comp, liability, payroll taxes included.",
          }
        : null,
    count: input.headcount ?? null,
    notes,
  });
}

// ─── Role pricing ────────────────────────────────────────────────────────

export type RolePricingQuery = { role: string; city: string };

export type RolePricingRoleNotFound = {
  role_found: false;
  requested: string;
  suggestion?: EntitySuggestion;
  available_roles: Array<{ slug: string; name: string }>;
};

export type RolePricingCityNotFound = {
  city_found: false;
  requested: string;
  suggestion?: EntitySuggestion;
  role: string;
  fallback_pricing: RolePricing;
  note: string;
};

export type RolePricingNoData = {
  error: string;
};

export type RolePricingData = {
  role: string;
  role_slug: string;
  city: string;
  state: string;
  city_tier: CityTier;
  hourly_range_low: number;
  hourly_range_high: number;
  currency: "USD" | "CAD";
  all_inclusive: string;
  tier_definition: string;
  all_tiers_for_context: RolePricing;
  pricing_notes: string;
  /** Present when the input phrasing needs a caveat (e.g. "security" → unarmed Crowd Control). */
  role_note?: string;
};

export function queryRolePricing(
  input: RolePricingQuery,
): QueryResult<RolePricingData | RolePricingRoleNotFound | RolePricingCityNotFound | RolePricingNoData> {
  if (!input.role) {
    return fail({ code: "missing_required", message: "role is required", field: "role" });
  }
  if (!input.city) {
    return fail({ code: "missing_required", message: "city is required", field: "city" });
  }

  const roleMatch = findRole(input.role);
  if (!roleMatch) {
    return ok({
      role_found: false,
      requested: input.role,
      suggestion: roleSuggestion(input.role),
      available_roles: ROLES.map((r) => ({ slug: r.slug, name: r.name })),
    });
  }
  const cityMatch = findCity(input.city);
  if (!cityMatch) {
    return ok({
      city_found: false,
      requested: input.city,
      suggestion: citySuggestion(input.city),
      role: roleMatch.name,
      fallback_pricing: PRICING[roleMatch.slug],
      note: "City not in TempGuru's 345-market footprint. Showing pricing across all tiers as fallback.",
    });
  }
  // Published per-role rate card (role-pricing.json): a distinct rate per role,
  // by market tier. Roles are NOT collapsed, Registration, Hospitality, Gate,
  // Booth, Setup, and Guest Services each keep their own band. Per-city measured
  // spreads live in the Rate Index (get_rate_benchmark), not here.
  const cardBand = PRICING[roleMatch.slug]?.[cityMatch.tier];
  if (!cardBand) {
    return ok({
      error: `No published rate card for ${roleMatch.name} in a ${cityMatch.tier}-tier market.`,
    });
  }
  return ok({
    role: roleMatch.name,
    role_slug: roleMatch.slug,
    city: cityMatch.name,
    state: cityMatch.state,
    city_tier: cityMatch.tier,
    hourly_range_low: cardBand.low,
    hourly_range_high: cardBand.high,
    currency: cityMatch.country === "CA" ? "CAD" : "USD",
    all_inclusive:
      "Workers comp, general liability, and payroll taxes (FICA/FUTA/SUTA) included.",
    tier_definition: PRICING_META.tier_definitions[cityMatch.tier],
    all_tiers_for_context: PRICING[roleMatch.slug],
    pricing_notes:
      "Published per-role rate card (all-inclusive W-2), by market tier. all_tiers_for_context shows this role's bands across small, mid, and hub. For the measured market benchmark across cities, call get_rate_benchmark (the Rate Index).",
    ...(isSecurityPhrase(input.role) ? { role_note: SECURITY_ROLE_NOTE } : {}),
  });
}

// ─── State compliance ────────────────────────────────────────────────────

export type StateComplianceQuery = { state: string };

export type StateComplianceNotFound = {
  state_found: false;
  requested: string;
  available_states: Array<{ abbr: string; name: string }>;
};

export type StateComplianceData = {
  state: string;
  state_abbr: string;
  min_wage_usd: number;
  w2_required: boolean;
  w2_note: string;
  overtime_threshold_weekly_hours: number;
  overtime_threshold_daily_hours: number | null;
  /** Double-time band start (hours/day), where the state has one (CA: 12). */
  overtime_daily_double_hours: number | null;
  /** True where a seventh-consecutive-day premium applies (CA). */
  seventh_day_overtime: boolean;
  unique_rules: string[];
  liability_coverage_included: boolean;
  workers_comp_included: boolean;
  min_wage_as_of: string | null;
  min_wage_source: string | null;
  data_version: string;
  data_current_as_of: string;
  currency_note: string;
  citation_note: string;
};

export function queryStateCompliance(
  input: StateComplianceQuery,
): QueryResult<StateComplianceData | StateComplianceNotFound> {
  if (!input.state) {
    return fail({ code: "missing_required", message: "state is required", field: "state" });
  }
  const match = findState(input.state);
  if (!match) {
    return ok({
      state_found: false,
      requested: input.state,
      available_states: Object.entries(STATES).map(([abbr, data]) => ({
        abbr,
        name: data.name,
      })),
    });
  }
  return ok({
    state: match.data.name,
    state_abbr: match.abbr,
    min_wage_usd: match.data.min_wage,
    w2_required: true,
    w2_note: "TempGuru classifies ALL workers as W-2 employees regardless of state.",
    overtime_threshold_weekly_hours: match.data.overtime_weekly,
    overtime_threshold_daily_hours: match.data.overtime_daily,
    overtime_daily_double_hours: match.data.overtime_daily_double ?? null,
    seventh_day_overtime: match.data.seventh_day_overtime ?? false,
    unique_rules: match.data.unique_rules,
    liability_coverage_included: true,
    workers_comp_included: true,
    min_wage_as_of: match.data.min_wage_as_of ?? null,
    min_wage_source: match.data.min_wage_source ?? null,
    data_version: STATE_META.version,
    data_current_as_of: STATE_META.updated,
    currency_note:
      "Minimum wages change every January (and mid-year in some states); local ordinances may set higher floors. Verify against the state DOL (min_wage_source) before relying on it.",
    citation_note: STATE_META.citation_note,
  });
}

// ─── Booking / procurement policies ─────────────────────────────────────

export type PoliciesQuery = { topic?: string };

export type PoliciesData = {
  status: "policies";
  policy_found: true;
  data_version: string;
  updated: string;
  scope: string;
  policies: Policy[];
  todo_for_megan: string[];
  disclaimer: string;
};

export type PolicyNotFound = {
  status: "policy_not_found";
  policy_found: false;
  requested: string;
  available_topics: string[];
  message: string;
};

const normalizePolicyTopic = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function queryPolicies(input: PoliciesQuery = {}): QueryResult<PoliciesData | PolicyNotFound> {
  let selected = POLICIES;
  if (input.topic?.trim()) {
    const requested = normalizePolicyTopic(input.topic);
    selected = POLICIES.filter(
      (policy) =>
        normalizePolicyTopic(policy.topic) === requested ||
        normalizePolicyTopic(policy.title) === requested,
    );
    if (selected.length === 0) {
      return ok({
        status: "policy_not_found",
        policy_found: false,
        requested: input.topic,
        available_topics: POLICIES.map((policy) => policy.topic),
        message:
          `No published TempGuru policy topic matched "${input.topic}". ` +
          "Choose an available topic or ask a coordinator at megan@tempguru.co for event-specific terms.",
      });
    }
  }

  return ok({
    status: "policies",
    policy_found: true,
    data_version: POLICIES_META.version,
    updated: POLICIES_META.updated,
    scope: POLICIES_META.scope,
    policies: selected,
    todo_for_megan: [...new Set(selected.flatMap((policy) => policy.todo_for_megan))],
    disclaimer: POLICIES_META.disclaimer,
  });
}

// ─── Discriminator helpers (for REST status code decisions) ─────────────

type AvailabilityAny = AvailabilityData | AvailabilityCityNotFound | AvailabilityDateInvalid;

export function isAvailabilityCityNotFound(d: AvailabilityAny): d is AvailabilityCityNotFound {
  return d.city_found === false;
}

export function isAvailabilityDateInvalid(d: AvailabilityAny): d is AvailabilityDateInvalid {
  return d.city_found === true && "error" in d;
}

type RolePricingAny = RolePricingData | RolePricingRoleNotFound | RolePricingCityNotFound | RolePricingNoData;

export function isPricingRoleNotFound(d: RolePricingAny): d is RolePricingRoleNotFound {
  return "role_found" in d && d.role_found === false;
}

export function isPricingCityNotFound(d: RolePricingAny): d is RolePricingCityNotFound {
  return "city_found" in d && d.city_found === false;
}

export function isPricingNoData(d: RolePricingAny): d is RolePricingNoData {
  return "error" in d && !("role" in d);
}

export function isComplianceNotFound(
  d: StateComplianceData | StateComplianceNotFound,
): d is StateComplianceNotFound {
  return "state_found" in d && d.state_found === false;
}
