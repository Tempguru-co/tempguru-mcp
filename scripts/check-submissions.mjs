// Drift gate for the submission / distribution artifacts (MCP registry manifest,
// Docker MCP catalog, Postman collection, Context7, Dockerfile, Glama). These are
// hand-maintained and have no generator, so they silently fell behind the live
// server (300+ markets, 6 of 8 tools). This script fails if any of them drift
// from the canonical sources:
//   - market count: content/mcp-data/cities.json
//   - MCP tool set:  src/lib/mcp/register-tools.ts
//   - Rate Index phrasing: bans the stale "by role and market tier" on the agent-
//     facing surfaces that describe the Index (only Brand Ambassadors are tiered)
//   - role coverage: Assistant Leads present in the REST role list + quote schema
//
//   node scripts/check-submissions.mjs   (npm run check:submissions)

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// ── canonical facts (derived, never hard-coded) ──────────────────────────────
const MARKET_COUNT = JSON.parse(read("content/mcp-data/cities.json")).cities.length;
const TOOLS = [
  ...new Set(
    (read("src/lib/mcp/register-tools.ts").match(
      /"(plan_staffing|get_cities|get_roles|check_availability|get_role_pricing|get_compliance_by_state|get_rate_benchmark|request_quote)"/g,
    ) || []).map((s) => s.replace(/"/g, "")),
  ),
];

const PKG_VERSION = JSON.parse(read("package.json")).version;
const SERVER_JSON = JSON.parse(read("server.json"));
const SERVER_VERSION = SERVER_JSON.version;
const ROLE_COUNT = JSON.parse(read("content/mcp-data/roles.json")).roles.length;

if (MARKET_COUNT < 1 || TOOLS.length !== 8) {
  console.error(`Canonical sources look wrong: ${MARKET_COUNT} markets, ${TOOLS.length} tools. Aborting.`);
  process.exit(2);
}

// ── files under guard ────────────────────────────────────────────────────────
// mcpTools: true means the file enumerates the MCP tool set and must name all of
// them. REST-facing files (Postman) describe the 5 GET + 1 POST endpoints, not
// the MCP tools, so they are not held to the tool-set check.
const FILES = [
  { path: "server.json", mcpTools: false },
  { path: "context7.json", mcpTools: true },
  { path: "Dockerfile", mcpTools: true },
  { path: "distribution/docker-mcp-catalog.yaml", mcpTools: true },
  { path: "distribution/postman-collection.json", mcpTools: false },
  { path: "public/.well-known/glama.json", mcpTools: false },
  { path: "cloudflare/worker.js", mcpTools: true },
  { path: "cloudflare/llms-worker.js", mcpTools: true },
];

const errors = [];
for (const { path, mcpTools } of FILES) {
  const body = read(path);
  if (/\b300\+/.test(body)) {
    errors.push(`${path}: contains "300+" (canonical market count is ${MARKET_COUNT})`);
  }
  if (mcpTools) {
    const missing = TOOLS.filter((t) => !body.includes(t));
    if (missing.length) {
      errors.push(`${path}: enumerates MCP tools but is missing ${missing.join(", ")}`);
    }
  }
}

// cross-file consistency: the MCP Registry manifest version must track package.json
// (catches the 1.0.x-vs-1.2.0 drift), and the OKF knowledge layer must be present.
if (SERVER_VERSION !== PKG_VERSION) {
  errors.push(`server.json version "${SERVER_VERSION}" != package.json "${PKG_VERSION}"`);
}
if ((SERVER_JSON.description || "").length > 100) {
  errors.push(`server.json description is ${SERVER_JSON.description.length} chars (MCP Registry caps it at 100)`);
}
for (const p of ["public/okf/index.md", "public/.well-known/okf.json"]) {
  try {
    read(p);
  } catch {
    errors.push(`OKF artifact missing: ${p}`);
  }
}

// ── Rate Index phrasing ──────────────────────────────────────────────────────
// The Index gives each role a typical rate + national range; ONLY Brand
// Ambassadors are tiered. "by role and market tier" implies every role is tiered,
// which is false and misleading. Ban that stale phrasing on the agent-facing
// surfaces that describe the Index. This is the drift that slipped the gate once:
// it lived only on hand-authored copies, not generated-from-canonical files, so
// nothing caught it until a manual review. (The general "rates vary by role and
// market tier" line in distribution/assistants/build-knowledge.mjs is a different
// statement and is intentionally not gated here.)
const RATE_INDEX_SURFACES = [
  "CLAUDE.md",
  "AGENTS.md",
  "README.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  "content/skills/event-staffing-ordering.md",
  "plugins/tempguru/skills/event-staffing-ordering/SKILL.md",
  "src/app/page.tsx",
  "src/app/.well-known/mcp/server-card.json/route.ts",
  "src/lib/mcp/rate-benchmark.ts",
  "scripts/build-okf.mjs",
  "distribution/ai-agents-page.html",
  "public/okf/rate-index.md",
  "public/okf/workflows/event-staffing-ordering.md",
  "cloudflare/worker.js",
  "cloudflare/llms-worker.js",
];
for (const p of RATE_INDEX_SURFACES) {
  let body;
  try {
    body = read(p);
  } catch {
    errors.push(`Rate Index surface missing: ${p}`);
    continue;
  }
  if (/by role and market tier/i.test(body)) {
    errors.push(
      `${p}: stale Rate Index phrasing "by role and market tier" (canonical: "by role (typical + national range; Brand Ambassadors by tier)")`,
    );
  }
}

// Chinese Rate Index surfaces: same misframing, different language. The English
// regex above can't match 按岗位和市场分级 ("by role and market tier"), so the
// zh-CN surfaces are guarded explicitly. This exact phrasing slipped the gate
// once on README.zh-CN.md before it was caught in manual review.
const ZH_RATE_INDEX_SURFACES = [
  "README.zh-CN.md",
  "distribution/ai-agents-page.zh-CN.html",
];
for (const p of ZH_RATE_INDEX_SURFACES) {
  let body;
  try {
    body = read(p);
  } catch {
    errors.push(`Rate Index surface missing: ${p}`);
    continue;
  }
  if (/按岗位和市场分级/.test(body)) {
    errors.push(
      `${p}: stale Rate Index phrasing "按岗位和市场分级" (canonical: "按岗位列出（典型值 + 全国区间；品牌大使按市场分级）")`,
    );
  }
}

// The agent-facing source-of-truth tool description (register-tools.ts) must keep
// the correct Rate Index framing so the downstream copies above can't drift back
// to a misleading tier-grid. "national range" + "typical" are its signature.
const registerTools = read("src/lib/mcp/register-tools.ts");
if (!/national range/i.test(registerTools) || !/typical/i.test(registerTools)) {
  errors.push(
    `src/lib/mcp/register-tools.ts: get_rate_benchmark description lost its canonical framing (expects a "typical" rate plus the "national range")`,
  );
}

// ── role coverage ────────────────────────────────────────────────────────────
// Assistant Leads is a canonical role (rate card asst_lead); it was silently
// omitted from the REST role list and the quote-request schema. Guard both.
for (const p of ["src/lib/api/openapi.ts", "public/schemas/event-staffing-request.schema.json"]) {
  if (!/assistant[ _]lead/i.test(read(p))) {
    errors.push(`${p}: role list omits Assistant Leads (assistant_leads)`);
  }
}

// ── agent-skills digest integrity ─────────────────────────────────────────
// The discovery index advertises a sha256 per SKILL.md; a verifying client
// rejects a skill whose served bytes don't match. The digests drifted once
// (hand-maintained in the route), breaking the flagship ordering skill, so they
// now come from content/skills/skill-digests.json (generated by
// gen-skill-digests.mjs). Fail CI if that JSON is stale vs the files, if the
// route reintroduces a hard-coded digest, or if the deleted shadow index returns.
const SKILLS = ["event-staffing-ordering", "event-staffing-compliance"];
const sha256File = (p) => "sha256:" + createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
let committedDigests = {};
try {
  committedDigests = JSON.parse(read("content/skills/skill-digests.json"));
} catch {
  errors.push("content/skills/skill-digests.json missing or invalid (run: node scripts/gen-skill-digests.mjs)");
}
for (const name of SKILLS) {
  const actual = sha256File(`content/skills/${name}.md`);
  if (committedDigests[name] !== actual) {
    errors.push(
      `skill-digests.json for ${name} is ${committedDigests[name] ?? "missing"} but the file hashes ${actual} (run: node scripts/gen-skill-digests.mjs)`,
    );
  }
}
const skillsRoute = "src/app/.well-known/agent-skills/index.json/route.ts";
if (!/skill-digests/.test(read(skillsRoute))) {
  errors.push(`${skillsRoute}: must derive digests from content/skills/skill-digests.json, not hard-code them`);
}
if (/sha256:[0-9a-f]{64}/.test(read(skillsRoute))) {
  errors.push(`${skillsRoute}: contains a hard-coded sha256 digest (should reference skill-digests.json only)`);
}
if (existsSync(join(root, "public/.well-known/agent-skills/index.json"))) {
  errors.push("public/.well-known/agent-skills/index.json is a stale shadow of the route; delete it (the App Router route is canonical)");
}

// ── MCP discovery-doc protocol consistency ────────────────────────────────
// The mcp.json server-discovery doc and the SEP-1649 server card must advertise
// the same protocolVersion, and never the stale 2025-03-26 the live server
// stopped negotiating (a client that pre-negotiates the advertised version off a
// doc would otherwise handshake an old protocol). Both routes are embedded
// verbatim into the apex worker, so they must agree.
const protoOf = (p) => (read(p).match(/protocolVersion:\s*"([^"]+)"/) || [])[1];
const mcpJsonProto = protoOf("src/app/.well-known/mcp.json/route.ts");
const serverCardProto = protoOf("src/app/.well-known/mcp/server-card.json/route.ts");
if (!mcpJsonProto || !serverCardProto) {
  errors.push("could not read protocolVersion from mcp.json and/or server-card route");
} else if (mcpJsonProto !== serverCardProto) {
  errors.push(`mcp.json protocolVersion "${mcpJsonProto}" != server-card "${serverCardProto}"`);
} else if (mcpJsonProto === "2025-03-26") {
  errors.push(`discovery docs still advertise the stale protocolVersion 2025-03-26 (live server negotiates a newer revision)`);
}

// The server identity must be one string everywhere a client can read it: the
// two discovery docs and the runtime serverInfo (HTTP route + stdio binary).
// (The MCP Registry namespace co.tempguru/event-staffing in server.json is a
// separate, intentionally-different identifier and is not checked here.)
const RUNTIME_NAME = "tempguru-mcp";
const nameOf = (p, re) => (read(p).match(re) || [])[1];
const nameChecks = [
  ["src/app/.well-known/mcp.json/route.ts", /name:\s*"([^"]+)"/],
  ["src/app/.well-known/mcp/server-card.json/route.ts", /serverInfo:\s*\{[\s\S]*?name:\s*"([^"]+)"/],
  ["src/app/mcp/route.ts", /serverInfo:\s*\{\s*\n\s*name:\s*"([^"]+)"/],
  ["src/mcp-stdio.ts", /new McpServer\(\{\s*\n\s*name:\s*"([^"]+)"/],
];
for (const [p, re] of nameChecks) {
  const got = nameOf(p, re);
  if (got !== RUNTIME_NAME) {
    errors.push(`${p}: MCP server name "${got ?? "unreadable"}" != canonical "${RUNTIME_NAME}"`);
  }
}

// ── generated knowledge-file / HF-dataset role-coverage drift ──────────────
// distribution/assistants/knowledge/*.md (uploaded to the GPT/Poe/Coze) and the
// HF dataset are generated from content/mcp-data but had no self-check, so they
// silently served an 11-role catalog for weeks after roles.json grew to 19.
// Assert every canonical role name appears in both, forcing a regenerate
// (node distribution/assistants/build-knowledge.mjs && node distribution/toolbox/build-hf-dataset.mjs).
{
  const roleNames = JSON.parse(read("content/mcp-data/roles.json")).roles.map((r) => r.name);
  const targets = [
    "distribution/assistants/knowledge/tempguru-roles-and-rates.md",
    "distribution/toolbox/huggingface/data/roles_and_rates.jsonl",
  ];
  for (const p of targets) {
    let body;
    try {
      body = read(p);
    } catch {
      errors.push(`generated role file missing: ${p}`);
      continue;
    }
    const missing = roleNames.filter((n) => !body.includes(n));
    if (missing.length) {
      errors.push(
        `${p}: missing ${missing.length} role(s) from roles.json (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", ..." : ""}); regenerate build-knowledge.mjs / build-hf-dataset.mjs`,
      );
    }
  }
}

// ── state-compliance data freshness ───────────────────────────────────────
// Minimum wages change every January (plus mid-year in AK/DC/OR/FL). Stale
// compliance data presented as current is a liability for a compliance-brand
// company, so fail if the dataset hasn't been re-verified in over 6 months.
// A FUTURE date also fails: it would silently disarm this gate for years.
// Reset by re-checking values against state DOL sources and bumping _meta.updated.
try {
  const sc = JSON.parse(read("content/mcp-data/state-compliance.json"));
  const updated = new Date(`${sc._meta.updated}T00:00:00Z`);
  if (isNaN(updated.getTime())) {
    errors.push("state-compliance.json _meta.updated is not a valid ISO date (YYYY-MM-DD)");
  } else {
    const ageMonths = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (ageMonths > 6) {
      errors.push(
        `state-compliance.json is ${ageMonths.toFixed(1)} months stale (updated ${sc._meta.updated}); minimum wages change every January, re-verify against state DOL sources and bump _meta.updated.`,
      );
    } else if (ageMonths < -0.1) {
      errors.push(
        `state-compliance.json _meta.updated "${sc._meta.updated}" is in the future; use the actual verification date.`,
      );
    }
  }
} catch (e) {
  errors.push(`could not read state-compliance.json for freshness check: ${e.message}`);
}

// ── city-data integrity ─────────────────────────────────────────────────────
// (a) cities.json: (name, state, country) must be unique — a duplicate row
//     (Springfield MO twice, once as the bare slug) shipped and split the
//     market's identity across two tiers.
// (b) city-rates.json: .name must be unique — 36 space-key/typo-key duplicate
//     rows (446 "measured markets" that were really 410) double-weighted modes
//     and let Kansas City carry two different tiers.
// (c) where a rate row's "City, ST" matches a served city, tiers must agree.
// (d) Brand Ambassador rates floor at $40 in EVERY market and every tier.
{
  const cities = JSON.parse(read("content/mcp-data/cities.json")).cities;
  const seen = new Map();
  for (const c of cities) {
    const k = `${c.name}|${c.state_abbr}|${c.country}`;
    if (seen.has(k)) errors.push(`cities.json: duplicate market ${k} (slugs ${seen.get(k)} and ${c.slug})`);
    seen.set(k, c.slug);
  }

  const rates = JSON.parse(read("content/mcp-data/city-rates.json"));
  const rateEntries = Object.entries(rates).filter(([k]) => k !== "_meta");
  const namesSeen = new Map();
  const tierByCity = new Map(cities.map((c) => [`${c.name}, ${c.state_abbr}`, c.tier]));
  for (const [key, row] of rateEntries) {
    // Case-insensitive: "College station, TX" vs "College Station, TX" was a
    // real duplicate that exact-match comparison missed.
    const nameKey = row.name.toLowerCase();
    if (namesSeen.has(nameKey)) {
      errors.push(`city-rates.json: duplicate market "${row.name}" (keys "${namesSeen.get(nameKey)}" and "${key}")`);
    }
    namesSeen.set(nameKey, key);
    if (key.includes(" ")) {
      errors.push(`city-rates.json: key "${key}" contains a space (keys are hyphenated slugs)`);
    }
    const servedTier = tierByCity.get(row.name);
    if (servedTier && row.tier !== servedTier) {
      errors.push(`city-rates.json: "${row.name}" is tier "${row.tier}" but cities.json says "${servedTier}"`);
    }
    if (Array.isArray(row.brand_amb) && row.brand_amb[0] < 40) {
      errors.push(`city-rates.json: "${row.name}" Brand Ambassador low $${row.brand_amb[0]} breaks the $40 floor`);
    }
  }

  const rolePricing = JSON.parse(read("content/mcp-data/role-pricing.json")).pricing;
  const ba = rolePricing["brand-ambassadors"];
  for (const tier of ["small", "mid", "hub"]) {
    if (ba?.[tier]?.low < 40) {
      errors.push(`role-pricing.json: brand-ambassadors ${tier} low $${ba[tier].low} breaks the $40 floor`);
    }
  }
}

// ── llms-install.md freshness ───────────────────────────────────────────────
// The agent-facing install doc served an 11-role catalog and a stale protocol
// revision long after both changed; hold it to the canonical values.
{
  const body = read("llms-install.md");
  if (!body.includes(`${ROLE_COUNT} staffing roles`) || !body.includes(`${ROLE_COUNT} roles`)) {
    errors.push(`llms-install.md: role count drifted from the canonical ${ROLE_COUNT} (roles.json)`);
  }
  if (mcpJsonProto && !body.includes(mcpJsonProto)) {
    errors.push(`llms-install.md: does not mention the advertised protocolVersion ${mcpJsonProto}`);
  }
}

console.log(`Canonical: ${MARKET_COUNT} markets, ${ROLE_COUNT} roles, ${TOOLS.length} MCP tools, v${PKG_VERSION}.`);
if (errors.length) {
  console.error(`\nSubmission drift detected (${errors.length}):`);
  for (const e of errors) console.error("  - " + e);
  console.error("\nUpdate the file(s) to match the canonical sources, then re-run.");
  process.exit(1);
}
console.log(
  `OK: ${FILES.length} submission/distribution files match; Rate Index phrasing clean across ${RATE_INDEX_SURFACES.length + ZH_RATE_INDEX_SURFACES.length} surfaces (incl. ${ZH_RATE_INDEX_SURFACES.length} zh-CN); role coverage intact.`,
);
