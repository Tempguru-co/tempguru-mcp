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

// Canonical discovery-skill list for the generators and submission gate. The
// gate verifies that the discovery route and MCP resource list expose this
// exact set, so those runtime surfaces cannot silently drift from these files.
export const SKILLS = [
  "event-staffing-ordering",
  "event-staffing-compliance",
  "staffing-plan-from-event-brief",
  "urgent-event-backfill",
  "staffing-agency-partner-growth",
];

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
    writeFileSync(join(claudePluginSkillsDir, name, "SKILL.md"), canonical);
    mkdirSync(join(portableSkillsDir, name), { recursive: true });
    writeFileSync(join(portableSkillsDir, name, "SKILL.md"), canonical);
  }
  console.log(`Wrote content/skills/skill-digests.json`);
  console.log(`Synced ${SKILLS.length} canonical skills into plugins/tempguru/skills/`);
  console.log(`Synced ${SKILLS.length} canonical skills into skills/ for Pi, Gemini, OpenClaw, and Codex`);
  for (const [k, v] of Object.entries(digests)) console.log(`  ${k}: ${v}`);
}
