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

const { findCity, findRole } = await load("src/lib/mcp/data.ts");
const { parseEventStart } = await load("src/lib/notion/lead-trust.ts");

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
  ["Cincinatti", "Cincinnati"], // typo, dist 1
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

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("failures:\n - " + failures.join("\n - "));
  process.exit(1);
}
