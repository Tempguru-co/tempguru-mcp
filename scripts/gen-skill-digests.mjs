// Generates content/skills/skill-digests.json: sha256 of each SKILL.md, the
// single source of truth for the digests advertised in the agent-skills
// discovery index (src/app/.well-known/agent-skills/index.json/route.ts) and
// mirrored into the apex worker.
//
// Why this exists: the digests were hand-maintained in the route and drifted
// (the ordering skill advertised bd26a85e… while the served bytes hashed
// 5da463f2…), so any client that verifies the digest rejected the flagship
// ordering skill. Regenerating from the files removes the hand step. Runs inside
// `npm run build:okf`; check-submissions.mjs fails CI if the committed JSON drifts.
//
//   node scripts/gen-skill-digests.mjs

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const skillsDir = join(repoRoot, "content", "skills");
const claudePluginSkillsDir = join(repoRoot, "plugins", "tempguru", "skills");
const portableSkillsDir = join(repoRoot, "skills");
const piSkillsDir = join(repoRoot, "distribution", "pi", "skills");

// Canonical discovery-skill list for the generators and submission gate. The
// gate verifies that the discovery route and MCP resource list expose this
// exact set, so those runtime surfaces cannot silently drift from these files.
export const SKILLS = [
  "event-staffing-ordering",
  "event-staffing-compliance",
  "staffing-plan-from-event-brief",
  "urgent-event-backfill",
  "staffing-agency-partner-growth",
  "multi-city-activation-planner",
  "event-staffing-procurement",
  "tempguru-pro-operations",
];

// Pi registers native REST-backed tools under a collision-safe `tempguru_`
// prefix. Canonical skills intentionally use MCP names, so copying them
// verbatim made the installed Pi skills ask for tools that did not exist.
// Generate a runtime-specific body instead, while keeping the canonical files
// and their discovery digests unchanged for MCP, Hermes, OpenClaw, and Codex.
export const PI_NATIVE_TOOL_MAP = {
  get_cities: "tempguru_get_cities",
  get_roles: "tempguru_get_roles",
  check_availability: "tempguru_check_availability",
  get_role_pricing: "tempguru_get_role_pricing",
  get_compliance_by_state: "tempguru_get_compliance",
  get_policies: "tempguru_get_policies",
  get_plan: "tempguru_get_plan",
  get_quote_status: "tempguru_quote_status",
  request_quote: "tempguru_request_quote",
};

const PI_RUNTIME_GUIDE = `## Pi runtime tool routing (installed package override)

This copy runs inside the TempGuru Pi package. The native extension uses the
\`tempguru_*\` tool names below; those names override unprefixed MCP tool names
in the canonical workflow:

| Canonical workflow name | Call this Pi native tool |
|---|---|
${Object.entries(PI_NATIVE_TOOL_MAP)
  .map(([canonical, native]) => `| \`${canonical}\` | \`${native}\` |`)
  .join("\n")}

\`plan_staffing\` and \`get_rate_benchmark\` are not native Pi tools in this
package. If the remote TempGuru MCP is attached, use those MCP tools. Otherwise:

Any later instruction to call either tool, inspect planner-only fields such as
\`plan_complete\` / \`unpriced_roles\`, retain a newly created \`plan_id\`, or
present OT-adjusted planner totals is conditional on that remote MCP being
attached. Without it, ignore those planner-only steps and use this composition:

1. Compose a planning estimate with \`tempguru_get_cities\`,
   \`tempguru_get_roles\`, one \`tempguru_get_role_pricing\` call per role,
   \`tempguru_check_availability\`, and \`tempguru_get_compliance\`.
2. Calculate only from user-confirmed headcount, shift hours, and days. Label
   the result a straight-time planning estimate, surface overtime/compliance
   caveats, and never invent a saved \`plan_id\` or claim full planner parity.
3. For a national Rate Index request, use the remote MCP when attached. Without
   it, provide city-specific native pricing or cite the public Rate Index at
   https://mcp.tempguru.co/okf/rate-index.md; do not fabricate a benchmark.
4. After explicit user confirmation, \`tempguru_request_quote\` can submit the
   reviewed plan without a \`plan_id\`; Pi source attribution is added by the
   extension automatically.

Continue with the domain workflow below, using this routing contract.
`;

export function adaptSkillForPi(canonical) {
  const text = Buffer.isBuffer(canonical) ? canonical.toString("utf8") : String(canonical);
  const frontmatterEnd = text.indexOf("\n---\n", 4);
  if (!text.startsWith("---\n") || frontmatterEnd === -1) {
    throw new Error("cannot adapt Pi skill without complete YAML frontmatter");
  }
  const split = frontmatterEnd + "\n---\n".length;
  let body = text.slice(split);
  for (const [canonicalName, piName] of Object.entries(PI_NATIVE_TOOL_MAP)) {
    body = body.replace(new RegExp(`\\b${canonicalName}\\b`, "g"), piName);
  }
  // Keep remote MCP identifiers exact. Prefixing names inside backticks (for
  // example `MCP-only plan_staffing`) creates a nonexistent callable tool.
  // The runtime guide above marks these two as remote-only and supplies the
  // native fallback without changing their actual identifiers.
  body = body
    .replace(/## Live data: use the MCP server/g, "## Live data: use Pi native tools (or remote MCP)")
    .replace(
      /Endpoint: `POST https:\/\/mcp\.tempguru\.co\/mcp`[\s\S]*?\n\n/g,
      "The installed Pi extension calls TempGuru's hosted REST action layer with no API key and adds `source=pi` attribution automatically. Attach `https://mcp.tempguru.co/mcp?source=pi` only when the MCP-only planner or Rate Index is required.\n\n",
    )
    .replace(/If the MCP server is unavailable/g, "If both the Pi native tools and remote MCP are unavailable")
    .replace(/Without MCP tools/g, "Without Pi native tools or remote MCP");
  return `${text.slice(0, split)}\n${PI_RUNTIME_GUIDE}\n${body}`;
}

export function skillDigests() {
  const out = {};
  for (const name of SKILLS) {
    const bytes = readFileSync(join(skillsDir, `${name}.md`));
    out[name] = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  }
  return out;
}

// When run directly (not imported by the CI gate), write the file.
if (import.meta.url === `file://${process.argv[1]}`) {
  const digests = skillDigests();
  const path = join(skillsDir, "skill-digests.json");
  writeFileSync(path, JSON.stringify(digests, null, 2) + "\n");
  for (const name of SKILLS) {
    const canonical = readFileSync(join(skillsDir, `${name}.md`));
    mkdirSync(join(claudePluginSkillsDir, name), { recursive: true });
    writeFileSync(join(claudePluginSkillsDir, name, "SKILL.md"), canonical);
    mkdirSync(join(portableSkillsDir, name), { recursive: true });
    writeFileSync(join(portableSkillsDir, name, "SKILL.md"), canonical);
    mkdirSync(join(piSkillsDir, name), { recursive: true });
    writeFileSync(join(piSkillsDir, name, "SKILL.md"), adaptSkillForPi(canonical));
  }
  console.log(`Wrote content/skills/skill-digests.json`);
  console.log(`Synced ${SKILLS.length} canonical skills into plugins/tempguru/skills/`);
  console.log(`Synced ${SKILLS.length} canonical skills into skills/ for Gemini, OpenClaw, and Codex`);
  console.log(`Generated ${SKILLS.length} Pi-adapted skills in distribution/pi/skills/ for the tempguru-pi package`);
  for (const [k, v] of Object.entries(digests)) console.log(`  ${k}: ${v}`);
}
