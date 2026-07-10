// Deterministic unit tests for the pure resolver + lead-trust date logic.
// esbuild-bundles the TS modules (no network, no MCP) and asserts behavior that
// the golden MCP cases can't easily reach. Run: npm run test:unit

import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

async function load(rel) {
  const result = await build({
    entryPoints: [join(repoRoot, rel)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const tmp = join(mkdtempSync(join(tmpdir(), "unit-")), "mod.mjs");
  writeFileSync(tmp, result.outputFiles[0].text);
  return import(pathToFileURL(tmp).href);
}

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name + (detail ? ` (${detail})` : ""));
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  }
}

const { findCity, findRole, suggestCity } = await load("src/lib/mcp/data.ts");
const { parseEventStart } = await load("src/lib/notion/lead-trust.ts");
const { buildStaffingPlan } = await load("src/lib/mcp/plan-staffing.ts");
const { buildRateBenchmark } = await load("src/lib/mcp/rate-benchmark.ts");

// ── City resolution ──
const cityCases = [
  ["New York", "New York City"],
  ["NYC", "New York City"],
  ["Vegas", "Las Vegas"],
  ["LA", "Los Angeles"],
  ["SF", "San Francisco"],
  ["Washington DC", "Washington D.C."],
  ["DC", "Washington D.C."],
  ["Austin TX", "Austin"],
  ["Austin, Texas", "Austin"],
  ["Brooklyn", "New York City"],
  ["Mississauga", "Toronto"],
  ["St Louis", "St. Louis"],
  ["Ft Worth", "Fort Worth"],
];
for (const [input, expected] of cityCases) {
  const got = findCity(input)?.name ?? "NOT FOUND";
  check(`findCity("${input}") -> ${expected}`, got === expected, `got ${got}`);
}
// Same-name collision disambiguated by state.
check("findCity('Portland, OR') is Oregon", findCity("Portland, OR")?.state_abbr === "OR");
check("findCity('Portland, ME') is Maine", findCity("Portland, ME")?.state_abbr === "ME");

// CONFIRMED-BUG regressions: typos must NOT silently auto-resolve to a real but
// DIFFERENT covered market; they fall to null and surface as a did-you-mean.
check("findCity('Dover') does NOT resolve to Denver", findCity("Dover") === null, `got ${findCity("Dover")?.name}`);
check("findCity('Gary') does NOT resolve to Cary", findCity("Gary") === null, `got ${findCity("Gary")?.name}`);
check("findCity('Napa') does NOT resolve to Tampa", findCity("Napa") === null, `got ${findCity("Napa")?.name}`);
check("findCity('Cincinatti') is null (typo -> suggestion, not auto-resolve)", findCity("Cincinatti") === null);
check("suggestCity('Cincinatti') offers Cincinnati", suggestCity("Cincinatti")?.name === "Cincinnati", `got ${suggestCity("Cincinatti")?.name}`);
// Springfield: the bare slug is the IL market (matches the canonical rate row);
// MO keeps its explicit springfield-mo slug; a supplied state must be honored.
check("findCity('Springfield, IL') is Springfield, Illinois", findCity("Springfield, IL")?.state === "Illinois", `got ${findCity("Springfield, IL")?.state}`);
check("findCity('Springfield, MO') is Springfield, Missouri", findCity("Springfield, MO")?.state === "Missouri", `got ${findCity("Springfield, MO")?.state}`);
check("findCity('Portland, TX') is null (not Portland, OR)", findCity("Portland, TX") === null, `got ${findCity("Portland, TX")?.state_abbr}`);
// Tightened suggestion gate: a far, unrelated query offers no suggestion.
check("suggestCity('Gotham') offers nothing (too far)", suggestCity("Gotham") === null, `got ${suggestCity("Gotham")?.name}`);
// Gibberish must NOT auto-match.
check("findCity('asdfghjkl') is null", findCity("asdfghjkl") === null);

// ── Role resolution ──
const roleCases = [
  ["brand ambassador", "brand-ambassadors"],
  ["brand ambassadors", "brand-ambassadors"],
  ["usher", "ushers"],
  ["security", "crowd-control"],
  ["greeters", "guest-services"],
  ["check-in staff", "registration-staff"],
  ["event staff", "registration-staff"],
  ["promo models", "brand-ambassadors"],
  ["team lead", "team-leads"],
  ["registration-staff", "registration-staff"],
];
for (const [input, expectedSlug] of roleCases) {
  const got = findRole(input)?.slug ?? "NOT FOUND";
  check(`findRole("${input}") -> ${expectedSlug}`, got === expectedSlug, `got ${got}`);
}
check("findRole('flying trapeze artists') is null", findRole("flying trapeze artists") === null);

