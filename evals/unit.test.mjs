// Deterministic unit tests for the pure resolver + lead-trust date logic.
// esbuild-bundles the TS modules (no network, no MCP) and asserts behavior that
// the golden MCP cases can't easily reach. Run: npm run test:unit

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

// Re-export telemetry and its Redis adapter from one bundle so the eval-memory
// backend is shared and its aggregate writes can be asserted directly.
async function loadTelemetryHarness() {
  const result = await build({
    stdin: {
      contents: `
        export { track } from "./src/lib/telemetry/track.ts";
        export { exec as redisExec } from "./src/lib/telemetry/redis.ts";
      `,
      resolveDir: repoRoot,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const tmp = join(mkdtempSync(join(tmpdir(), "telemetry-unit-")), "mod.mjs");
  writeFileSync(tmp, result.outputFiles[0].text);
  return import(pathToFileURL(tmp).href);
}

// Bundle Route Handlers through their real validation/query code while
// replacing only external side effects. This keeps HTTP contract checks
// deterministic even when a developer has Redis credentials in their shell.
async function loadRestRoute(rel) {
  const sideEffectStubs = {
    name: "rest-route-test-stubs",
    setup(esbuild) {
      for (const name of ["track-rest", "expiring-json-store"]) {
        esbuild.onResolve(
          { filter: new RegExp(`${name}$`) },
          () => ({ path: name, namespace: "rest-route-test" }),
        );
      }
      esbuild.onLoad(
        { filter: /.*/, namespace: "rest-route-test" },
        ({ path }) => ({
          loader: "js",
          contents:
            path === "track-rest"
              ? "export async function trackRest() {}"
              : `export const redisJsonStore = {
                   async get() { return null; },
                   async put() { return "unavailable"; },
                 };
                 export function withCap(promise) { return promise; }`,
        }),
      );
    },
  };
  const result = await build({
    entryPoints: [join(repoRoot, rel)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
    plugins: [sideEffectStubs],
  });
  const tmp = join(mkdtempSync(join(tmpdir(), "rest-route-unit-")), "mod.mjs");
  writeFileSync(tmp, result.outputFiles[0].text);
  return import(pathToFileURL(tmp).href);
}

// Pi and Prime Agent provide TypeBox at runtime. Stub only its schema builders
// so this suite can execute the packaged extension without adding a duplicate
// root dependency; registered tool behavior and fetch calls remain real.
async function loadPiExtension() {
  const typeboxStub = {
    name: "pi-extension-typebox-stub",
    setup(esbuild) {
      esbuild.onResolve(
        { filter: /^typebox$/ },
        () => ({ path: "typebox", namespace: "pi-extension-test" }),
      );
      esbuild.onLoad(
        { filter: /.*/, namespace: "pi-extension-test" },
        () => ({
          loader: "js",
          contents: `
            const schema = (kind) => (...args) => ({ kind, args });
            export const Type = {
              Object: schema("Object"), Optional: schema("Optional"),
              String: schema("String"), Integer: schema("Integer"),
              Union: schema("Union"), Literal: schema("Literal"),
            };
          `,
        }),
      );
    },
  };
  const result = await build({
    entryPoints: [join(repoRoot, "distribution/pi/extensions/tempguru.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
    plugins: [typeboxStub],
  });
  const tmp = join(mkdtempSync(join(tmpdir(), "pi-extension-unit-")), "mod.mjs");
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

const { findCity, findRole, suggestCity, cityDetailUrl, roleDetailUrl } = await load("src/lib/mcp/data.ts");

// URL map: tool results must never emit a deep link to an unpublished page.
// A mapped slug keeps its rich link; an unmapped one degrades to /insights.
check("cityDetailUrl(mapped) keeps the /insights/{slug} link",
  cityDetailUrl({ slug: "champaign-event-staffing" }) === "https://tempguru.co/insights/champaign-event-staffing",
  cityDetailUrl({ slug: "champaign-event-staffing" }));
check("cityDetailUrl(unmapped Anaheim) falls back to /insights, not a 404",
  cityDetailUrl({ slug: "anaheim-event-staffing" }) === "https://tempguru.co/insights",
  cityDetailUrl({ slug: "anaheim-event-staffing" }));
check("roleDetailUrl(mapped brand-ambassadors) keeps the -in-new-york-city link",
  roleDetailUrl({ slug: "brand-ambassadors" }) === "https://tempguru.co/insights/brand-ambassadors-in-new-york-city",
  roleDetailUrl({ slug: "brand-ambassadors" }));
check("roleDetailUrl(unmapped assistant-leads) falls back to /insights, not a 404",
  roleDetailUrl({ slug: "assistant-leads" }) === "https://tempguru.co/insights",
  roleDetailUrl({ slug: "assistant-leads" }));
const { parseEventStart } = await load("src/lib/notion/lead-trust.ts");
const { buildStaffingPlan } = await load("src/lib/mcp/plan-staffing.ts");
const { buildRateBenchmark } = await load("src/lib/mcp/rate-benchmark.ts");
const outputSchemas = await load("src/lib/mcp/output-schemas.ts");

function memoryStore() {
  const rows = new Map();
  const puts = [];
  return {
    rows,
    puts,
    async put(key, value, ttlSeconds, options = {}) {
      puts.push({ key, value, ttlSeconds, options });
      if (options.ifAbsent && rows.has(key)) return "collision";
      rows.set(key, value);
      return "stored";
    },
    async get(key) {
      return rows.get(key) ?? null;
    },
  };
}

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
check("suggestCity('hoston') offers nothing when Boston and Houston tie", suggestCity("hoston") === null, `got ${suggestCity("hoston")?.name}`);
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
check("parseEventStart: ISO range uses its start date",
  parseEventStart("2026-08-14 to 2026-08-15")?.toISOString().slice(0, 10) === "2026-08-14");
check("parseEventStart: US-numeric range with en dash uses its start date",
  parseEventStart("8/14/2026–8/15/2026")?.toISOString().slice(0, 10) === "2026-08-14");
check("parseEventStart: later event range still wins over an independent setup date",
  parseEventStart("Setup 2026-08-01, event 2026-08-14 through 2026-08-15")?.toISOString().slice(0, 10) === "2026-08-14");

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
check("buildRateBenchmark(blank role) returns role_found:false instead of the full index",
  buildRateBenchmark({ role: "   " }).role_found === false);
check("buildRateBenchmark('ushers') returns rates", Array.isArray(buildRateBenchmark({ role: "ushers" }).rates));
check("buildRateBenchmark('event staff') resolves (synonym) to rates",
  Array.isArray(buildRateBenchmark({ role: "event staff" }).rates));

// ── MCP structured-output branch contracts ──
// SDK 1.26 cannot advertise a root oneOf, but the root-object superRefine
// schemas must still reject incomplete variant payloads at runtime.
for (const [name, schema, payload] of [
  ["get_cities", outputSchemas.GET_CITIES_SCHEMA, {}],
  ["check_availability", outputSchemas.CHECK_AVAILABILITY_SCHEMA, { city_found: true }],
  ["get_role_pricing", outputSchemas.GET_ROLE_PRICING_SCHEMA, {}],
  ["get_compliance_by_state", outputSchemas.GET_COMPLIANCE_SCHEMA, {}],
  ["plan_staffing", outputSchemas.PLAN_STAFFING_SCHEMA, { status: "plan" }],
  ["save_staffing_plan", outputSchemas.SAVE_STAFFING_PLAN_SCHEMA, {
    status: "saved", message: "x", next_actions: [],
  }],
  ["get_plan", outputSchemas.GET_PLAN_SCHEMA, { plan_found: true, plan_id: "x", message: "x", next_steps: [] }],
  ["get_policies", outputSchemas.GET_POLICIES_SCHEMA, { status: "policies", policy_found: true }],
  ["get_quote_status", outputSchemas.GET_QUOTE_STATUS_SCHEMA, { quote_found: true, reference: "x", message: "x", follow_up: "x" }],
  ["get_rate_benchmark", outputSchemas.RATE_BENCHMARK_SCHEMA, {}],
  ["request_quote", outputSchemas.REQUEST_QUOTE_HANDOFF_SCHEMA, {
    handoff_ready: true,
    buyer_submission_required: true,
    plan_found: true,
    plan_id: "ABCDEFGH2345",
    message: "x",
    next_steps: [],
  }],
]) {
  check(`${name} output schema rejects an incomplete branch`, !schema.safeParse(payload).success);
}

// ── Foreign qualifiers must reject, country names must scope ──
check("findCity('London, UK') is null (never London, Ontario)", findCity("London, UK") === null, `got ${findCity("London, UK")?.state}`);
check("findCity('Austin, UK') is null (never Austin, TX)", findCity("Austin, UK") === null);
check("findCity('Vancouver, Australia') is null", findCity("Vancouver, Australia") === null);
check("findCity('Toronto, Canada') scopes by country", findCity("Toronto, Canada")?.name === "Toronto");
check("findCity('Austin, USA') scopes by country", findCity("Austin, USA")?.name === "Austin");

// ── queries: country filter, default cap, strict dates, role miss ──
const { queryCities, queryRoles, queryAvailability, queryRolePricing } = await load("src/lib/mcp/queries.ts");
const ussr = queryCities({ country: "USSR" });
check("get_cities country=USSR is invalid_param, not all US markets", !ussr.ok && ussr.error.code === "invalid_param");
const uk = queryCities({ country: "United Kingdom" });
check("get_cities country='United Kingdom' is invalid_param", !uk.ok && uk.error.code === "invalid_param");
const allCities = queryCities({});
check("get_cities unfiltered is capped by default (<=100) with a note",
  allCities.ok && allCities.data.returned <= 100 && !!allCities.data.note, `returned ${allCities.ok ? allCities.data.returned : "?"}`);
const anaheim = queryCities({ city: "Anaheim" });
check("get_cities uses the sitemap-verified Anaheim detail URL",
  anaheim.ok && anaheim.data.city?.url === "https://tempguru.co/california-event-staffing");
const assistantLead = queryRoles().data.roles.find((role) => role.slug === "assistant-leads");
check("get_roles avoids the nonexistent Assistant Leads city-guide URL",
  assistantLead?.url === "https://tempguru.co/roles");
const impossible = queryAvailability({ city: "Dallas", date: "2027-02-30" });
check("check_availability 2027-02-30 is an impossible-date error, not March 2",
  impossible.ok && "error" in impossible.data && impossible.data.error.includes("Impossible"));
const past = queryAvailability({ city: "Dallas", date: "2024-01-01" });
check("check_availability past date carries in_past:true",
  past.ok && "in_past" in past.data && past.data.in_past === true);
const humanRange = queryAvailability({ city: "Chicago", date: "Aug 14-15, 2026" });
check("check_availability canonicalizes human date ranges without native-Date drift",
  humanRange.ok && "event_date" in humanRange.data && humanRange.data.event_date === "2026-08-14");
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
  partial.next_steps[0].includes("Do NOT prepare"));
const complete = buildStaffingPlan({ city: "Chicago", roles: [{ role: "registration-staff", headcount: 2 }] });
check("complete plan: plan_complete is true", complete.status === "plan" && complete.plan_complete === true);
check("US plan compliance retains wage source and dataset freshness",
  complete.status === "plan"
    && !!complete.compliance?.min_wage_source
    && !!complete.compliance?.min_wage_as_of
    && !!complete.compliance?.data_current_as_of);

// ── plan persistence / handoff: allowlist, TTL, signature, resume ──
const {
  PLAN_TTL_SECONDS,
  buildPlanContinuation,
  canRestorePlanLink,
  persistCompletePlan,
  querySavedPlan,
  rolesMateriallyDiffer,
  snapshotFromPlan,
  verifyPlanLinkSignature,
} = await load("src/lib/mcp/plan-store.ts");
const piiPlan = buildStaffingPlan({
  city: "Chicago",
  event_date: "2027-03-10",
  event_type: "trade-show",
  description: "Ask Alice at alice@example.com",
  roles: [{ role: "brand-ambassadors", headcount: 5, hours_per_shift: 8, days: 2 }],
});
const safeSnapshot = snapshotFromPlan(
  piiPlan,
  "Chicago",
  "mcp",
  "alice@example.com",
  "2026-07-11T12:00:00.000Z",
);
const snapshotJson = JSON.stringify(safeSnapshot);
check("plan snapshot excludes free-text description and email-shaped source PII",
  !snapshotJson.includes("Alice") && !snapshotJson.includes("alice") && safeSnapshot.source === "other",
  snapshotJson);
check("plan snapshot contains only the requested planning event fields",
  Object.keys(safeSnapshot.event).sort().join(",") === "attendees,event_date,event_type");
const hostilePlan = buildStaffingPlan({
  city: "Chicago",
  event_date: "alice@example.com",
  event_type: "Call Alice Example",
  roles: [{ role: "ushers", headcount: 2 }],
});
const hostileSnapshot = snapshotFromPlan(hostilePlan, "Chicago", "mcp");
check("plan snapshot canonicalizes free-form date/type before Redis",
  hostileSnapshot.event.event_date === null
    && hostileSnapshot.event.event_type === "other"
    && !JSON.stringify(hostileSnapshot).includes("Alice")
    && !JSON.stringify(hostileSnapshot).includes("alice@example.com"));
const humanDatePlan = buildStaffingPlan({
  city: "Chicago",
  event_date: "Aug 14-15, 2026",
  event_type: "trade show",
  roles: [{ role: "ushers", headcount: 2 }],
});
const humanDateSnapshot = snapshotFromPlan(humanDatePlan, "Chicago", "mcp");
check("recognized human event date persists as safe ISO without losing handoff date",
  humanDateSnapshot.event.event_date === "2026-08-14"
    && humanDateSnapshot.event.event_type === "trade-show");

const signed = buildPlanContinuation(safeSnapshot, "ABCDEFGH2345", {
  secret: "unit-test-secret",
  nowSeconds: 1_000,
});
const signedUrl = new URL(signed.form_url);
const signedExp = Number(signedUrl.searchParams.get("exp"));
const signedSig = signedUrl.searchParams.get("sig") ?? "";
check("plan handoff HMAC verifies before expiry",
  verifyPlanLinkSignature("ABCDEFGH2345", signedExp, signedSig, "unit-test-secret", 1_001));
check("plan handoff HMAC rejects at expiry",
  !verifyPlanLinkSignature("ABCDEFGH2345", signedExp, signedSig, "unit-test-secret", signedExp));
check("plan handoff HMAC rejects tampered id, expiry, signature, and wrong secret",
  !verifyPlanLinkSignature("ABCDEFGH2346", signedExp, signedSig, "unit-test-secret", 1_001)
    && !verifyPlanLinkSignature("ABCDEFGH2345", signedExp + 1, signedSig, "unit-test-secret", 1_001)
    && !verifyPlanLinkSignature("ABCDEFGH2345", signedExp, "0".repeat(64), "unit-test-secret", 1_001)
    && !verifyPlanLinkSignature("ABCDEFGH2345", signedExp, signedSig, "wrong-secret", 1_001));
check("signed plan links cannot be downgraded by deleting sig and exp",
  canRestorePlanLink("ABCDEFGH2345", {
    signatureParametersPresent: false,
    secret: "unit-test-secret",
    nowSeconds: 1_001,
  }) === false);
check("signed plan links restore only with both valid parameters",
  canRestorePlanLink("ABCDEFGH2345", {
    signature: signedSig,
    rawExpiry: String(signedExp),
    signatureParametersPresent: true,
    secret: "unit-test-secret",
    nowSeconds: 1_001,
  }) === true
    && canRestorePlanLink("ABCDEFGH2345", {
      signature: signedSig,
      signatureParametersPresent: true,
      secret: "unit-test-secret",
      nowSeconds: 1_001,
    }) === false);
const unsignedUrl = new URL(buildPlanContinuation(safeSnapshot, "ABCDEFGH2345", {
  secret: "",
  nowSeconds: 1_000,
}).form_url);
check("plan handoff omits signature fields when PLAN_LINK_SECRET is unset",
  !unsignedUrl.searchParams.has("sig") && !unsignedUrl.searchParams.has("exp"));
check("unsigned plan links work only when signing is disabled and no signature params appear",
  canRestorePlanLink("ABCDEFGH2345", {
    signatureParametersPresent: false,
    secret: "",
    nowSeconds: 1_001,
  }) === true
    && canRestorePlanLink("ABCDEFGH2345", {
      signature: signedSig,
      rawExpiry: String(signedExp),
      signatureParametersPresent: true,
      secret: "",
      nowSeconds: 1_001,
    }) === false);
check("plan handoff carries compact human-prefill params",
  signedUrl.searchParams.get("city") === "Chicago"
    && signedUrl.searchParams.get("roles") === "brand-ambassadors:5"
    && signedUrl.searchParams.get("utm_medium") === "mcp");
const attributedSnapshot = snapshotFromPlan(
  piiPlan,
  "Chicago",
  "mcp",
  "openclaw",
  "2026-07-01T00:00:00.000Z",
);
const attributedUrl = new URL(buildPlanContinuation(
  attributedSnapshot,
  "ABCDEFGH2345",
  { secret: "" },
).form_url);
check("plan handoff preserves controlled runtime attribution across website continuation",
  attributedUrl.searchParams.get("utm_medium") === "openclaw"
    && attributedUrl.searchParams.get("source_platform") === "openclaw"
    && attributedUrl.searchParams.get("utm_content") === "mcp");
const {
  sanitizeQuoteAttributionQuery,
  sanitizeQuoteRequestAttribution,
} = await load(
  "src/lib/mcp/quote-attribution.ts",
);
const parsedHandoffAttribution = sanitizeQuoteAttributionQuery(
  Object.fromEntries(attributedUrl.searchParams),
);
check("buyer form parser preserves canonical continuation UTMs",
  parsedHandoffAttribution.source_platform === "openclaw"
    && parsedHandoffAttribution.utm_source === "ai-agent"
    && parsedHandoffAttribution.utm_medium === "openclaw"
    && parsedHandoffAttribution.utm_content === "mcp");
const unsafeHandoffAttribution = sanitizeQuoteAttributionQuery({
  source_platform: "attacker@example.com",
  utm_source: "alice@example.com",
  utm_medium: "claude-ai@example.com",
  utm_campaign: "summer-sale",
  utm_content: ["mcp", "rest"],
});
check("buyer form parser drops unknown, PII-shaped, and duplicate attribution",
  Object.keys(unsafeHandoffAttribution).length === 0,
  JSON.stringify(unsafeHandoffAttribution));
const snapshotCreated = Math.floor(Date.parse(safeSnapshot.created_at) / 1000);
const nearExpiryUrl = new URL(buildPlanContinuation(safeSnapshot, "ABCDEFGH2345", {
  secret: "unit-test-secret",
  nowSeconds: snapshotCreated + PLAN_TTL_SECONDS - 60,
}).form_url);
check("resumed plan handoff cannot outlive the saved snapshot",
  Number(nearExpiryUrl.searchParams.get("exp")) === snapshotCreated + PLAN_TTL_SECONDS);

const planStore = memoryStore();
const persisted = await persistCompletePlan(piiPlan, "Chicago", "mcp", "chatgpt-gpt", planStore);
const restored = await querySavedPlan(persisted.plan_id, planStore);
check("complete plan persists with 30-day TTL + NX collision guard",
  planStore.puts[0]?.ttlSeconds === PLAN_TTL_SECONDS
    && planStore.puts[0]?.options?.ifAbsent === true
    && /^[A-HJ-NP-Z2-9]{12}$/.test(persisted.plan_id));
check("saved plan round-trips through querySavedPlan",
  restored.plan_found === true && restored.snapshot.plan_lines[0].headcount === 5);
check("plan persistence fails open to a prefilled continuation",
  !(
    await persistCompletePlan(piiPlan, "Chicago", "mcp", "chatgpt-gpt", {
      async put() { throw new Error("offline"); },
      async get() { return null; },
    })
  ).plan_id);
let unavailableAttempts = 0;
const unavailablePlan = await persistCompletePlan(piiPlan, "Chicago", "mcp", "chatgpt-gpt", {
  async put() { unavailableAttempts++; return "unavailable"; },
  async get() { return null; },
});
check("plan persistence does not retry an unavailable/slow store as a collision",
  unavailableAttempts === 1 && !unavailablePlan.plan_id);
let collisionAttempts = 0;
const afterCollisions = await persistCompletePlan(piiPlan, "Chicago", "mcp", "chatgpt-gpt", {
  async put() {
    collisionAttempts++;
    return collisionAttempts < 3 ? "collision" : "stored";
  },
  async get() { return null; },
});
check("plan persistence retries actual ID collisions only",
  collisionAttempts === 3 && Boolean(afterCollisions.plan_id));
check("plan role drift canonicalizes synonyms and sums duplicate rows",
  rolesMateriallyDiffer([{ role: "promo models", headcount: 2 }, { role: "brand-ambassadors", headcount: 3 }], safeSnapshot) === false
    && rolesMateriallyDiffer([{ role: "brand-ambassadors", headcount: 7 }], safeSnapshot) === true);

// ── explicit save_staffing_plan: bounded input + outcome contract ──
const {
  SaveStaffingPlanInputSchema,
  saveStaffingPlan,
} = await load("src/lib/mcp/save-staffing-plan.ts");
const explicitSaveInput = {
  city: "Chicago",
  event_date: "2027-03-10",
  event_type: "trade-show",
  attendees: 500,
  roles: [
    {
      role: "brand-ambassadors",
      headcount: 5,
      hours_per_shift: 8,
      days: 2,
    },
  ],
};
check("save_staffing_plan input accepts bounded canonical event fields",
  SaveStaffingPlanInputSchema.safeParse(explicitSaveInput).success);
check("save_staffing_plan input rejects free text and caller-supplied totals/rates",
  !SaveStaffingPlanInputSchema.safeParse({
    ...explicitSaveInput,
    description: "Ask Alice at alice@example.com",
  }).success
    && !SaveStaffingPlanInputSchema.safeParse({
      ...explicitSaveInput,
      estimated_total_range: { low: 1, high: 1 },
    }).success
    && !SaveStaffingPlanInputSchema.safeParse({
      ...explicitSaveInput,
      roles: [{
        ...explicitSaveInput.roles[0],
        hourly_range: { low: 1, high: 1 },
      }],
    }).success);

const explicitSaveStore = memoryStore();
let limiterIp = "";
let persistedServerPlan;
const fixedSaveNow = new Date("2026-07-28T12:00:00.000Z");
const explicitSaved = await saveStaffingPlan(
  explicitSaveInput,
  { channel: "mcp", ip: "203.0.113.10", source: "openclaw" },
  {
    checkRateLimit: async (ip) => {
      limiterIp = ip;
      return { allowed: true };
    },
    persistPlan: async (plan, city, channel, source) => {
      persistedServerPlan = plan;
      return persistCompletePlan(
        plan,
        city,
        channel,
        source,
        explicitSaveStore,
      );
    },
    now: () => fixedSaveNow,
  },
);
const expectedExplicitPlan = buildStaffingPlan(explicitSaveInput);
const restoredExplicit = explicitSaved.status === "saved"
  ? await querySavedPlan(explicitSaved.plan_id, explicitSaveStore)
  : null;
check("save_staffing_plan recomputes canonical rates/totals before persistence",
  persistedServerPlan?.plan_lines?.[0]?.hourly_range?.low
      === expectedExplicitPlan.plan_lines[0].hourly_range.low
    && persistedServerPlan?.estimated_total_range?.low
      === expectedExplicitPlan.estimated_total_range.low);
check("save_staffing_plan saved outcome carries the portable artifact metadata",
  explicitSaved.status === "saved"
    && limiterIp === "203.0.113.10"
    && explicitSaved.schema_version === "1.0"
    && explicitSaved.created_at === fixedSaveNow.toISOString()
    && explicitSaved.expires_at
      === new Date(fixedSaveNow.getTime() + PLAN_TTL_SECONDS * 1000).toISOString()
    && explicitSaved.resource_uri
      === `https://mcp.tempguru.co/api/v1/plans/${explicitSaved.plan_id}`
    && explicitSaved.quote_readiness === "buyer_submission_required"
    && explicitSaved.next_actions.includes("request_quote")
    && restoredExplicit?.plan_found === true
    && restoredExplicit.snapshot.source === "openclaw",
  JSON.stringify(explicitSaved));
check("save_staffing_plan saved outcome matches its output schema",
  outputSchemas.SAVE_STAFFING_PLAN_SCHEMA.safeParse(explicitSaved).success);

let incompleteLimiterCalls = 0;
let incompletePersistCalls = 0;
const explicitIncomplete = await saveStaffingPlan(
  {
    ...explicitSaveInput,
    roles: [
      explicitSaveInput.roles[0],
      { role: "flying trapeze artists", headcount: 2 },
    ],
  },
  {},
  {
    checkRateLimit: async () => {
      incompleteLimiterCalls++;
      return { allowed: true };
    },
    persistPlan: async () => {
      incompletePersistCalls++;
      throw new Error("must not persist");
    },
  },
);
check("save_staffing_plan refuses partial recomputed plans before limiter/storage",
  explicitIncomplete.status === "plan_incomplete"
    && explicitIncomplete.plan_status === "plan"
    && incompleteLimiterCalls === 0
    && incompletePersistCalls === 0
    && outputSchemas.SAVE_STAFFING_PLAN_SCHEMA.safeParse(explicitIncomplete).success,
  JSON.stringify(explicitIncomplete));

let limitedPersistCalls = 0;
const explicitLimited = await saveStaffingPlan(
  explicitSaveInput,
  {},
  {
    checkRateLimit: async () => ({
      allowed: false,
      retryAfterSeconds: 90,
    }),
    persistPlan: async () => {
      limitedPersistCalls++;
      throw new Error("must not persist");
    },
    now: () => fixedSaveNow,
  },
);
check("save_staffing_plan returns rate_limited without touching persistence",
  explicitLimited.status === "rate_limited"
    && explicitLimited.retry_after_seconds === 90
    && limitedPersistCalls === 0
    && explicitLimited.continuation.form_url.includes("mcp.tempguru.co/request-quote")
    && outputSchemas.SAVE_STAFFING_PLAN_SCHEMA.safeParse(explicitLimited).success,
  JSON.stringify(explicitLimited));

const unavailableContinuation = {
  form_url:
    "https://mcp.tempguru.co/request-quote?city=Chicago&utm_source=ai-agent&utm_medium=mcp",
  note: "Storage unavailable.",
};
const explicitUnavailable = await saveStaffingPlan(
  explicitSaveInput,
  {},
  {
    checkRateLimit: async () => ({ allowed: true }),
    persistPlan: async () => ({ continuation: unavailableContinuation }),
    now: () => fixedSaveNow,
  },
);
check("save_staffing_plan returns storage_unavailable without claiming a plan_id",
  explicitUnavailable.status === "storage_unavailable"
    && !("plan_id" in explicitUnavailable)
    && explicitUnavailable.continuation === unavailableContinuation
    && outputSchemas.SAVE_STAFFING_PLAN_SCHEMA.safeParse(explicitUnavailable).success,
  JSON.stringify(explicitUnavailable));

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

// ── REST buyer-submitted quote schema caps ──
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
check("quote schema accepts bounded attribution + plan_id",
  RequestQuoteSchema.safeParse({
    ...base,
    source_platform: "openclaw",
    skill_id: "urgent-event-backfill",
    skill_version: "1.5.0",
    plan_id: "ABCDEFGH2345",
    utm_source: "ai-agent",
    utm_medium: "openclaw",
    utm_campaign: "quote-handoff",
    utm_content: "mcp",
  }).success);
check("quote schema rejects free-text platform and UTM attribution",
  !RequestQuoteSchema.safeParse({ ...base, source_platform: "attacker@example.com" }).success
    && !RequestQuoteSchema.safeParse({ ...base, utm_source: "alice@example.com" }).success
    && !RequestQuoteSchema.safeParse({ ...base, utm_medium: "claude-ai@example.com" }).success
    && !RequestQuoteSchema.safeParse({ ...base, utm_campaign: "summer-sale" }).success
    && !RequestQuoteSchema.safeParse({ ...base, utm_content: "registration-staff" }).success);
const failOpenAttribution = RequestQuoteSchema.safeParse(
  sanitizeQuoteRequestAttribution({
    ...base,
    source_platform: "stale-client-runtime",
    utm_source: "newsletter",
    utm_medium: "spring-email",
    utm_campaign: "spring-2026",
    utm_content: { arbitrary: true },
    skill_id: "retired-client-skill",
    skill_version: "not-semver",
  }),
);
check("REST quote attribution drops unknown analytics without rejecting the lead",
  failOpenAttribution.success
    && failOpenAttribution.data.source_platform === undefined
    && failOpenAttribution.data.utm_source === undefined
    && failOpenAttribution.data.utm_medium === undefined
    && failOpenAttribution.data.utm_campaign === undefined
    && failOpenAttribution.data.utm_content === undefined
    && failOpenAttribution.data.skill_id === undefined
    && failOpenAttribution.data.skill_version === undefined,
  JSON.stringify(failOpenAttribution));
check("quote schema rejects arbitrary skill attribution",
  !RequestQuoteSchema.safeParse({ ...base, skill_id: "made-up-skill" }).success);
check("quote schema rejects email-shaped skill version attribution",
  !RequestQuoteSchema.safeParse({
    ...base,
    skill_id: "event-staffing-ordering",
    skill_version: "megan@example.com",
  }).success);
// Additive capture fields (venue / attendees / multi-city locations[]); required
// fields stay required (additive-only change).
check("quote schema accepts venue + attendees + multi-city locations[]",
  RequestQuoteSchema.safeParse({
    ...base, venue: "McCormick Place", attendees: 20000,
    locations: [{ city: "Dallas", event_dates: "Aug 20, 2026", roles: [{ role: "registration-staff", headcount: 3 }] }],
  }).success);
check("quote schema still requires company (additive change did not relax it)",
  !RequestQuoteSchema.safeParse({ ...base, company: undefined }).success);
check("quote schema caps locations[] at 50",
  !RequestQuoteSchema.safeParse({ ...base, locations: Array.from({ length: 51 }, () => ({ city: "Dallas" })) }).success);

// ── MCP request_quote is a strict non-PII buyer handoff ──
const {
  RequestQuoteHandoffSchema,
  prepareQuoteHandoff,
} = await load("src/lib/mcp/quote-handoff.ts");
const handoffInput = {
  plan_id: "ABCDEFGH2345",
  source_platform: "claude-ai",
  skill_id: "event-staffing-ordering",
  skill_version: "1.7.0",
};
check("MCP quote handoff accepts only plan reference + bounded attribution",
  RequestQuoteHandoffSchema.safeParse(handoffInput).success);
check("MCP quote handoff rejects email-shaped skill attribution",
  !RequestQuoteHandoffSchema.safeParse({
    ...handoffInput,
    skill_version: "megan@example.com",
  }).success
    && !RequestQuoteHandoffSchema.safeParse({
      ...handoffInput,
      skill_id: "megan@example.com",
    }).success);
check("MCP quote handoff rejects unknown or PII-shaped platform attribution",
  !RequestQuoteHandoffSchema.safeParse({
    ...handoffInput,
    source_platform: "attacker@example.com",
  }).success);
check("MCP quote handoff accepts bounded prerelease SemVer attribution",
  RequestQuoteHandoffSchema.safeParse({
    ...handoffInput,
    skill_version: "1.7.0-rc.1+build.2",
  }).success);
check("MCP quote handoff strictly rejects legacy contact fields",
  !RequestQuoteHandoffSchema.safeParse({
    ...handoffInput,
    contact_name: "Jane Doe",
    contact_email: "jane@example.com",
    company: "Example Corp",
  }).success);
check("MCP quote handoff requires a saved plan_id",
  !RequestQuoteHandoffSchema.safeParse({
    source_platform: "claude-ai",
  }).success);

const readyHandoff = await prepareQuoteHandoff(handoffInput, {
  queryPlan: async (planId) => ({
    plan_found: true,
    plan_id: planId,
    snapshot: safeSnapshot,
    continuation: buildPlanContinuation(safeSnapshot, planId, { secret: "" }),
    message: "restored",
    next_steps: [],
  }),
});
const readyHandoffUrl = readyHandoff.handoff_ready
  ? new URL(readyHandoff.form_url)
  : null;
check("MCP quote handoff returns a prefilled buyer-operated form without submitting",
  readyHandoff.handoff_ready === true
    && readyHandoff.buyer_submission_required === true
    && readyHandoff.plan_found === true
    && readyHandoffUrl?.origin === "https://mcp.tempguru.co"
    && readyHandoffUrl?.pathname === "/request-quote"
    && readyHandoffUrl?.searchParams.get("plan") === handoffInput.plan_id
    && readyHandoffUrl?.searchParams.get("source_platform") === "claude-ai"
    && readyHandoffUrl?.searchParams.get("utm_source") === "ai-agent"
    && readyHandoffUrl?.searchParams.get("utm_medium") === "claude-ai"
    && readyHandoffUrl?.searchParams.get("utm_campaign") === "quote-handoff"
    && readyHandoffUrl?.searchParams.get("utm_content") === "mcp"
    && readyHandoffUrl?.searchParams.get("skill_id") === "event-staffing-ordering"
    && !JSON.stringify(readyHandoff).includes("jane@example.com"),
  JSON.stringify(readyHandoff));
check("MCP quote handoff output matches its structured schema",
  outputSchemas.REQUEST_QUOTE_HANDOFF_SCHEMA.safeParse(readyHandoff).success);

const missingHandoff = await prepareQuoteHandoff(handoffInput, {
  queryPlan: async (planId) => ({
    plan_found: false,
    plan_id: planId,
    message: "missing",
    next_steps: [],
  }),
});
check("MCP quote handoff fails safely when the plan expired",
  missingHandoff.handoff_ready === false
    && missingHandoff.plan_found === false
    && !("form_url" in missingHandoff)
    && outputSchemas.REQUEST_QUOTE_HANDOFF_SCHEMA.safeParse(missingHandoff).success);

const {
  normalizeControlledSource,
  normalizeRuntimeAttributionSource,
  normalizeSourcePlatform,
} = await load(
  "src/lib/telemetry/source-tags.ts",
);
const { classifyUserAgent } = await load("src/lib/telemetry/classify-ua.ts");
check("source tags canonicalize underscore aliases and retain known agent runtimes",
  normalizeControlledSource("custom_gpt") === "custom-gpt"
    && normalizeControlledSource("mcp-handoff") === "mcp-handoff"
    && normalizeControlledSource("prime-agent") === "prime-agent"
    && normalizeSourcePlatform("prime-agent") === "prime-agent"
    && normalizeSourcePlatform("openai-codex") === "openai-codex"
    && normalizeSourcePlatform("qwen-ecosystem") === "qwen-ecosystem"
    && normalizeSourcePlatform("alice@example.com") === "other");
check("unknown public source tags do not suppress a classified runtime",
  normalizeRuntimeAttributionSource("custom_gpt", "claude-ai") === "custom-gpt"
    && normalizeRuntimeAttributionSource("prime-agent", "mcp-client") === "prime-agent"
    && normalizeRuntimeAttributionSource("attacker@example.com", "claude-ai") === "claude-ai"
    && normalizeRuntimeAttributionSource("", "ClaudeBot") === null);
check("interactive Claude UA yields a canonical handoff platform while crawlers do not",
  normalizeSourcePlatform(classifyUserAgent("claude-user")) === "claude-ai"
    && normalizeSourcePlatform(classifyUserAgent("ClaudeBot")) === "other");

// ── Shared Pi / Prime Agent package runtime attribution ──
{
  const {
    default: registerPiExtension,
    resolveRuntimeSource,
  } = await loadPiExtension();
  const registeredTools = [];
  registerPiExtension({
    registerTool(tool) {
      registeredTools.push(tool);
    },
  });
  const cityTool = registeredTools.find((tool) => tool.name === "tempguru_get_cities");
  const quoteTool = registeredTools.find((tool) => tool.name === "tempguru_request_quote");
  check("shared agent package registers its native city and quote tools",
    Boolean(cityTool && quoteTool),
    registeredTools.map((tool) => tool.name).join(", "));

  check("runtime resolver uses Prime's exact process title with a config-marker fallback",
    resolveRuntimeSource({}, "prime-agent") === "prime-agent"
      && resolveRuntimeSource({}, "Prime-Agent") === "prime-agent"
      && resolveRuntimeSource({ PRIME_AGENT_CODING_AGENT_DIR: "/tmp/.prime/agent" }, "node") === "prime-agent"
      && resolveRuntimeSource({ PRIME_AGENT_CODING_AGENT_DIR: "  " }, "node") === "pi"
      && resolveRuntimeSource({}, "prime-agent-helper") === "pi"
      && resolveRuntimeSource({}, "node") === "pi");

  const hadPrimeMarker = Object.hasOwn(process.env, "PRIME_AGENT_CODING_AGENT_DIR");
  const priorPrimeMarker = process.env.PRIME_AGENT_CODING_AGENT_DIR;
  const priorProcessTitle = process.title;
  const priorFetch = globalThis.fetch;
  const extensionCalls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    extensionCalls.push({ url, init });
    const payload = url.pathname.startsWith("/api/v1/plans/")
      ? {
          plan_found: true,
          continuation: {
            form_url:
              "https://mcp.tempguru.co/request-quote?plan=ABCDEFGH2345&utm_source=ai-agent&utm_medium=rest",
          },
        }
      : { cities: [] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    delete process.env.PRIME_AGENT_CODING_AGENT_DIR;
    process.title = "node";
    await cityTool.execute(
      "pi-city",
      { city: "Chicago" },
      new AbortController().signal,
    );
    const piQuote = await quoteTool.execute(
      "pi-quote",
      { plan_id: "ABCDEFGH2345" },
      new AbortController().signal,
    );
    const piQuoteBody = JSON.parse(piQuote.content[0].text);
    const piQuoteUrl = new URL(piQuoteBody.form_url);

    process.title = "prime-agent";
    await cityTool.execute(
      "prime-city",
      { city: "Chicago" },
      new AbortController().signal,
    );
    const primeQuote = await quoteTool.execute(
      "prime-quote",
      { plan_id: "ABCDEFGH2345", skill_id: "event-staffing-ordering", skill_version: "1.7.0" },
      new AbortController().signal,
    );
    const primeQuoteBody = JSON.parse(primeQuote.content[0].text);
    const primeQuoteUrl = new URL(primeQuoteBody.form_url);

    const piCalls = extensionCalls.slice(0, 2);
    const primeCalls = extensionCalls.slice(2);
    check("native REST calls resolve Pi attribution at request time",
      piCalls.length === 2
        && piCalls.every((entry) =>
          entry.url.searchParams.get("source") === "pi"
            && new Headers(entry.init?.headers).get("x-tempguru-source") === "pi")
        && piQuoteUrl.searchParams.get("source_platform") === "pi"
        && piQuoteUrl.searchParams.get("utm_medium") === "pi",
      JSON.stringify({
        calls: piCalls.map((entry) => entry.url.toString()),
        handoff: piQuoteBody.form_url,
      }));
    check("native REST calls resolve Prime Agent attribution at request time",
      primeCalls.length === 2
        && primeCalls.every((entry) =>
          entry.url.searchParams.get("source") === "prime-agent"
            && new Headers(entry.init?.headers).get("x-tempguru-source") === "prime-agent"),
      primeCalls.map((entry) => entry.url.toString()).join(", "));
    check("Prime Agent quote handoff carries matching platform and UTM attribution",
      primeQuoteBody.handoff_ready === true
        && primeQuoteUrl.searchParams.get("source_platform") === "prime-agent"
        && primeQuoteUrl.searchParams.get("utm_medium") === "prime-agent"
        && primeQuoteUrl.searchParams.get("utm_source") === "ai-agent"
        && primeQuoteUrl.searchParams.get("utm_campaign") === "quote-handoff"
        && primeQuoteUrl.searchParams.get("utm_content") === "rest"
        && primeQuoteUrl.searchParams.get("skill_id") === "event-staffing-ordering"
        && primeQuoteUrl.searchParams.get("skill_version") === "1.7.0",
      primeQuoteBody.form_url);
  } finally {
    globalThis.fetch = priorFetch;
    process.title = priorProcessTitle;
    if (hadPrimeMarker) process.env.PRIME_AGENT_CODING_AGENT_DIR = priorPrimeMarker;
    else delete process.env.PRIME_AGENT_CODING_AGENT_DIR;
  }
}
const {
  canonicalTelemetryCity,
  canonicalTelemetryCountry,
  canonicalTelemetryRole,
  canonicalTelemetryState,
  normalizeSourceSkill,
} = await load("src/lib/telemetry/track.ts");
check("telemetry persists only canonical catalog/geography dimensions",
  canonicalTelemetryRole("promo models") === "brand-ambassadors"
    && canonicalTelemetryRole("alice@example.com") === null
    && canonicalTelemetryCity("Chicago") === "chicago"
    && canonicalTelemetryCity("Megan Hayward") === null
    && canonicalTelemetryState("Texas") === "TX"
    && canonicalTelemetryState("alice@example.com") === null
    && canonicalTelemetryCountry("us") === "US"
    && canonicalTelemetryCountry("megan@example.com") === null);
check("telemetry accepts only closed-enum TempGuru skill attribution",
  normalizeSourceSkill("urgent-event-backfill") === "urgent-event-backfill"
    && normalizeSourceSkill("made-up-skill") === null);

// ── browser-origin enforcement + response hardening ──
const { MACHINE_RESPONSE_CSP } = await load("src/lib/http/security.ts");
const hasMachineSecurity = (response) =>
  response.headers.get("x-content-type-options") === "nosniff"
  && response.headers.get("content-security-policy") === MACHINE_RESPONSE_CSP;
const variesOnOrigin = (response) =>
  response.headers.get("vary")
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .includes("origin") === true;

const mcpRoute = await load("src/app/mcp/route.ts");
const mcpAttackerPost = await mcpRoute.POST(new Request(
  "https://mcp.tempguru.co/mcp",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: "{}",
  },
));
const mcpAttackerPreflight = await mcpRoute.OPTIONS(new Request(
  "https://mcp.tempguru.co/mcp",
  { method: "OPTIONS", headers: { Origin: "https://attacker.example" } },
));
const mcpNullOriginPreflight = await mcpRoute.OPTIONS(new Request(
  "https://mcp.tempguru.co/mcp",
  { method: "OPTIONS", headers: { Origin: "null" } },
));
const mcpTrustedPreflight = await mcpRoute.OPTIONS(new Request(
  "https://mcp.tempguru.co/mcp",
  { method: "OPTIONS", headers: { Origin: "https://claude.ai" } },
));
const mcpServerPreflight = await mcpRoute.OPTIONS(new Request(
  "https://mcp.tempguru.co/mcp",
  { method: "OPTIONS" },
));
check("MCP rejects untrusted and opaque browser origins before handler work",
  mcpAttackerPost.status === 403
    && mcpAttackerPreflight.status === 403
    && mcpNullOriginPreflight.status === 403
    && mcpAttackerPost.headers.get("access-control-allow-origin") === null
    && mcpAttackerPreflight.headers.get("access-control-allow-origin") === null
    && hasMachineSecurity(mcpAttackerPost)
    && hasMachineSecurity(mcpAttackerPreflight)
    && variesOnOrigin(mcpAttackerPost));
check("MCP echoes only a trusted browser Origin and preserves controlled attribution header",
  mcpTrustedPreflight.status === 204
    && mcpTrustedPreflight.headers.get("access-control-allow-origin") === "https://claude.ai"
    && mcpTrustedPreflight.headers.get("access-control-allow-headers")
      ?.split(",")
      .map((value) => value.trim().toLowerCase())
      .includes("x-tempguru-source") === true
    && hasMachineSecurity(mcpTrustedPreflight)
    && variesOnOrigin(mcpTrustedPreflight));
check("MCP keeps non-browser server clients compatible without wildcard CORS",
  mcpServerPreflight.status === 204
    && mcpServerPreflight.headers.get("access-control-allow-origin") === null
    && hasMachineSecurity(mcpServerPreflight)
    && variesOnOrigin(mcpServerPreflight));

const quoteRoute = await load("src/app/api/v1/quote-requests/route.ts");
const quoteAttackerPost = await quoteRoute.POST(new Request(
  "https://mcp.tempguru.co/api/v1/quote-requests",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: "{}",
  },
));
const quoteTrustedInvalid = await quoteRoute.POST(new Request(
  "https://mcp.tempguru.co/api/v1/quote-requests",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Origin: "https://www.tempguru.co",
    },
    body: "{}",
  },
));
const quoteServerInvalid = await quoteRoute.POST(new Request(
  "https://mcp.tempguru.co/api/v1/quote-requests",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  },
));
const quoteTextPlain = await quoteRoute.POST(new Request(
  "https://mcp.tempguru.co/api/v1/quote-requests",
  {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Origin: "https://www.tempguru.co",
    },
    body: "{}",
  },
));
const quoteAttackerPreflight = await quoteRoute.OPTIONS(new Request(
  "https://mcp.tempguru.co/api/v1/quote-requests",
  { method: "OPTIONS", headers: { Origin: "https://attacker.example" } },
));
const quoteTrustedPreflight = await quoteRoute.OPTIONS(new Request(
  "https://mcp.tempguru.co/api/v1/quote-requests",
  { method: "OPTIONS", headers: { Origin: "https://tempguru.co" } },
));
const quoteServerPreflight = await quoteRoute.OPTIONS(new Request(
  "https://mcp.tempguru.co/api/v1/quote-requests",
  { method: "OPTIONS" },
));
check("quote write rejects untrusted browser origins without an ACAO response",
  quoteAttackerPost.status === 403
    && quoteAttackerPreflight.status === 403
    && quoteAttackerPost.headers.get("access-control-allow-origin") === null
    && quoteAttackerPreflight.headers.get("access-control-allow-origin") === null
    && hasMachineSecurity(quoteAttackerPost)
    && variesOnOrigin(quoteAttackerPost));
