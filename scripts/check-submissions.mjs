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
