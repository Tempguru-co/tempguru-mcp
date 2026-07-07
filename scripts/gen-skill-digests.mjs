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
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const skillsDir = join(repoRoot, "content", "skills");

// The skills the discovery index advertises. Keep in sync with the route.
const SKILLS = ["event-staffing-ordering", "event-staffing-compliance"];

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
  console.log(`Wrote content/skills/skill-digests.json`);
  for (const [k, v] of Object.entries(digests)) console.log(`  ${k}: ${v}`);
}
