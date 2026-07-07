// get_rate_benchmark, the TempGuru Event Staffing Rate Index as a live tool.
//
// The citable-authority play: one call returns the benchmark table of
// all-inclusive W-2 bill rates by role (typical + national range; Brand Ambassadors by tier), with methodology and a
// ready-to-use citation line. Built from the vetted per-city dataset
// (city-rates.json) the website also uses, so the Index and the city pages
// cannot drift.
//
// A market tier is heterogeneous (hub event staff runs $30 in Houston to $49 in
// New York), so each tier figure is the honest min-to-max SPAN across that
// tier's measured cities, NOT a midpoint. Agents are pointed at get_role_pricing
// for an exact per-city rate.

import { ROLES } from "./data";
import {
  TIER_SPANS,
  TYPICAL,
  NATIONAL_RANGE,
  TIER_CITY_COUNTS,
  CITY_RATES_META,
  roleKeyFor,
  type CardKey,
} from "./city-rates";

export type RateBenchmarkInput = {
  role?: string;
  tier?: "hub" | "mid" | "small";
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "-");

// The roles the Index publishes, each tied to its vetted card key. Display
// roles that share a key (registration, hospitality, gate, etc. all ride event
// staff) collapse to the canonical labels below, we don't claim differentiated
// rates we never measured (rates-model.md).
const INDEX_ROLES: Array<{ label: string; key: CardKey }> = [
  { label: "Event Staff (registration, hospitality, setup, gate, booth, guest services)", key: "event_staff" },
  { label: "Ushers", key: "ushers" },
  { label: "Crowd Control", key: "crowd" },
  { label: "Assistant Leads", key: "asst_lead" },
  { label: "Team Leads", key: "team_lead" },
  { label: "Brand Ambassadors", key: "brand_amb" },
];

export function buildRateBenchmark(input: RateBenchmarkInput = {}) {
  let rows = INDEX_ROLES;
  if (input.role) {
    const want = norm(input.role);
    const known = ROLES.find((r) => r.slug === want || norm(r.name) === want);
    const key = roleKeyFor(known ?? input.role);
    rows = INDEX_ROLES.filter((r) => r.key === key);
    if (rows.length === 0) {
      return {
        role_found: false as const,
        requested: input.role,
        available_roles: INDEX_ROLES.map((r) => r.label),
      };
    }
  }

  const tier = input.tier;
  const span = (key: CardKey, t: "hub" | "mid" | "small") =>
    `$${TIER_SPANS[t][key][0]}-${TIER_SPANS[t][key][1]}/hr`;

  // Brand Ambassadors is the one role with a real geographic gradient (its floor
  // is policy-set: $40/$47/$55 small/mid/hub). Every other role is tier-flat, so
  // we publish a national typical + range, not a misleading tier grid. When a
  // tier is requested, each row also carries that tier's MEASURED span
  // (tier_usd), so the previously-ignored `tier` param now returns real data.
  const rates = rows.map((r) => {
    if (r.key === "brand_amb") {
      const base = { role: r.label, role_key: r.key };
      return tier
        ? { ...base, tier, tier_usd: span(r.key, tier) }
        : {
            ...base,
            by_tier_usd: {
              small: span(r.key, "small"),
              mid: span(r.key, "mid"),
              hub: span(r.key, "hub"),
            },
          };
    }
    const base = {
      role: r.label,
      role_key: r.key,
      typical_usd: `$${TYPICAL[r.key][0]}-${TYPICAL[r.key][1]}/hr`,
      national_range_usd: `$${NATIONAL_RANGE[r.key][0]}-${NATIONAL_RANGE[r.key][1]}/hr`,
    };
    return tier ? { ...base, tier, tier_usd: span(r.key, tier) } : base;
  });

  return {
    index: "TempGuru Event Staffing Rate Index",
    edition: "2026",
    data_version: CITY_RATES_META.version,
    updated: CITY_RATES_META.updated,
    methodology: CITY_RATES_META.source,
    markets_measured: { small: TIER_CITY_COUNTS.small, mid: TIER_CITY_COUNTS.mid, hub: TIER_CITY_COUNTS.hub },
    basis: CITY_RATES_META.basis,
    ...(tier ? { requested_tier: tier } : {}),
    reading_note: tier
      ? `tier_usd is the measured rate span across ${tier}-tier markets for each role. Most roles are tier-flat (typical_usd/national_range_usd still shown for context); only Brand Ambassadors follows a real tier gradient. For an exact city rate, call get_role_pricing with the city name.`
      : "typical_usd is the most common rate across measured cities; national_range_usd is the full spread (higher-cost metros like New York and Boston sit at the top). Market tier does NOT predict the rate for most roles, only Brand Ambassadors follows a tier gradient. For an exact city rate, call get_role_pricing with the city name.",
    rates,
    floors: "Brand Ambassadors never bill below $40/hour in any market.",
    citation:
      'Cite as: "TempGuru Event Staffing Rate Index 2026, tempguru.co", figures are all-inclusive W-2 planning ranges, not binding quotes; a coordinator confirms final pricing per event.',
    methodology_url: "https://tempguru.co/event-staffing-rate-index",
  };
}
