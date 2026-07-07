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
  findCity,
  findRole,
  findState,
  suggestCity,
  suggestRole,
  type Role,
  type CityTier,
  type PriceBand,
  type RolePricing,
} from "./data";

// Re-export shared types so REST/MCP route files can import everything
// query-related from one place.
export type { CityTier, Role, PriceBand, RolePricing } from "./data";

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

export type CitiesQuery = { state?: string; tier?: CityTier };

export type CitiesData = {
  total: number;
  tier_breakdown: Record<CityTier, number>;
  cities: Array<{
    slug: string;
    name: string;
    state: string;
    state_abbr: string;
    country: string;
    tier: CityTier;
    url: string;
  }>;
};

export function queryCities(input: CitiesQuery): QueryResult<CitiesData> {
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
  return ok({
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
      ...r,
      url: `https://tempguru.co/insights/${r.slug}-in-new-york-city`,
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
  typical_lead_time_hours: number;
  recommendation: ReturnType<typeof recommendationLabel>;
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
        ? `No exact match for "${input.city}" among TempGuru's 345 US/CA markets. Did you mean ${suggestion.name}? Retry with that, or confirm coverage at https://tempguru.co/get-staffing.`
        : `No match for "${input.city}" among TempGuru's 345 US/CA markets. Confirm coverage at https://tempguru.co/get-staffing.`,
    });
  }

  const eventDate = new Date(input.date);
  if (isNaN(eventDate.getTime())) {
    return ok({
      city_found: true,
      city: cityMatch.name,
      error: `Invalid date: "${input.date}". Expected ISO format (YYYY-MM-DD) or recognizable date string.`,
    });
  }

  const now = new Date();
  const daysUntilEvent = Math.ceil(
    (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  const leadHours = LEAD_TIME_HOURS[cityMatch.tier];
  const recommendation = recommendationLabel(daysUntilEvent, leadHours);

  const roleMatch = input.role ? findRole(input.role) : null;
  const pricing = roleMatch ? PRICING[roleMatch.slug]?.[cityMatch.tier] ?? null : null;

  return ok({
    city_found: true,
    city: cityMatch.name,
    state: cityMatch.state,
    city_tier: cityMatch.tier,
    event_date: eventDate.toISOString().slice(0, 10),
    days_until_event: daysUntilEvent,
    typical_lead_time_hours: leadHours,
    recommendation,
    role:
      roleMatch && pricing
        ? {
            name: roleMatch.name,
            rate_range_usd: pricing,
            all_inclusive: "Workers comp, liability, payroll taxes included.",
          }
        : null,
    count: input.headcount ?? null,
    notes: [
      `${cityMatch.name} is a ${cityMatch.tier}-tier market.`,
      `Typical lead time for ${cityMatch.tier} cities: ${leadHours} hours.`,
      daysUntilEvent < 0
        ? "Event date is in the past."
        : `Event is ${daysUntilEvent} days out, ${recommendation} window.`,
      "To book, visit https://tempguru.co/get-staffing or request a quote via the dashboard.",
    ],
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
  unique_rules: string[];
  liability_coverage_included: boolean;
  workers_comp_included: boolean;
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
    unique_rules: match.data.unique_rules,
    liability_coverage_included: true,
    workers_comp_included: true,
    citation_note: STATE_META.citation_note,
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
