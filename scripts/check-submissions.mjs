// Drift gate for the submission / distribution artifacts (MCP registry manifest,
// Docker MCP catalog, Postman collection, Context7, Dockerfile, Glama). These are
// hand-maintained and have no generator, so they silently fell behind the live
// server (300+ markets, 6 of 8 tools). This script fails if any of them drift
// from the canonical sources:
//   - market count: content/mcp-data/cities.json
//   - MCP tool set:  src/lib/mcp/register-tools.ts
//
//   node scripts/check-submissions.mjs   (npm run check:submissions)

import { readFileSync } from "node:fs";
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

console.log(`Canonical: ${MARKET_COUNT} markets, ${TOOLS.length} MCP tools.`);
if (errors.length) {
  console.error(`\nSubmission drift detected (${errors.length}):`);
  for (const e of errors) console.error("  - " + e);
  console.error("\nUpdate the file(s) to match the canonical sources, then re-run.");
  process.exit(1);
}
console.log(`OK: ${FILES.length} submission/distribution files match the canonical sources.`);
