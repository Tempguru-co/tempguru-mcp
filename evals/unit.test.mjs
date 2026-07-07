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
// Explicit but uncovered state must NOT resolve to a same-named city elsewhere.
check("findCity('Springfield, IL') is null (not Springfield, MA)", findCity("Springfield, IL") === null, `got ${findCity("Springfield, IL")?.state_abbr}`);
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

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("failures:\n - " + failures.join("\n - "));
  process.exit(1);
}