// ── Event-date parsing (the ISO/numeric bug) ──
const iso = parseEventStart("2026-08-14");
check("parseEventStart ISO month is August (7), not January", iso?.getUTCMonth() === 7, `got month ${iso?.getUTCMonth()}`);
check("parseEventStart ISO day is 14", iso?.getUTCDate() === 14, `got day ${iso?.getUTCDate()}`);
const usNum = parseEventStart("8/14/2026");
check("parseEventStart US-numeric month is August (7)", usNum?.getUTCMonth() === 7, `got month ${usNum?.getUTCMonth()}`);
const named = parseEventStart("Aug 14-15, 2026");
check("parseEventStart month-name still works (August 14)", named?.getUTCMonth() === 7 && named?.getUTCDate() === 14);
check("parseEventStart returns null when no month/date present", parseEventStart("sometime next quarter") === null);
// CONFIRMED-BUG regressions: month token must not match inside ordinary words,
// and must be read in text order, not calendar order.
check("parseEventStart: 'September ... Mayflower Hotel' is September, not May",
  parseEventStart("September 2026 gala at the Mayflower Hotel")?.getUTCMonth() === 8);
check("parseEventStart: 'June 2026 marketing expo' is June, not March",
  parseEventStart("June 2026 marketing expo")?.getUTCMonth() === 5);
// ISO-8601 datetime must parse (trailing time), and the LATEST date wins.
check("parseEventStart: ISO datetime with T parses",
  parseEventStart("2026-08-14T09:00:00Z")?.getUTCMonth() === 7);
const multi = parseEventStart("Setup 2026-01-05, event 2026-08-14");
check("parseEventStart: picks the later of setup vs event date (August)",
  multi?.getUTCMonth() === 7 && multi?.getUTCDate() === 14, `got ${multi?.toISOString()?.slice(0,10)}`);

// ── plan_staffing weekly OT is per-workweek, not whole-engagement ──
const ot = buildStaffingPlan({ city: "Chicago", roles: [{ role: "brand-ambassadors", headcount: 1, hours_per_shift: 8, days: 14 }] });
const ratio = ot.overtime_adjusted_total_range.low / ot.estimated_total_range.low;
// 14 consecutive 8h days = two 40h weeks => 32 OT hours: (80 + 32*1.5)/112 = 1.14.
// The whole-engagement bug billed 72 OT hours => 1.32.
check("plan_staffing OT ratio is per-week (~1.14), not whole-engagement (~1.32)",
  ratio.toFixed(2) === "1.14", `got ${ratio.toFixed(2)}`);

// ── get_rate_benchmark unknown role ──
check("buildRateBenchmark('wizard') returns role_found:false",
  buildRateBenchmark({ role: "wizard" }).role_found === false);
check("buildRateBenchmark('ushers') returns rates", Array.isArray(buildRateBenchmark({ role: "ushers" }).rates));
check("buildRateBenchmark('event staff') resolves (synonym) to rates",
  Array.isArray(buildRateBenchmark({ role: "event staff" }).rates));

// ── Foreign qualifiers must reject, country names must scope ──
check("findCity('London, UK') is null (never London, Ontario)", findCity("London, UK") === null, `got ${findCity("London, UK")?.state}`);
check("findCity('Austin, UK') is null (never Austin, TX)", findCity("Austin, UK") === null);
check("findCity('Vancouver, Australia') is null", findCity("Vancouver, Australia") === null);
check("findCity('Toronto, Canada') scopes by country", findCity("Toronto, Canada")?.name === "Toronto");
check("findCity('Austin, USA') scopes by country", findCity("Austin, USA")?.name === "Austin");

// ── queries: country filter, default cap, strict dates, role miss ──
const { queryCities, queryAvailability, queryRolePricing } = await load("src/lib/mcp/queries.ts");
const ussr = queryCities({ country: "USSR" });
check("get_cities country=USSR is invalid_param, not all US markets", !ussr.ok && ussr.error.code === "invalid_param");
const uk = queryCities({ country: "United Kingdom" });
check("get_cities country='United Kingdom' is invalid_param", !uk.ok && uk.error.code === "invalid_param");
const allCities = queryCities({});
check("get_cities unfiltered is capped by default (<=100) with a note",
  allCities.ok && allCities.data.returned <= 100 && !!allCities.data.note, `returned ${allCities.ok ? allCities.data.returned : "?"}`);
