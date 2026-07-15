// Measured per-city paid-shift data (site/city-v2/cities-rates.json, mirrored
// here as content/mcp-data/city-rates.json), real rates, NOT a tier average:
// New York event staff is $43-49, Houston is $30-36, both "hub". This layer
// powers the Rate Index benchmark (get_rate_benchmark) through the tier and
// national aggregates below. Per-role bill rates for get_role_pricing and
// plan_staffing come from the published rate card (role-pricing.json), not here.
//
// Role mapping follows the rates-model.md ladder: roles without a separate
// measured rate ride event staff because they ARE event-staff-tier work.

import type { CityTier, Role } from "./data";
import cityRatesData from "../../../content/mcp-data/city-rates.json";
import rateIndexMeta from "../../../content/mcp-data/rate-index-meta.json";

export type CardKey =
  | "event_staff"
  | "ushers"
  | "crowd"
  | "asst_lead"
  | "team_lead"
  | "brand_amb";

type Card = {
  tier: CityTier;
  name: string;
  event_staff: [number, number];
  ushers: [number, number];
  crowd: [number, number];
  asst_lead: [number, number];
  team_lead: [number, number];
  brand_amb: [number, number];
  overall: [number, number];
  avg_staff: [number, number];
};

const CARDS = Object.fromEntries(
  Object.entries(cityRatesData).filter(([k]) => k !== "_meta"),
) as unknown as Record<string, Card>;

// Keep version/provenance beside the measured cards so the MCP result and OKF
// Rate Index cannot silently fall back to the unrelated role-pricing version.
export const CITY_RATES_META = rateIndexMeta;

// ─── role -> card key (rates-model.md ladder) ───────────────────────────────
export function roleKeyFor(role: Role | string): CardKey {
  const n = (typeof role === "string" ? role : `${role.name} ${role.slug}`).toLowerCase();
  if (n.includes("brand amb")) return "brand_amb";
  if (n.includes("usher")) return "ushers";
  if (n.includes("crowd")) return "crowd";
  if (n.includes("asst") || n.includes("assistant")) return "asst_lead";
  if (n.includes("ops support") || n.includes("ops-support") || n.includes("operations support")) return "team_lead";
  if (n.includes("team lead") || n.includes("supervisor") || n.includes("lead")) return "team_lead";
  return "event_staff"; // registration, hospitality, setup, gate, guest services, booth, general/event labor (parking, load/cleanup crew, concessions, merchandise, line management)
}

// ─── tier spans (for the benchmark + unmeasured-city fallback) ──────────────
// A tier is heterogeneous, so the honest summary is the min-low..max-high SPAN
// across the tier's measured cities, not a midpoint.
const TIERS: CityTier[] = ["small", "mid", "hub"];
const KEYS: CardKey[] = ["event_staff", "ushers", "crowd", "asst_lead", "team_lead", "brand_amb"];

function computeSpans(): Record<CityTier, Record<CardKey, [number, number]>> {
  const out = {} as Record<CityTier, Record<CardKey, [number, number]>>;
  for (const t of TIERS) {
    out[t] = {} as Record<CardKey, [number, number]>;
    const cities = Object.values(CARDS).filter((c) => c.tier === t);
    for (const k of KEYS) {
      const lows = cities.map((c) => c[k][0]);
      const highs = cities.map((c) => c[k][1]);
      out[t][k] = [Math.min(...lows), Math.max(...highs)];
    }
  }
  return out;
}
export const TIER_SPANS = computeSpans();

// Most-common [low,high] for a role across a set of cards (the citable "typical"
// rate, far tighter than the span, which outliers blow out).
function mode(cards: Card[], k: CardKey): [number, number] {
  const counts = new Map<string, number>();
  for (const c of cards) {
    const key = `${c[k][0]}-${c[k][1]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = "", n = -1;
  for (const [key, ct] of counts) if (ct > n) { n = ct; best = key; }
  const [lo, hi] = best.split("-").map(Number);
  return [lo, hi];
}

const ALL = Object.values(CARDS);
// National range (full min-max) and typical (national mode) per role.
export const NATIONAL_RANGE = Object.fromEntries(
  KEYS.map((k) => [k, [Math.min(...ALL.map((c) => c[k][0])), Math.max(...ALL.map((c) => c[k][1]))]]),
) as Record<CardKey, [number, number]>;
export const TYPICAL = Object.fromEntries(KEYS.map((k) => [k, mode(ALL, k)])) as Record<CardKey, [number, number]>;

/** Count of measured cities per tier, for the benchmark's methodology line. */
export const TIER_CITY_COUNTS: Record<CityTier, number> = {
  small: Object.values(CARDS).filter((c) => c.tier === "small").length,
  mid: Object.values(CARDS).filter((c) => c.tier === "mid").length,
  hub: Object.values(CARDS).filter((c) => c.tier === "hub").length,
};

// Per-role bill rates (get_role_pricing, plan_staffing) come from the published
// rate card (role-pricing.json via queries.ts), not from this measured layer.
// This module exists to power the Rate Index benchmark (get_rate_benchmark).
