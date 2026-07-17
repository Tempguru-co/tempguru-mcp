// Live canary for the two public skill-discovery origins. This deliberately
// runs outside pull-request CI: Vercel and the apex Cloudflare worker must be
// deployed before their bytes can match the merged canonical sources.

import { createHash } from "node:crypto";
import { SKILLS } from "./gen-skill-digests.mjs";

const ORIGINS = ["https://mcp.tempguru.co", "https://tempguru.co"];
const expected = new Set(SKILLS);

async function fetchOk(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

function assertExactSet(label, names) {
  if (
    names.length !== expected.size ||
    new Set(names).size !== names.length ||
    names.some((name) => !expected.has(name))
  ) {
    throw new Error(`${label}: [${names.join(", ")}] != [${SKILLS.join(", ")}]`);
  }
}

for (const origin of ORIGINS) {
  const indexUrl = `${origin}/.well-known/agent-skills/index.json`;
  const index = await (await fetchOk(indexUrl)).json();
  const entries = Array.isArray(index.skills) ? index.skills : [];
  assertExactSet(`${origin} agent-skills`, entries.map((entry) => entry.name));

  for (const entry of entries) {
    const artifactUrl = new URL(entry.url, indexUrl).toString();
    const bytes = Buffer.from(await (await fetchOk(artifactUrl)).arrayBuffer());
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (digest !== entry.digest) {
      throw new Error(`${artifactUrl}: advertised ${entry.digest}, served ${digest}`);
    }
  }

}

const legacyOrigin = "https://tempguru.co";
const legacy = await (await fetchOk(`${legacyOrigin}/.well-known/skills/index.json`)).json();
const legacyEntries = Array.isArray(legacy.skills) ? legacy.skills : [];
assertExactSet("apex legacy Hermes skills", legacyEntries.map((entry) => entry.name));
for (const skill of SKILLS) {
  await fetchOk(`${legacyOrigin}/.well-known/skills/${skill}/SKILL.md`);
}

for (const skill of SKILLS) {
  await fetchOk(`https://mcp.tempguru.co/okf/workflows/${skill}.md`);
}
await fetchOk("https://tempguru.co/.well-known/security.txt");

for (const origin of ORIGINS) {
  const card = await (await fetchOk(`${origin}/.well-known/mcp/server-card.json`)).json();
  const description = String(card?.serverInfo?.description ?? "");
  if (!description.includes(`${SKILLS.length} skill resources`)) {
    throw new Error(`${origin} server card: expected ${SKILLS.length}-skill description, got ${description}`);
  }
  if (!description.includes("nine read-only lookups") || !description.includes("non-destructive planner")) {
    throw new Error(`${origin} server card: saved-plan side effect is not disclosed, got ${description}`);
  }
}

for (const path of ["/llms.txt", "/llms-full.txt"]) {
  const body = await (await fetchOk(`https://tempguru.co${path}`)).text();
  const inventories = [...body.matchAll(/^- Canonical Agent Skills \((\d+)\):[^\n]*$/gm)];
  if (inventories.length !== 1 || Number(inventories[0][1]) !== SKILLS.length) {
    throw new Error(`${path}: expected exactly one ${SKILLS.length}-skill inventory`);
  }
  if (body.includes("10 read-only") || !body.includes("non-destructive planner")) {
    throw new Error(`${path}: MCP planner side-effect inventory is stale`);
  }
  for (const skill of SKILLS) {
    if (!inventories[0][0].includes(skill)) throw new Error(`${path}: inventory missing ${skill}`);
  }
}

console.log(`Live discovery OK: ${SKILLS.length} skills, both Agent Skills origins, apex Hermes tree, digests, OKF, server cards, and llms inventories.`);