check("quote write requires application/json and accepts the charset form",
  quoteTextPlain.status === 415
    && quoteTrustedInvalid.status === 400
    && quoteTrustedInvalid.headers.get("access-control-allow-origin")
      === "https://www.tempguru.co"
    && hasMachineSecurity(quoteTextPlain)
    && hasMachineSecurity(quoteTrustedInvalid));
check("quote write keeps approved server integrations compatible without wildcard CORS",
  quoteServerInvalid.status === 400
    && quoteServerInvalid.headers.get("access-control-allow-origin") === null
    && quoteServerPreflight.status === 204
    && quoteServerPreflight.headers.get("access-control-allow-origin") === null
    && hasMachineSecurity(quoteServerInvalid)
    && hasMachineSecurity(quoteServerPreflight));
check("quote preflight echoes only a trusted Origin and controlled attribution header",
  quoteTrustedPreflight.status === 204
    && quoteTrustedPreflight.headers.get("access-control-allow-origin") === "https://tempguru.co"
    && quoteTrustedPreflight.headers.get("access-control-allow-headers")
      ?.split(",")
      .map((value) => value.trim().toLowerCase())
      .includes("x-tempguru-source") === true
    && hasMachineSecurity(quoteTrustedPreflight)
    && variesOnOrigin(quoteTrustedPreflight));

