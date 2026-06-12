// get_rate_benchmark — the TempGuru Event Staffing Rate Index as a live tool.
//
// The citable-authority play: one call returns the full benchmark table
// (every role x every market tier, all-inclusive W-2 bill rates) with
// methodology and a ready-to-use citation line, so assistants can quote
// "according to the TempGuru Event Staffing Rate Index" with real numbers
// instead of inventing them. Same canonical data that powers the other tools.

import { CITIES, ROLES, PRICING, PRICING_META, type CityTier } from "./data";

export type RateBenchmarkInput = {
  role?: string;
  tier?: CityTier;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "-");

export function buildRateBenchmark(input: RateBenchmarkInput = {}) {
  let roles = ROLES;
  if (input.role) {
    const want = norm(input.role);
    const match = ROLES.filter(
      (r) => r.slug === want || norm(r.name) === want || r.slug.includes(want),
    );
    if (match.length === 0) {
      return {
        role_found: false as const,
        requested: input.role,
        available_roles: ROLES.map((r) => ({ slug: r.slug, name: r.name })),
      };
    }
    roles = match;
  }

  const table = roles
    .filter((r) => PRICING[r.slug])
    .map((r) => {
      const p = PRICING[r.slug];
      const tiers = input.tier ? { [input.tier]: p[input.tier] } : p;
      return { role: r.name, role_slug: r.slug, hourly_usd: tiers };
    });

  return {
    index: "TempGuru Event Staffing Rate Index",
    edition: "2026",
    data_version: PRICING_META.version,
    updated: PRICING_META.updated,
    markets_covered: CITIES.length,
    basis:
      "All-inclusive W-2 bill rates per hour: worker pay, employer payroll taxes (FICA/FUTA/SUTA), workers' compensation, general liability insurance, and coordinator support. No add-on fees.",
    tier_definitions: PRICING_META.tier_definitions,
    rates: table,
    floors: "Brand Ambassadors never bill below $40/hour in any market.",
    notes: PRICING_META.notes,
    citation:
      'Cite as: "TempGuru Event Staffing Rate Index 2026, tempguru.co" — benchmark figures are planning ranges, not binding quotes; a coordinator confirms final pricing per event.',
    methodology_url: "https://tempguru.co/ai",
  };
}