const impossible = queryAvailability({ city: "Dallas", date: "2027-02-30" });
check("check_availability 2027-02-30 is an impossible-date error, not March 2",
  impossible.ok && "error" in impossible.data && impossible.data.error.includes("Impossible"));
const past = queryAvailability({ city: "Dallas", date: "2024-01-01" });
check("check_availability past date carries in_past:true",
  past.ok && "in_past" in past.data && past.data.in_past === true);
const wiz = queryAvailability({ city: "Boston", date: "2027-03-10", role: "wizard" });
check("check_availability unknown role flags role_found:false",
  wiz.ok && "role_found" in wiz.data && wiz.data.role_found === false);
const secPrice = queryRolePricing({ role: "security guard", city: "Boston" });
check("get_role_pricing 'security guard' carries the unarmed-crowd-control note",
  secPrice.ok && "role_note" in secPrice.data && secPrice.data.role_note.includes("NOT licensed"));

// ── plan_staffing: partial plans can't read as complete ──
const partial = buildStaffingPlan({
  city: "Chicago",
  roles: [
    { role: "registration-staff", headcount: 1, hours_per_shift: 8, days: 1 },
    { role: "brand ambassdor", headcount: 100, hours_per_shift: 8, days: 3 },
  ],
});
check("partial plan: plan_complete is false", partial.status === "plan" && partial.plan_complete === false);
check("partial plan: unpriced_roles retains the dropped headcount",
  partial.unpriced_roles?.[0]?.headcount === 100, `got ${JSON.stringify(partial.unpriced_roles?.[0])}`);
check("partial plan: totals basis declares the exclusion",
  partial.estimated_total_range.basis.includes("EXCLUDES"));
check("partial plan: next_steps blocks quoting first",
  partial.next_steps[0].includes("Do NOT submit"));
const complete = buildStaffingPlan({ city: "Chicago", roles: [{ role: "registration-staff", headcount: 2 }] });
check("complete plan: plan_complete is true", complete.status === "plan" && complete.plan_complete === true);

// ── plan_staffing: OT engine (partial weeks, CA premiums, Canada) ──
// Anchorage (AK: daily 8h, weekly 40h), 8 consecutive 12h days:
// week 1 = max(daily 28, weekly 44) = 44; day 8 remainder = max(daily 4, weekly 0) = 4 → 48 OT hrs.
const anch = buildStaffingPlan({ city: "Anchorage", roles: [{ role: "brand-ambassadors", headcount: 1, hours_per_shift: 12, days: 8 }] });
const anchLow = anch.plan_lines[0].hourly_range.low;
check("AK 8x12h: partial final week earns its daily OT (48 OT hrs)",
  anch.overtime_adjusted_total_range.low === Math.round(48 * anchLow + 48 * anchLow * 1.5),
  `got ${anch.overtime_adjusted_total_range?.low}, want ${Math.round(48 * anchLow + 48 * anchLow * 1.5)}`);
// LA (CA), one 14h day: 8 reg + 4 @1.5x (8-12h) + 2 @2x (>12h) = 18x multiplier.
const la14 = buildStaffingPlan({ city: "Los Angeles", roles: [{ role: "brand-ambassadors", headcount: 1, hours_per_shift: 14, days: 1 }] });
const laLow = la14.plan_lines[0].hourly_range.low;
check("CA 14h day prices double time past 12h",
  la14.overtime_adjusted_total_range.low === Math.round(laLow * (8 + 4 * 1.5 + 2 * 2)),
  `got ${la14.overtime_adjusted_total_range?.low}, want ${Math.round(laLow * 18)}`);
check("CA 14h day: includes_double_time is true", la14.overtime_adjusted_total_range.includes_double_time === true);
// LA (CA), 7 consecutive 5h days: no daily/weekly OT, but the 7th-day premium applies.
const la7 = buildStaffingPlan({ city: "Los Angeles", roles: [{ role: "brand-ambassadors", headcount: 1, hours_per_shift: 5, days: 7 }] });
check("CA seventh consecutive day triggers OT on a 7x5h week",
  la7.overtime_adjusted_total_range !== null, `got ${JSON.stringify(la7.overtime_adjusted_total_range)}`);