const vercelOriginEnv = [
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
];
const priorVercelOriginEnv = Object.fromEntries(
  vercelOriginEnv.map((name) => [name, process.env[name]]),
);
try {
  process.env.VERCEL_URL = "tempguru-mcp-preview-abc.vercel.app";
  process.env.VERCEL_BRANCH_URL = "tempguru-mcp-git-hardening.vercel.app";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "mcp.tempguru.co";

  const quoteDeploymentPreflight = await quoteRoute.OPTIONS(new Request(
    "https://tempguru-mcp-preview-abc.vercel.app/api/v1/quote-requests",
    {
      method: "OPTIONS",
      headers: { Origin: "https://tempguru-mcp-preview-abc.vercel.app" },
    },
  ));
  const mcpBranchPreflight = await mcpRoute.OPTIONS(new Request(
    "https://tempguru-mcp-git-hardening.vercel.app/mcp",
    {
      method: "OPTIONS",
      headers: { Origin: "https://tempguru-mcp-git-hardening.vercel.app" },
    },
  ));
  const unrelatedPreviewPreflight = await quoteRoute.OPTIONS(new Request(
    "https://tempguru-mcp-preview-abc.vercel.app/api/v1/quote-requests",
    {
      method: "OPTIONS",
      headers: { Origin: "https://unrelated-project.vercel.app" },
    },
  ));
  check("only the running Vercel deployment and branch hostnames are origin-allowed",
    quoteDeploymentPreflight.status === 204
      && quoteDeploymentPreflight.headers.get("access-control-allow-origin")
        === "https://tempguru-mcp-preview-abc.vercel.app"
      && mcpBranchPreflight.status === 204
      && mcpBranchPreflight.headers.get("access-control-allow-origin")
        === "https://tempguru-mcp-git-hardening.vercel.app"
      && unrelatedPreviewPreflight.status === 403
      && unrelatedPreviewPreflight.headers.get("access-control-allow-origin") === null);
} finally {
  for (const name of vercelOriginEnv) {
    const value = priorVercelOriginEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

const publicResponses = await load("src/lib/api/responses.ts");
const publicReadResponse = publicResponses.jsonOk({}, { ok: true });
check("public read REST data remains openly reusable but gains machine security headers",
  publicReadResponse.headers.get("access-control-allow-origin") === "*"
    && hasMachineSecurity(publicReadResponse));

const { buildOpenApiSpec } = await load("src/lib/api/openapi.ts");
const hardenedOpenApi = buildOpenApiSpec();
const quoteResponses = hardenedOpenApi.paths["/api/v1/quote-requests"].post.responses;
const errorCodes = hardenedOpenApi.components.schemas.Error.properties.error
  .properties.code.enum;
check("OpenAPI declares quote Origin/content-type failures and forbidden errors",
  quoteResponses["403"] !== undefined
    && quoteResponses["415"] !== undefined
    && errorCodes.includes("forbidden"));

const apexWorker = (await load("cloudflare/worker.js")).default;
const apexRobotResponse = await apexWorker.fetch(
  new Request("https://tempguru.co/robots.txt"),
);
const apexDiscoveryResponse = await apexWorker.fetch(
  new Request("https://tempguru.co/.well-known/mcp.json"),
);
const llmsWorker = (await load("cloudflare/llms-worker.js")).default;
const llmsResponse = await llmsWorker.fetch(new Request("https://tempguru.co/llms.txt"));
check("generated Cloudflare discovery responses carry machine security headers",
  hasMachineSecurity(apexRobotResponse)
    && hasMachineSecurity(apexDiscoveryResponse)
    && hasMachineSecurity(llmsResponse));

const publicRequestSchema = JSON.parse(
  readFileSync(join(repoRoot, "public/schemas/event-staffing-request.schema.json"), "utf8"),
);
delete publicRequestSchema.$id;
delete publicRequestSchema.title;
delete publicRequestSchema.description;
const generatedRequestSchema = RequestQuoteSchema.toJSONSchema({ target: "draft-2020-12" });
check("public staffing-request schema exactly matches RequestQuoteSchema",
  JSON.stringify(publicRequestSchema) === JSON.stringify(generatedRequestSchema));

// ── same-origin Agent Skills discovery + digest integrity ──
const skillsIndexRoute = await load("src/app/.well-known/agent-skills/index.json/route.ts");
const skillArtifactRoute = await load(
  "src/app/.well-known/agent-skills/[skill]/SKILL.md/route.ts",
);
const skillsIndexResponse = await skillsIndexRoute.GET();
const skillsIndex = await skillsIndexResponse.json();
const orderingEntry = skillsIndex.skills.find(
  (skill) => skill.name === "event-staffing-ordering",
);
const orderingArtifactResponse = await skillArtifactRoute.GET(
  new Request("https://mcp.tempguru.co/.well-known/agent-skills/event-staffing-ordering/SKILL.md"),
  { params: Promise.resolve({ skill: "event-staffing-ordering" }) },
);
const orderingArtifact = await orderingArtifactResponse.text();
const orderingDigest = `sha256:${createHash("sha256").update(orderingArtifact).digest("hex")}`;
const missingArtifactResponse = await skillArtifactRoute.GET(
  new Request("https://mcp.tempguru.co/.well-known/agent-skills/not-real/SKILL.md"),
  { params: Promise.resolve({ skill: "not-real" }) },
);
check("same-origin skill artifact resolves relative discovery URL with matching digest",
  skillsIndexResponse.status === 200
    && skillsIndex.skills.length === 8
    && orderingEntry.url === "./event-staffing-ordering/SKILL.md"
    && orderingArtifactResponse.status === 200
    && orderingDigest === orderingEntry.digest
    && missingArtifactResponse.status === 404,
  JSON.stringify({ orderingEntry, orderingDigest, missingStatus: missingArtifactResponse.status }));

// ── REST validation parity + non-cacheable lifecycle misses ──
const planRoute = await loadRestRoute("src/app/api/v1/plans/[id]/route.ts");
const malformedPlanResponse = await planRoute.GET(
  new Request("https://mcp.tempguru.co/api/v1/plans/not-a-plan"),
  { params: Promise.resolve({ id: "not-a-plan" }) },
);
const malformedPlanBody = await malformedPlanResponse.json();
check("REST get_plan rejects a malformed plan ID with 400",
  malformedPlanResponse.status === 400
    && malformedPlanBody.error?.code === "invalid_param"
    && malformedPlanBody.error?.field === "id");

const absentPlanResponse = await planRoute.GET(
  new Request("https://mcp.tempguru.co/api/v1/plans/ABCDEFGH2345"),
  { params: Promise.resolve({ id: "ABCDEFGH2345" }) },
);
const absentPlanBody = await absentPlanResponse.json();
check("REST get_plan returns a no-store 200 for a valid absent plan",
  absentPlanResponse.status === 200
    && absentPlanResponse.headers.get("cache-control") === "no-store"
    && absentPlanBody.plan_found === false);

const quoteStatusRoute = await loadRestRoute(
  "src/app/api/v1/quote-requests/[reference]/route.ts",
);
const malformedReferenceResponse = await quoteStatusRoute.GET(
  new Request("https://mcp.tempguru.co/api/v1/quote-requests/TG-123"),
  { params: Promise.resolve({ reference: "TG-123" }) },
);
const malformedReferenceBody = await malformedReferenceResponse.json();
check("REST get_quote_status rejects a malformed reference with 400",
  malformedReferenceResponse.status === 400
    && malformedReferenceBody.error?.code === "invalid_param"
    && malformedReferenceBody.error?.field === "reference");

const absentStatusResponse = await quoteStatusRoute.GET(
  new Request("https://mcp.tempguru.co/api/v1/quote-requests/TG-ABC234"),
  { params: Promise.resolve({ reference: "TG-ABC234" }) },
);
const absentStatusBody = await absentStatusResponse.json();
check("REST get_quote_status returns a no-store 200 for a valid absent reference",
  absentStatusResponse.status === 200
    && absentStatusResponse.headers.get("cache-control") === "no-store"
    && absentStatusBody.quote_found === false);

const policiesRoute = await loadRestRoute("src/app/api/v1/policies/route.ts");
const overlongTopicResponse = await policiesRoute.GET(
  new Request(
    `https://mcp.tempguru.co/api/v1/policies?topic=${encodeURIComponent("x".repeat(81))}`,
  ),
);
const overlongTopicBody = await overlongTopicResponse.json();
check("REST get_policies rejects an overlong topic with 400",
  overlongTopicResponse.status === 400
    && overlongTopicBody.error?.code === "invalid_param"
    && overlongTopicBody.error?.field === "topic");

// ── quote status stub lifecycle: queued -> received, 90-day TTL ──
const {
  buildQuoteStatusDealName,
  QUOTE_STATUS_TTL_SECONDS,
  loadQuoteStatus,
  makeQuoteStatusStub,
  quoteStatusTtlSeconds,
  queryQuoteStatus,
  saveQuoteStatus,
} = await load("src/lib/mcp/quote-status.ts");
const safeStatusDeal = buildQuoteStatusDealName("alice@example.com", "Megan Hayward");
check("quote status display name cannot persist free-form event/city PII",
  safeStatusDeal === "Agent Quote, other · submitted market"
    && !safeStatusDeal.includes("alice")
    && !safeStatusDeal.includes("Megan"));
const statusStore = memoryStore();
const statusCreated = new Date(Date.now() - 1_000).toISOString();
await saveQuoteStatus(
  "TG-ABC234",
  makeQuoteStatusStub("queued", "Agent Quote, trade-show · Chicago", "mcp", statusCreated),
  statusStore,
);
const queuedStatus = await loadQuoteStatus("TG-ABC234", statusStore);
await saveQuoteStatus(
  "TG-ABC234",
  makeQuoteStatusStub("received", "Agent Quote, trade-show · Chicago", "mcp", queuedStatus.created_at),
  statusStore,
);
const receivedStatus = await queryQuoteStatus("TG-ABC234", statusStore);
check("quote status lifecycle updates queued to received and preserves created_at",
  receivedStatus.quote_found === true
    && receivedStatus.status === "received"
    && receivedStatus.created_at === statusCreated);
check("quote status TTL is bounded by the original 90-day creation window",
  quoteStatusTtlSeconds("2026-07-11T12:00:00.000Z", Date.parse("2026-07-11T12:00:00.000Z"))
      === QUOTE_STATUS_TTL_SECONDS
    && quoteStatusTtlSeconds("2026-07-11T12:00:00.000Z", Date.parse("2026-09-09T12:00:00.000Z"))
      === 30 * 24 * 60 * 60
    && statusStore.puts.every((put) => put.ttlSeconds > 0 && put.ttlSeconds <= QUOTE_STATUS_TTL_SECONDS)
    && statusStore.puts[1].ttlSeconds <= statusStore.puts[0].ttlSeconds);

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

// ── durable queue: per-record TTL, inflight replay, dedup timeout ownership ──
const priorNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "test";
process.env.TEMPGURU_EVAL_MEMORY_REDIS = "1";
delete process.env.TEMPGURU_EVAL_DEDUP_SET_DELAY_MS;
delete process.env.NOTION_API_KEY;
delete process.env.Notion_API_Key;
delete process.env.LEAD_WEBHOOK_URL;

const queueModule = await load("src/lib/notion/create-lead.ts");
const telemetryHarness = await loadTelemetryHarness();
await telemetryHarness.track({
  tool: "request_quote",
  status: "success",
  channel: "mcp",
  userAgent: "unit-test",
  ipCountry: "US",
  funnelEvents: ["quote_handoffs"],
  sourcePlatform: "openclaw",
  sourceSkill: "urgent-event-backfill",
});
await telemetryHarness.track({
  tool: "request_quote",
  status: "success",
  channel: "rest",
  userAgent: "unit-test",
  ipCountry: "US",
  funnelEvents: ["quotes_submitted"],
  sourcePlatform: "openclaw",
  sourceSkill: "urgent-event-backfill",
});
const telemetryDate = new Date().toISOString().slice(0, 10);
const [skillAttribution, platformAttribution, funnelAttribution] = await Promise.all([
  telemetryHarness.redisExec((redis) => redis.get(`source-skills:${telemetryDate}`)),
  telemetryHarness.redisExec((redis) => redis.get(`source-platforms:${telemetryDate}`)),
  telemetryHarness.redisExec((redis) => redis.get(`funnel:${telemetryDate}`)),
]);
check("handoff telemetry stays separate from buyer-submitted lead attribution",
  skillAttribution?.["urgent-event-backfill"] === 1
    && platformAttribution?.openclaw === 1
    && funnelAttribution?.["mcp:quote_handoffs"] === 1
    && funnelAttribution?.["rest:quotes_submitted"] === 1
    && !("mcp:quotes_submitted" in (funnelAttribution ?? {})),
  JSON.stringify({ skillAttribution, platformAttribution, funnelAttribution }));
const savedPlanSource = { source: "pi" };
check("lead source precedence is explicit platform, current runtime, then saved plan",
  queueModule.resolveEffectiveSourcePlatform(
    { source_platform: "openclaw", controlled_source: "hermes" },
    savedPlanSource,
  ) === "openclaw"
    && queueModule.resolveEffectiveSourcePlatform(
      { controlled_source: "hermes" },
      savedPlanSource,
    ) === "hermes"
    && queueModule.resolveEffectiveSourcePlatform(
      { source_platform: "attacker@example.com", controlled_source: "hermes" },
      savedPlanSource,
    ) === "hermes"
    && queueModule.resolveEffectiveSourcePlatform(
      { utm_medium: "claude-ai", controlled_source: "mcp-handoff" },
      savedPlanSource,
    ) === "claude-ai"
    && queueModule.resolveEffectiveSourcePlatform({}, savedPlanSource) === "pi");
const queuedInput = {
  contact_name: "Queue Buyer",
  contact_email: "queue@example.com",
  company: "Queue Fixture",
  event_name: "Queue Recovery Expo",
  event_type: "trade-show",
  city: "Chicago",
  event_dates: "Aug 14-15, 2027",
  roles: [{ role: "registration-staff", headcount: 2 }],
};
const queuedLead = await queueModule.createLead(queuedInput);
check("Notion outage persists a lead in the durable queue",
  queuedLead.success === true && queuedLead.captured === "queued" && !queuedLead.deduped,
  JSON.stringify(queuedLead));

const originalFetch = globalThis.fetch;
const notionBodies = [];
const webhookBodies = [];
process.env.NOTION_API_KEY = "ntn_unit_test";
process.env.LEAD_WEBHOOK_URL = "https://hooks.example.test/lead";
globalThis.fetch = async (_url, init) => {
  if (String(_url) === process.env.LEAD_WEBHOOK_URL) {
    webhookBodies.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(null, { status: 204 });
  }
  notionBodies.push(JSON.parse(String(init?.body ?? "{}")));
  return new Response(JSON.stringify({ url: "https://notion.so/unit-test-page" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
try {
  const firstDrain = await queueModule.drainPendingLeads("ntn_unit_test", 99);
  const secondDrain = await queueModule.drainPendingLeads("ntn_unit_test", 99);
  check("bounded queue drain delivers pending leads without waiting for a new quote",
    queueModule.MAX_DRAIN_BATCH === 10
      && firstDrain.delivered === 1
      && secondDrain.delivered === 0
      && notionBodies.length === 1,
    JSON.stringify({ firstDrain, secondDrain, notionWrites: notionBodies.length }));

  const healthyLead = await queueModule.createLead({
    ...queuedInput,
    contact_email: "healthy@example.com",
    event_name: "Healthy Current Expo",
    source_platform: "openclaw",
    controlled_source: "hermes",
    skill_id: "urgent-event-backfill",
    skill_version: "1.5.0",
    utm_source: "ai-agent",
    utm_medium: "openclaw",
    utm_campaign: "quote-handoff",
    utm_content: "mcp",
  });
  const replayedDuplicate = await queueModule.createLead(queuedInput);
  const healthyNotionProperties = notionBodies[1]?.properties ?? {};
  check("lead attribution reaches result, CRM fields, and notification webhook",
    healthyLead.source_platform === "openclaw"
      && healthyLead.skill_id === "urgent-event-backfill"
      && healthyNotionProperties["UTM Source"]?.rich_text?.[0]?.text?.content === "ai-agent"
      && healthyNotionProperties["UTM Medium"]?.rich_text?.[0]?.text?.content
        ?.startsWith("openclaw · campaign=quote-handoff · content=mcp")
      && healthyNotionProperties["UTM Medium"]?.rich_text?.[0]?.text?.content
        ?.includes("skill=urgent-event-backfill")
      && healthyNotionProperties["UTM Medium"]?.rich_text?.[0]?.text?.content
        ?.includes("skill_version=1.5.0")
      && webhookBodies[0]?.source_platform === "openclaw"
      && webhookBodies[0]?.skill_id === "urgent-event-backfill"
      && webhookBodies[0]?.skill_version === "1.5.0"
      && webhookBodies[0]?.utm_source === "ai-agent"
      && webhookBodies[0]?.utm_medium === "openclaw"
      && webhookBodies[0]?.utm_campaign === "quote-handoff"
      && webhookBodies[0]?.utm_content === "mcp",
    JSON.stringify({ healthyLead, healthyNotionProperties, webhook: webhookBodies[0] }));
  check("drained lead is idempotent and duplicate status advances to CRM received",
    healthyLead.success === true
      && healthyLead.captured === "notion"
      && notionBodies.length === 2
      && replayedDuplicate.success === true
      && replayedDuplicate.deduped === true
      && replayedDuplicate.reference === queuedLead.reference
      && replayedDuplicate.captured === "notion",
    JSON.stringify({ healthyLead, replayedDuplicate, notionWrites: notionBodies.length }));

  const revisedCrew = await queueModule.createLead({
    ...queuedInput,
    roles: [{ role: "registration staff", headcount: 3 }],
  });
  check("dedup fingerprint treats a role/headcount/shift revision as a new quote",
    revisedCrew.success === true
      && revisedCrew.deduped !== true
      && revisedCrew.reference !== queuedLead.reference
      && notionBodies.length === 3,
    JSON.stringify({ queuedLead, revisedCrew, notionWrites: notionBodies.length }));

  const concurrentInput = {
    ...queuedInput,
    contact_email: "concurrent@example.com",
    event_name: "Concurrent Capture Expo",
  };
  const trackedFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    if (String(args[0]).includes("api.notion.com")) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return trackedFetch(...args);
  };
  const firstConcurrent = queueModule.createLead(concurrentInput);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const processingDuplicate = await queueModule.createLead(concurrentInput);
  const capturedConcurrent = await firstConcurrent;
  const capturedDuplicate = await queueModule.createLead(concurrentInput);
  globalThis.fetch = trackedFetch;
  check("processing dedup never reports phantom success, then returns captured result",
    capturedConcurrent.success === true
      && capturedConcurrent.captured === "notion"
      && processingDuplicate.success === false
      && processingDuplicate.reference === capturedConcurrent.reference
      && processingDuplicate.error?.includes("still being captured")
      && capturedDuplicate.success === true
      && capturedDuplicate.deduped === true
      && capturedDuplicate.reference === capturedConcurrent.reference
      && notionBodies.length === 4,
    JSON.stringify({ capturedConcurrent, processingDuplicate, capturedDuplicate, notionWrites: notionBodies.length }));

  delete process.env.NOTION_API_KEY;
  const rotatedLead = await queueModule.createLead({
    ...queuedInput,
    contact_email: "rotated@example.com",
    event_name: "Unreadable Queue Record Expo",
  });
  const leadBehindIt = await queueModule.createLead({
    ...queuedInput,
    contact_email: "behind@example.com",
    event_name: "Healthy Lead Behind Poison Record",
  });
  process.env.NOTION_API_KEY = "ntn_unit_test";
  process.env.TEMPGURU_EVAL_QUEUE_RECORD_READ_MISSES = "1";
  const rotatedDrain = await queueModule.drainPendingLeads("ntn_unit_test", 2);
  delete process.env.TEMPGURU_EVAL_QUEUE_RECORD_READ_MISSES;
  const recoveredDrain = await queueModule.drainPendingLeads("ntn_unit_test", 2);
  check("unreadable queue record rotates behind healthy leads instead of head-of-line blocking",
    rotatedLead.success === true
      && leadBehindIt.success === true
      && rotatedDrain.unreadable_rotated === 1
      && rotatedDrain.delivered === 1
      && recoveredDrain.delivered === 1,
    JSON.stringify({ rotatedDrain, recoveredDrain }));

  delete process.env.NOTION_API_KEY;
  const deadlineLead = await queueModule.createLead({
    ...queuedInput,
    contact_email: "deadline@example.com",
    event_name: "Deadline Reserve Expo",
  });
  process.env.NOTION_API_KEY = "ntn_unit_test";
  const deadlineDrain = await queueModule.drainPendingLeads(
    "ntn_unit_test",
    queueModule.MAX_DRAIN_BATCH,
    Date.now() + 5_000,
  );
  const afterDeadlineDrain = await queueModule.drainPendingLeads("ntn_unit_test", 1);
  check("scheduled drain keeps a finish reserve before the function deadline",
    deadlineLead.success === true
      && deadlineDrain.deadline_reached === true
      && deadlineDrain.claimed === 0
      && afterDeadlineDrain.delivered === 1,
    JSON.stringify({ deadlineDrain, afterDeadlineDrain }));

  const hostileAttributionLead = await queueModule.createLead({
    ...queuedInput,
    contact_email: "hostile-attribution@example.com",
    event_name: "Hostile Attribution Expo",
    source_platform: "attacker@example.com",
    utm_source: "alice@example.com",
    utm_medium: "claude-ai@example.com",
    utm_campaign: "summer-sale",
    utm_content: "evil-content",
  });
  const hostileNotionBody = notionBodies.at(-1) ?? {};
  const hostileWebhookBody = webhookBodies.at(-1) ?? {};
  const hostileSerialized = JSON.stringify({ hostileNotionBody, hostileWebhookBody });
  check("CRM sanitizer drops raw platform and UTM attribution before persistence",
    hostileAttributionLead.success === true
      && !hostileSerialized.includes("attacker@example.com")
      && !hostileSerialized.includes("alice@example.com")
      && !hostileSerialized.includes("claude-ai@example.com")
      && !hostileSerialized.includes("summer-sale")
      && !hostileSerialized.includes("evil-content"),
    hostileSerialized);
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.LEAD_WEBHOOK_URL;
}

process.env.CRON_SECRET = "unit-cron-secret";
const cronRoute = await load("src/app/api/internal/drain-leads/route.ts");
const rejectedCronResponse = await cronRoute.GET(
  new Request("https://mcp.tempguru.co/api/internal/drain-leads"),
);
const acceptedCronResponse = await cronRoute.GET(
  new Request("https://mcp.tempguru.co/api/internal/drain-leads", {
    headers: { Authorization: "Bearer unit-cron-secret" },
  }),
);
const acceptedCronBody = await acceptedCronResponse.json();
check("scheduled lead drain requires CRON_SECRET and returns a bounded summary",
  rejectedCronResponse.status === 401
    && acceptedCronResponse.status === 200
    && acceptedCronResponse.headers.get("cache-control") === "no-store"
    && acceptedCronBody.ok === true
    && typeof acceptedCronBody.drain?.delivered === "number");
delete process.env.CRON_SECRET;

delete process.env.NOTION_API_KEY;
process.env.TEMPGURU_EVAL_DEDUP_SET_DELAY_MS = "1600";
const delayedDedupModule = await load("src/lib/notion/create-lead.ts");
const delayedDedupLead = await delayedDedupModule.createLead({
  ...queuedInput,
  contact_email: "delayed@example.com",
  event_name: "Committed Dedup Timeout Expo",
});
check("timed-out SET that committed this request's dedup reference still persists the lead",
  delayedDedupLead.success === true
    && delayedDedupLead.captured === "queued"
    && !delayedDedupLead.deduped,
  JSON.stringify(delayedDedupLead));
delete process.env.TEMPGURU_EVAL_DEDUP_SET_DELAY_MS;

process.env.TEMPGURU_EVAL_DEDUP_SET_COMMIT_DELAY_MS = "1600";
process.env.TEMPGURU_EVAL_QUEUE_WRITE_FAIL = "1";
process.env.NOTION_API_KEY = "ntn_unit_test";
const lateCommitModule = await load("src/lib/notion/create-lead.ts");
const lateCommitInput = {
  ...queuedInput,
  contact_email: "late-commit@example.com",
  event_name: "Late Commit Cleanup Expo",
};
globalThis.fetch = async () => {
  await new Promise((resolve) => setTimeout(resolve, 250));
  return new Response("injected Notion failure", { status: 503 });
};
let failedLateCommit;
try {
  failedLateCommit = await lateCommitModule.createLead(lateCommitInput);
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.TEMPGURU_EVAL_DEDUP_SET_COMMIT_DELAY_MS;
  delete process.env.TEMPGURU_EVAL_QUEUE_WRITE_FAIL;
  delete process.env.NOTION_API_KEY;
}
const retryAfterLateCommit = await lateCommitModule.createLead(lateCommitInput);
check("final failure compare-deletes only this request's late dedup commit",
  failedLateCommit.success === false
    && retryAfterLateCommit.success === true
    && retryAfterLateCommit.captured === "queued"
    && !retryAfterLateCommit.deduped
    && retryAfterLateCommit.reference !== failedLateCommit.reference,
  JSON.stringify({ failedLateCommit, retryAfterLateCommit }));

const evalRedis = await load("src/lib/telemetry/redis.ts");
const funnelTransaction = await evalRedis.exec((redis) =>
  redis
    .multi()
    .hincrby("funnel:unit", "mcp:quotes_submitted", 1)
    .hincrby("funnel:unit", "mcp:quotes_submitted", 2)
    .expire("funnel:unit", 60)
    .exec(),
);
check("eval-memory Redis supports transactional funnel increments",
  JSON.stringify(funnelTransaction) === JSON.stringify([1, 3, 1]),
  JSON.stringify(funnelTransaction));

delete process.env.TEMPGURU_EVAL_MEMORY_REDIS;
if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = priorNodeEnv;

const ukDate = parseEventStart("14 August 2026");
check("parseEventStart: '14 August 2026' (day-before-month) is August 14, not August 1",
  ukDate?.getUTCMonth() === 7 && ukDate?.getUTCDate() === 14, `got ${ukDate?.toISOString()?.slice(0, 10)}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("failures:\n - " + failures.join("\n - "));
  process.exit(1);
}
