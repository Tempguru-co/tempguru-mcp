// Drift gate for the submission / distribution artifacts (MCP registry manifest,
// Docker MCP catalog, Postman collection, Context7, Dockerfile, Glama). These are
// hand-maintained and have no generator, so they silently fell behind the live
// server (345 markets, all 11 tools). This script fails if any of them drift
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
import { SKILLS } from "./gen-skill-digests.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const sameStringSet = (left, right) =>
  left.length === right.length && new Set(left).size === left.length && left.every((item) => right.includes(item));

// ── canonical facts (derived, never hard-coded) ──────────────────────────────
const CITIES_DATA = JSON.parse(read("content/mcp-data/cities.json"));
const MARKET_COUNT = CITIES_DATA.cities.length;
const TIER_COUNTS = CITIES_DATA.cities.reduce(
  (counts, city) => ({ ...counts, [city.tier]: (counts[city.tier] ?? 0) + 1 }),
  { hub: 0, mid: 0, small: 0 },
);
const REGISTER_TOOLS_SOURCE = read("src/lib/mcp/register-tools.ts");
const TOOLS = [
  ...new Set(
    [...REGISTER_TOOLS_SOURCE.matchAll(
      /server\.registerTool\(\s*"([a-z_]+)"/g,
    )].map((match) => match[1]),
  ),
];

const PKG_VERSION = JSON.parse(read("package.json")).version;
const SERVER_JSON = JSON.parse(read("server.json"));
const SERVER_VERSION = SERVER_JSON.version;
const ROLE_COUNT = JSON.parse(read("content/mcp-data/roles.json")).roles.length;
const CLAUDE_PLUGIN = JSON.parse(read("plugins/tempguru/.claude-plugin/plugin.json"));
const CLAUDE_MARKETPLACE = JSON.parse(read(".claude-plugin/marketplace.json"));
const CLI_PKG = JSON.parse(read("cli/package.json"));
const GEMINI_EXTENSION = JSON.parse(read("gemini-extension.json"));
const PACKAGE_LOCK = JSON.parse(read("package-lock.json"));
const RATE_INDEX_META = JSON.parse(read("content/mcp-data/rate-index-meta.json"));
const ROLE_PRICING = JSON.parse(read("content/mcp-data/role-pricing.json")).pricing;
const ROLE_RATE_VALUES = Object.values(ROLE_PRICING).flatMap((tiers) =>
  Object.values(tiers).flatMap((band) => [band.low, band.high]),
);
const ROLE_RATE_ENVELOPE = `$${Math.min(...ROLE_RATE_VALUES)}-$${Math.max(...ROLE_RATE_VALUES)}`;

const EXPECTED_TOOL_COUNT = 11;
const EXPECTED_DEMAND_SKILL_COUNT = 4;
const EXPECTED_DISCOVERY_SKILL_COUNT = EXPECTED_DEMAND_SKILL_COUNT + 1; // plus compliance

if (
  MARKET_COUNT < 1 ||
  TOOLS.length !== EXPECTED_TOOL_COUNT ||
  SKILLS.length !== EXPECTED_DISCOVERY_SKILL_COUNT
) {
  console.error(
    `Canonical sources look wrong: ${MARKET_COUNT} markets, ${TOOLS.length} tools, ${SKILLS.length} discovery skills ` +
      `(${EXPECTED_DEMAND_SKILL_COUNT} demand-layer + compliance). Aborting.`,
  );
  process.exit(2);
}

// ── files under guard ────────────────────────────────────────────────────────
// mcpTools: true means the file enumerates the MCP tool set and must name all of
// them. REST-facing files (Postman) describe REST operations, not
// the MCP tools, so they are not held to the tool-set check.
const FILES = [
  { path: "server.json", mcpTools: false },
  { path: "context7.json", mcpTools: true },
  { path: "Dockerfile", mcpTools: true },
  { path: ".github/copilot-instructions.md", mcpTools: true },
  { path: "src/app/mcp/route.ts", mcpTools: true },
  { path: "distribution/docker-mcp-catalog.yaml", mcpTools: true },
  { path: "distribution/postman-collection.json", mcpTools: false },
  { path: "public/.well-known/glama.json", mcpTools: false },
  { path: "cloudflare/worker.js", mcpTools: true },
  { path: "cloudflare/llms-worker.js", mcpTools: true },
];

const errors = [];

// cities.json carries a convenience summary used by generators. Derive the
// authoritative counts from the rows and fail if the summary drifts, rather
// than letting one re-tiered city leave every downstream description stale.
if (CITIES_DATA._meta.total_cities !== MARKET_COUNT) {
  errors.push(
    `cities.json _meta.total_cities ${CITIES_DATA._meta.total_cities} != ${MARKET_COUNT} actual rows`,
  );
}
for (const tier of ["hub", "mid", "small"]) {
  if (CITIES_DATA._meta.tier_counts?.[tier] !== TIER_COUNTS[tier]) {
    errors.push(
      `cities.json _meta.tier_counts.${tier} ${CITIES_DATA._meta.tier_counts?.[tier]} != ${TIER_COUNTS[tier]} actual rows`,
    );
  }
}

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

// ── tier-count surfaces ────────────────────────────────────────────────────
// These files intentionally publish the exact hub/mid/small footprint. Hold
// both source docs and generated artifacts to counts derived from city rows.
// Each entry uses context-bearing fragments so an unrelated number elsewhere
// in a large JSON artifact cannot accidentally satisfy the check.
const TIER_COUNT_SURFACES = [
  ["content/mcp-data/role-pricing.json", [`(~${TIER_COUNTS.mid} cities)`, `(~${TIER_COUNTS.small} cities)`]],
  ["content/archetypes/trade-show-booth-activation-small.yaml", [`(~${TIER_COUNTS.mid} cities)`, `(~${TIER_COUNTS.small} cities)`]],
  ["src/lib/api/openapi.ts", [`'mid' = ${TIER_COUNTS.mid} secondary markets`, `'small' = ${TIER_COUNTS.small} tertiary markets`]],
  ["src/lib/mcp/output-schemas.ts", [`mid = ${TIER_COUNTS.mid} secondary markets`, `small = ${TIER_COUNTS.small} tertiary markets`]],
  ["clients/python/src/tempguru/client.py", [`"mid" (${TIER_COUNTS.mid} secondary markets)`, `"small" (${TIER_COUNTS.small} tertiary markets)`]],
  ["clients/python/src/tempguru/langchain.py", [`'mid' = ${TIER_COUNTS.mid} secondary markets`, `'small' = ${TIER_COUNTS.small} tertiary markets`]],
  ["distribution/assistants/system-prompt.md", [`mid (${TIER_COUNTS.mid}`, `small (${TIER_COUNTS.small}`]],
  ["distribution/assistants/system-prompt.zh-CN.md", [`mid（${TIER_COUNTS.mid}`, `small（${TIER_COUNTS.small}`]],
  ["distribution/toolbox/open-webui/tempguru_event_staffing_tool.py", [`"mid" (${TIER_COUNTS.mid} secondary markets)`, `"small" (${TIER_COUNTS.small} tertiary markets)`]],
  ["distribution/postman-collection.json", [`mid = ${TIER_COUNTS.mid} secondary markets\\nsmall = ${TIER_COUNTS.small} tertiary markets`]],
  ["content/mcp-data/openapi.json", [`'mid' = ${TIER_COUNTS.mid} secondary markets`, `'small' = ${TIER_COUNTS.small} tertiary markets`]],
  ["distribution/assistants/knowledge/tempguru-company-overview.md", [`${TIER_COUNTS.hub} hub markets, ${TIER_COUNTS.mid} mid markets, ${TIER_COUNTS.small} small markets`]],
  ["distribution/assistants/knowledge/tempguru-city-coverage.md", [`Tiers: ${TIER_COUNTS.hub} hub, ${TIER_COUNTS.mid} mid, ${TIER_COUNTS.small} small`]],
  ["distribution/assistants/knowledge/tempguru-roles-and-rates.md", [`**Mid** (${TIER_COUNTS.mid} cities)`, `**Small** (${TIER_COUNTS.small} cities)`]],
  ["distribution/assistants/microsoft/declarativeAgent.json", [`mid (${TIER_COUNTS.mid}`, `small (${TIER_COUNTS.small}`]],
  ["distribution/toolbox/huggingface/README.md", [`market tier (${TIER_COUNTS.hub} hub / ${TIER_COUNTS.mid} mid / ${TIER_COUNTS.small} small)`]],
  ["public/okf/company.md", [`**${TIER_COUNTS.hub} hub**, **${TIER_COUNTS.mid} mid**, **${TIER_COUNTS.small} small**`]],
  ["public/okf/cities/index.md", [`| Mid | ${TIER_COUNTS.mid} |`, `| Small | ${TIER_COUNTS.small} |`]],
  ["public/okf/cities/mid-markets.md", [`count: ${TIER_COUNTS.mid}`, `# Mid Markets (${TIER_COUNTS.mid})`]],
  ["public/okf/cities/small-markets.md", [`count: ${TIER_COUNTS.small}`, `# Small Markets (${TIER_COUNTS.small})`]],
  ["public/okf/pricing/market-tiers.md", [`| **Mid** | ${TIER_COUNTS.mid} |`, `| **Small** | ${TIER_COUNTS.small} |`]],
  ["distribution/okf/example/operations/listcities.md", [`'mid' = ${TIER_COUNTS.mid} secondary markets`, `'small' = ${TIER_COUNTS.small} tertiary markets`]],
  ["distribution/okf/knowledge-catalog-contrib/openapi-to-okf/example/operations/listcities.md", [`'mid' = ${TIER_COUNTS.mid} secondary markets`, `'small' = ${TIER_COUNTS.small} tertiary markets`]],
];
for (const [path, expectedFragments] of TIER_COUNT_SURFACES) {
  let body;
  try {
    body = read(path);
  } catch {
    errors.push(`tier-count surface missing: ${path}`);
    continue;
  }
  const missing = expectedFragments.filter((fragment) => !body.includes(fragment));
  if (missing.length) {
    errors.push(
      `${path}: tier-count copy drifted from canonical ${TIER_COUNTS.hub}/${TIER_COUNTS.mid}/${TIER_COUNTS.small}`,
    );
  }
}

// cross-file consistency: the MCP Registry manifest version must track package.json
// (catches the 1.0.x-vs-1.2.0 drift), and the OKF knowledge layer must be present.
if (SERVER_VERSION !== PKG_VERSION) {
  errors.push(`server.json version "${SERVER_VERSION}" != package.json "${PKG_VERSION}"`);
}
if (existsSync(join(root, "plugins/tempguru/plugin.json"))) {
  errors.push("plugins/tempguru/plugin.json: manifest must live at .claude-plugin/plugin.json");
}
if (CLAUDE_PLUGIN.version !== PKG_VERSION) {
  errors.push(
    `plugins/tempguru/.claude-plugin/plugin.json version "${CLAUDE_PLUGIN.version}" != package.json "${PKG_VERSION}"`,
  );
}
for (const [surface, version] of [
  ["cli/package.json", CLI_PKG.version],
  ["gemini-extension.json", GEMINI_EXTENSION.version],
  ["package-lock.json", PACKAGE_LOCK.version],
  ["package-lock.json root package", PACKAGE_LOCK.packages?.[""]?.version],
]) {
  if (version !== PKG_VERSION) {
    errors.push(`${surface} version "${version}" != package.json "${PKG_VERSION}"`);
  }
}
if (!CLI_PKG.keywords?.includes("pi-package") || !CLI_PKG.pi?.skills?.includes("./skills")) {
  errors.push("cli/package.json: Pi package metadata must expose ./skills");
}
const REGISTRY_NPM_PACKAGE = SERVER_JSON.packages?.find(
  (pkg) => pkg.registryType === "npm" && pkg.identifier === "tempguru-mcp",
);
if (REGISTRY_NPM_PACKAGE?.version !== PKG_VERSION || REGISTRY_NPM_PACKAGE?.transport?.type !== "stdio") {
  errors.push("server.json: npm stdio package metadata is missing or version-drifted");
}
const MARKETPLACE_PLUGIN = CLAUDE_MARKETPLACE.plugins?.find((plugin) => plugin.name === "tempguru");
if (MARKETPLACE_PLUGIN?.version !== PKG_VERSION) {
  errors.push(
    `.claude-plugin/marketplace.json TempGuru version "${MARKETPLACE_PLUGIN?.version}" != package.json "${PKG_VERSION}"`,
  );
}
if (!CLAUDE_PLUGIN.description?.includes(`${SKILLS.length} skills`)) {
  errors.push(`Claude plugin description does not advertise all ${SKILLS.length} canonical skills`);
}
if (!MARKETPLACE_PLUGIN?.description?.includes(`${SKILLS.length} skills`)) {
  errors.push(`Claude marketplace description does not advertise all ${SKILLS.length} canonical skills`);
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
try {
  const discovery = JSON.parse(read("public/.well-known/okf.json"));
  if (!sameStringSet(discovery.skills ?? [], SKILLS)) {
    errors.push("public/.well-known/okf.json: canonical skill set drifted");
  }
  if (
    discovery.license !== "MIT" ||
    discovery.data_version !== CITIES_DATA._meta.version ||
    !Number.isSafeInteger(discovery.bundle?.file_count) ||
    discovery.bundle.file_count < SKILLS.length ||
    !/^[a-f0-9]{64}$/.test(discovery.bundle?.sha256 ?? "") ||
    !(discovery.bundle?.bytes > 0)
  ) {
    errors.push("public/.well-known/okf.json: bundle trust metadata is missing or invalid");
  }
} catch {
  errors.push("public/.well-known/okf.json: invalid JSON");
}

// Every canonical skill must ship as an OKF workflow and appear in the
// workflow index. This keeps the downloadable knowledge bundle in lockstep
// with the MCP skill resources and discovery cards.
let okfWorkflowIndex = "";
try {
  okfWorkflowIndex = read("public/okf/workflows/index.md");
} catch {
  errors.push("OKF artifact missing: public/okf/workflows/index.md");
}
for (const skill of SKILLS) {
  const workflowPath = `public/okf/workflows/${skill}.md`;
  if (!existsSync(join(root, workflowPath))) {
    errors.push(`OKF workflow missing for canonical skill: ${workflowPath}`);
  }
  if (okfWorkflowIndex && !okfWorkflowIndex.includes(`](${skill}.md)`)) {
    errors.push(`public/okf/workflows/index.md: missing canonical skill link ${skill}.md`);
  }
  const canonicalBody = read(`content/skills/${skill}.md`);
  const pluginBody = read(`plugins/tempguru/skills/${skill}/SKILL.md`);
  const portableBody = read(`skills/${skill}/SKILL.md`);
  const openAiMetadata = read(`skills/${skill}/agents/openai.yaml`);
  if (!canonicalBody.startsWith(`---\nname: ${skill}\ndescription: >-\n`)) {
    errors.push(`content/skills/${skill}.md: invalid or non-portable YAML frontmatter`);
  }
  if (canonicalBody.split("\n").length > 500) {
    errors.push(`content/skills/${skill}.md: exceeds the 500-line skill budget`);
  }
  if (pluginBody !== canonicalBody) {
    errors.push(`plugins/tempguru/skills/${skill}/SKILL.md: drifted from canonical skill`);
  }
  if (portableBody !== canonicalBody) {
    errors.push(`skills/${skill}/SKILL.md: drifted from canonical skill`);
  }
  if (
    !openAiMetadata.includes(`$${skill}`) ||
    !openAiMetadata.includes("https://mcp.tempguru.co/mcp?source=openai-codex")
  ) {
    errors.push(`skills/${skill}/agents/openai.yaml: missing default prompt or attributed MCP dependency`);
  }
}

for (const skill of [
  "event-staffing-ordering",
  "staffing-plan-from-event-brief",
  "urgent-event-backfill",
]) {
  const body = read(`content/skills/${skill}.md`);
  for (const fragment of [
    "`plan_id`",
    "`source_platform`",
    "`skill_id`",
    `\`${skill}\``,
    "`skill_version`",
    `\`${PKG_VERSION}\``,
    "`get_quote_status`",
  ]) {
    if (!body.includes(fragment)) {
      errors.push(`content/skills/${skill}.md: quote path missing ${fragment}`);
    }
  }
}
for (const p of [
  "content/skills/event-staffing-ordering.md",
  "content/skills/staffing-agency-partner-growth.md",
  "public/okf/cities/index.md",
  "distribution/assistants/system-prompt.md",
  "distribution/assistants/system-prompt.zh-CN.md",
  "distribution/assistants/microsoft/declarativeAgent.json",
]) {
  const body = read(p);
  if (
    body.includes("insights/{city}") ||
    body.includes("{roles}-in-{city}") ||
    body.includes("City detail pages follow the pattern")
  ) {
    errors.push(`${p}: must use sitemap-verified tool URLs, not synthesized city/role links`);
  }
}

for (const p of [
  "public/okf/workflows/plan-staffing.md",
  "public/okf/workflows/quote-submission.md",
  "public/okf/reference/mcp-tools.md",
]) {
  const body = read(p);
  for (const fragment of ["`plan_id`", "`request_quote`"]) {
    if (!body.includes(fragment)) {
      errors.push(`${p}: v1.5 plan-to-quote handoff missing ${fragment}`);
    }
  }
}
for (const p of [
  "public/okf/workflows/quote-submission.md",
  "public/okf/reference/mcp-tools.md",
]) {
  if (!read(p).includes("TG reference")) {
    errors.push(`${p}: v1.5 quote receipt path missing TG reference`);
  }
}
for (const fragment of [
  "`source_platform`",
  "`skill_id`",
  "`skill_version`",
  "`get_quote_status`",
]) {
  if (!read("public/okf/workflows/quote-submission.md").includes(fragment)) {
    errors.push(`public/okf/workflows/quote-submission.md: attribution/status path missing ${fragment}`);
  }
}
for (const p of [
  "distribution/ai-agents-page.html",
  "distribution/ai-agents-page.zh-CN.html",
]) {
  const body = read(p);
  if (body.includes("tempguru-agent-skills") || body.includes("clawhub install tempguru-event-staffing")) {
    errors.push(`${p}: contains a stale two-skill repository or nonexistent ClawHub bundle`);
  }
  for (const fragment of [
    "https://github.com/Tempguru-co/tempguru-mcp",
    "source=hermes",
    "source=openai-codex",
    "pi install npm:tempguru-mcp",
  ]) {
    if (!body.includes(fragment)) errors.push(`${p}: multi-runtime activation guidance missing ${fragment}`);
  }
}

// Descriptive surfaces have drifted independently from discovery before.
// Ban the old count so adding a skill cannot leave public install copy behind.
for (const p of [
  "README.md",
  "README.zh-CN.md",
  "src/app/.well-known/mcp/server-card.json/route.ts",
]) {
  const body = read(p);
  if (/two skill resources/i.test(body) || /两个技能资源/.test(body)) {
    errors.push(`${p}: stale canonical skill count (expected ${SKILLS.length})`);
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
const okfRateIndex = read("public/okf/rate-index.md");
if (!okfRateIndex.includes(`data_version: "${RATE_INDEX_META.version}"`)) {
  errors.push("public/okf/rate-index.md: data_version drifted from rate-index-meta.json");
}
if (!read("src/lib/mcp/city-rates.ts").includes('import rateIndexMeta from "../../../content/mcp-data/rate-index-meta.json"')) {
  errors.push("src/lib/mcp/city-rates.ts: Rate Index tool must use canonical rate-index-meta.json");
}
const rateIndexHtml = read("distribution/event-staffing-rate-index.html");
for (const fragment of [
  `data version ${RATE_INDEX_META.version}`,
  `"version": "${RATE_INDEX_META.version}"`,
  `"dateModified": "${RATE_INDEX_META.updated}"`,
]) {
  if (!rateIndexHtml.includes(fragment)) {
    errors.push(`distribution/event-staffing-rate-index.html: canonical Rate Index receipt missing ${fragment}`);
  }
}

// The agent-facing source-of-truth tool description (register-tools.ts) must keep
// the correct Rate Index framing so the downstream copies above can't drift back
// to a misleading tier-grid. "national range" + "typical" are its signature.
const registerTools = REGISTER_TOOLS_SOURCE;
if (!/national range/i.test(registerTools) || !/typical/i.test(registerTools)) {
  errors.push(
    `src/lib/mcp/register-tools.ts: get_rate_benchmark description lost its canonical framing (expects a "typical" rate plus the "national range")`,
  );
}

// ── role coverage ────────────────────────────────────────────────────────────
// Assistant Leads is a canonical role (rate card asst_lead); it was silently
// omitted from the REST role list. The public request schema intentionally
// accepts any bounded role string and is generated exactly from Zod, so role
// catalog coverage belongs in OpenAPI/roles data, not that write schema.
for (const p of ["src/lib/api/openapi.ts"]) {
  if (!/assistant[ _]lead/i.test(read(p))) {
    errors.push(`${p}: role list omits Assistant Leads (assistant_leads)`);
  }
}

// Counts in dataset cards and hand-maintained API copy drifted independently
// even while the generated role rows were correct. Tie those declarations to
// roles.json as well as checking row content below.
const ROLE_COUNT_SURFACES = [
  ["distribution/toolbox/build-hf-dataset.mjs", `\${roles.roles.length} event staffing roles x 3 market tiers`],
  ["distribution/toolbox/huggingface/README.md", `${ROLE_COUNT} event staffing roles x 3 market tiers`],
  ["distribution/toolbox/README.md", `${ROLE_COUNT * 3} role-rate rows`],
  ["distribution/postman-collection.json", `complete canonical ${ROLE_COUNT}-role event staffing catalog`],
];
for (const [path, expected] of ROLE_COUNT_SURFACES) {
  if (!read(path).includes(expected)) {
    errors.push(`${path}: role-count copy drifted from the canonical ${ROLE_COUNT} roles`);
  }
}

// ── agent-skills digest integrity ─────────────────────────────────────────
// The discovery index advertises a sha256 per SKILL.md; a verifying client
// rejects a skill whose served bytes don't match. The digests drifted once
// (hand-maintained in the route), breaking the flagship ordering skill, so they
// now come from content/skills/skill-digests.json (generated by
// gen-skill-digests.mjs). Fail CI if that JSON is stale vs the files, if the
// route reintroduces a hard-coded digest, or if the deleted shadow index returns.
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
const skillsRouteBody = read(skillsRoute);
if (!/skill-digests/.test(skillsRouteBody)) {
  errors.push(`${skillsRoute}: must derive digests from content/skills/skill-digests.json, not hard-code them`);
}
if (/sha256:[0-9a-f]{64}/.test(skillsRouteBody)) {
  errors.push(`${skillsRoute}: contains a hard-coded sha256 digest (should reference skill-digests.json only)`);
}
for (const name of SKILLS) {
  if (!skillsRouteBody.includes(`url: "./${name}/SKILL.md"`)) {
    errors.push(`${skillsRoute}: ${name} must use an origin-relative SKILL.md URL`);
  }
}
if (!existsSync(join(root, "src/app/.well-known/agent-skills/[skill]/SKILL.md/route.ts"))) {
  errors.push("mcp.tempguru.co canonical skill artifact route is missing");
}

// All discovery/runtime surfaces must expose the exact same five skills: the
// four demand-layer skills from PR #27 plus the compliance skill. Checking sets
// (not just individual substrings) catches omissions, duplicates, and stale
// extras. The edge builder imports SKILLS directly; its generated worker must
// still prove that both public discovery URL trees were emitted.
const registeredSkillsBlock = REGISTER_TOOLS_SOURCE.match(
  /export const SKILL_SLUGS = \[([\s\S]*?)\]\s+as const/,
)?.[1];
const registeredSkills = registeredSkillsBlock
  ? [...registeredSkillsBlock.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1])
  : [];
const routedSkills = [...skillsRouteBody.matchAll(/\n\s+name:\s*"([a-z0-9-]+)"/g)].map(
  (match) => match[1],
);
const quoteSkillBlock = read("src/lib/mcp/quote.ts").match(
  /export const QUOTE_SKILL_IDS = \[([\s\S]*?)\]\s+as const/,
)?.[1];
const quoteSkills = quoteSkillBlock
  ? [...quoteSkillBlock.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1])
  : [];
for (const [surface, names] of [
  ["src/lib/mcp/register-tools.ts SKILL_SLUGS", registeredSkills],
  ["src/lib/mcp/quote.ts QUOTE_SKILL_IDS", quoteSkills],
  [skillsRoute, routedSkills],
  ["content/skills/skill-digests.json keys", Object.keys(committedDigests)],
]) {
  if (!sameStringSet(names, SKILLS)) {
    errors.push(`${surface}: discovery skill set is [${names.join(", ")}] but expected [${SKILLS.join(", ")}]`);
  }
}

const edgeBuilder = read("scripts/build-edge-worker.mjs");
if (!/SKILLS as SKILL_SLUGS/.test(edgeBuilder)) {
  errors.push("scripts/build-edge-worker.mjs: must import the canonical discovery skill list from gen-skill-digests.mjs");
}
const edgeWorker = read("cloudflare/worker.js");
if (!edgeWorker.includes('"/.well-known/security.txt"')) {
  errors.push("cloudflare/worker.js: generated apex output omits /.well-known/security.txt (run: npm run build:worker)");
}
for (const name of SKILLS) {
  if (!edgeBuilder.includes(`id: "${name}"`)) {
    errors.push(`scripts/build-edge-worker.mjs: agent card omits ${name}`);
  }
  for (const tree of ["agent-skills", "skills"]) {
    const path = `/.well-known/${tree}/${name}/SKILL.md`;
    if (!edgeWorker.includes(path)) {
      errors.push(`cloudflare/worker.js: generated discovery output omits ${path} (run: npm run build:worker)`);
    }
  }
}
if (existsSync(join(root, "public/.well-known/agent-skills/index.json"))) {
  errors.push("public/.well-known/agent-skills/index.json is a stale shadow of the route; delete it (the App Router route is canonical)");
}

const llmsWorker = read("cloudflare/llms-worker.js");
if (!JSON.parse(read("package.json")).scripts?.["build:llms-worker"]) {
  errors.push("package.json: missing build:llms-worker generator command");
}
if (llmsWorker.includes("tempguru-agent-skills")) {
  errors.push("cloudflare/llms-worker.js: points agents at the stale two-skill repository");
}
for (const fragment of [
  "https://github.com/Tempguru-co/tempguru-mcp",
  `Canonical Agent Skills (${SKILLS.length})`,
  ROLE_RATE_ENVELOPE,
  `canonical ${ROLE_COUNT}-role catalog`,
  ...SKILLS,
]) {
  if (!llmsWorker.includes(fragment)) {
    errors.push(`cloudflare/llms-worker.js: canonical agent guidance missing ${fragment}`);
  }
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
for (const p of ["README.md", "README.zh-CN.md"]) {
  if (mcpJsonProto && !read(p).includes(mcpJsonProto)) {
    errors.push(`${p}: does not mention the advertised protocolVersion ${mcpJsonProto}`);
  }
}
for (const p of ["README.md", "llms-install.md"]) {
  const body = read(p);
  if (!body.includes('codex mcp add tempguru --url "https://mcp.tempguru.co/mcp?source=openai-codex"') || !body.includes("$skill-installer")) {
    errors.push(`${p}: Codex skill + attributed MCP activation path is incomplete`);
  }
  for (const skill of SKILLS) {
    if (!body.includes(`hermes skills install well-known:https://tempguru.co/.well-known/skills/${skill} --yes`)) {
      errors.push(`${p}: Hermes install path missing ${skill}`);
    }
    if (!body.includes(`openclaw skills install ./skills/${skill} --global`)) {
      errors.push(`${p}: OpenClaw install path missing ${skill}`);
    }
  }
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

console.log(
  `Canonical: ${MARKET_COUNT} markets, ${ROLE_COUNT} roles, ${TOOLS.length} MCP tools, ` +
    `${EXPECTED_DEMAND_SKILL_COUNT} demand-layer skills + compliance, v${PKG_VERSION}.`,
);
if (errors.length) {
  console.error(`\nSubmission drift detected (${errors.length}):`);
  for (const e of errors) console.error("  - " + e);
  console.error("\nUpdate the file(s) to match the canonical sources, then re-run.");
  process.exit(1);
}
console.log(
  `OK: ${FILES.length} submission/distribution files match; Rate Index phrasing clean across ${RATE_INDEX_SURFACES.length + ZH_RATE_INDEX_SURFACES.length} surfaces (incl. ${ZH_RATE_INDEX_SURFACES.length} zh-CN); role coverage intact.`,
);