// Toronto (ON: weekly 44h), 5 x 10h = 50h → 6 OT hours; compliance is provincial.
const tor = buildStaffingPlan({ city: "Toronto", roles: [{ role: "brand-ambassadors", headcount: 1, hours_per_shift: 10, days: 5 }] });
const torLow = tor.plan_lines[0].hourly_range.low;
check("Toronto: Ontario 44h weekly OT is priced",
  tor.overtime_adjusted_total_range?.low === Math.round(torLow * (44 + 6 * 1.5)),
  `got ${tor.overtime_adjusted_total_range?.low}, want ${Math.round(torLow * 53)}`);
check("Toronto: compliance is provincial (Ontario), wage deferred to coordinator",
  tor.compliance?.jurisdiction === "Ontario" && tor.compliance?.min_wage_usd === null);

// ── plan_staffing: city validated before needs_roles; crew-size + security notes ──
check("city-only call with unknown city returns city_not_found (not the catalog)",
  buildStaffingPlan({ city: "Paris" }).status === "city_not_found");
const crew = buildStaffingPlan({
  city: "Austin",
  roles: [
    { role: "brand-ambassadors", headcount: 10 },
    { role: "registration-staff", headcount: 10 },
  ],
});
check("team-lead note triggers on 20 total staff across roles",
  crew.staffing_notes.some((n) => n.includes("team lead")));
const sec = buildStaffingPlan({ city: "Chicago", roles: [{ role: "security guard", headcount: 4 }] });
check("'security guard' plan carries the unarmed-crowd-control warning",
  sec.status === "plan" && sec.staffing_notes.some((n) => n.includes("NOT licensed")));

// ── lead-trust date parsing regressions ──
const shifty = parseEventStart("2 shifts July 20-21, 2026");
check("parseEventStart: '2 shifts July 20-21, 2026' is July 20, not July 2",
  shifty?.getUTCMonth() === 6 && shifty?.getUTCDate() === 20, `got ${shifty?.toISOString()?.slice(0, 10)}`);
check("parseEventStart: impossible ISO date (2026-02-31) is not silently rolled over",
  parseEventStart("2026-02-31") === null, `got ${parseEventStart("2026-02-31")?.toISOString()?.slice(0, 10)}`);

// ── request_quote schema caps ──
const { RequestQuoteSchema } = await load("src/lib/mcp/quote.ts");
const base = {
  contact_name: "Jane Doe", contact_email: "jane@corp.com", company: "Corp",
  event_name: "Expo", event_type: "trade-show", city: "Chicago", event_dates: "Aug 14-15, 2026",
  roles: [{ role: "registration-staff", headcount: 6 }],
};
check("quote schema rejects a 1M-char event name",
  !RequestQuoteSchema.safeParse({ ...base, event_name: "x".repeat(1_000_000) }).success);
check("quote schema rejects headcount 2147483647",
  !RequestQuoteSchema.safeParse({ ...base, roles: [{ role: "ushers", headcount: 2147483647 }] }).success);
check("quote schema rejects 10,000 roles",
  !RequestQuoteSchema.safeParse({ ...base, roles: Array.from({ length: 10_000 }, () => ({ role: "ushers", headcount: 1 })) }).success);
check("quote schema accepts a normal request", RequestQuoteSchema.safeParse(base).success);

// ── createLead: no config still yields a stable public error + reference ──
delete process.env.NOTION_API_KEY;
delete process.env.Notion_API_Key;
const { createLead } = await load("src/lib/notion/create-lead.ts");
const leadRes = await createLead({
  contact_name: "Jane Doe", contact_email: "jane@example.com", company: "Example Corp",
  event_name: "TEST, please ignore", event_type: "trade-show", city: "Chicago",
  event_dates: "Aug 14-15, 2027", roles: [{ role: "registration-staff", headcount: 2 }],
});
check("createLead without config fails with a generic error + TG reference",
  leadRes.success === false
    && /^TG-[A-HJ-NP-Z2-9]{6}$/.test(leadRes.reference)
    && leadRes.error.includes("not configured")
    && !leadRes.error.includes("Notion API error"),
  JSON.stringify(leadRes));

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("failures:\n - " + failures.join("\n - "));
  process.exit(1);
}
