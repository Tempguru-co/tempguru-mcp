// Generates the apex Cloudflare edge worker (cloudflare/worker.js) that serves
// TempGuru's robots.txt + agent-discovery files at the tempguru.co apex in
// front of the Cloudflare Pages origin.
//
// DRIFT-PROOF: every served file is derived from its canonical in-repo source,
// so the apex mirror cannot fall behind what mcp.tempguru.co serves:
//   - mcp.json, server-card, api-catalog, agent-skills/index.json: the live
//     Next.js route handlers, esbuild-evaluated (same trick as dump-openapi),
//     so the bytes equal exactly what mcp.tempguru.co returns.
//   - SKILL.md files: content/skills/*.md verbatim (the index.json sha256
//     digests come from the route, which hashes these same files).
//   - okf.json + security.txt: public/.well-known/ (built/maintained in-repo).
//   - schema: public/schemas/event-staffing-request.schema.json.
//   - robots.txt: cloudflare/robots.txt.
//   - agent-card + public facts contract: their live Next.js route handlers.
//
//   node scripts/build-edge-worker.mjs   (or: npm run build:worker)

import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SKILLS as SKILL_SLUGS } from "./gen-skill-digests.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const r = (...p) => join(repoRoot, ...p);
const pkg = JSON.parse(readFileSync(r("package.json"), "utf8"));

// Evaluate a Next.js route handler and return its GET() response body, exactly
// what mcp.tempguru.co serves for that path.
async function routeText(relPath) {
  const result = await build({
    entryPoints: [r(relPath)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const tmp = join(mkdtempSync(join(tmpdir(), "edge-worker-")), "route.mjs");
  writeFileSync(tmp, result.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href);
  const res = await mod.GET();
  return await res.text();
}

const JSON_T = "application/json; charset=utf-8";
const MD_T = "text/markdown; charset=utf-8";

const mcpJson = await routeText("src/app/.well-known/mcp.json/route.ts");
const serverCard = await routeText("src/app/.well-known/mcp/server-card.json/route.ts");
const apiCatalog = await routeText("src/app/.well-known/api-catalog/route.ts");
const agentSkillsIndex = await routeText("src/app/.well-known/agent-skills/index.json/route.ts");
const agentCard = await routeText("src/app/.well-known/agent-card.json/route.ts");
const publicFacts = await routeText("src/app/.well-known/tempguru-facts.json/route.ts");

// The digest generator's canonical list drives both discovery trees here. The
// submission gate separately proves the route and MCP resources expose the same
// exact set.
const skillBodies = Object.fromEntries(
  SKILL_SLUGS.map((s) => [s, readFileSync(r(`content/skills/${s}.md`), "utf8")]),
);
const okfJson = readFileSync(r("public/.well-known/okf.json"), "utf8");
const securityTxt = readFileSync(r("public/.well-known/security.txt"), "utf8");
const authMd = readFileSync(r("content/auth.md"), "utf8");
const schemaJson = readFileSync(r("public/schemas/event-staffing-request.schema.json"), "utf8");
const robots = readFileSync(r("cloudflare/robots.txt"), "utf8");

// /.well-known/skills/index.json: the simpler discovery shape, derived from the
// agent-skills index so names + descriptions stay in one place.
const skillsIndex = {
  skills: JSON.parse(agentSkillsIndex).skills.map((s) => ({
    name: s.name,
    description: s.description,
    files: ["SKILL.md"],
  })),
};

// path -> { body, type }. Order mirrors the live worker for easy diffing.
const files = [
  ["/.well-known/mcp.json", mcpJson, JSON_T],
  ["/.well-known/mcp/server-card.json", serverCard, JSON_T],
  ["/.well-known/agent-card.json", agentCard, JSON_T],
  ["/.well-known/tempguru-facts.json", publicFacts, JSON_T],
  ["/.well-known/agent-skills/index.json", agentSkillsIndex, JSON_T],
  ...SKILL_SLUGS.map((s) => [`/.well-known/agent-skills/${s}/SKILL.md`, skillBodies[s], MD_T]),
  ["/.well-known/skills/index.json", JSON.stringify(skillsIndex, null, 2) + "\n", JSON_T],
  ...SKILL_SLUGS.map((s) => [`/.well-known/skills/${s}/SKILL.md`, skillBodies[s], MD_T]),
  ["/.well-known/api-catalog", apiCatalog, "application/linkset+json"],
  ["/.well-known/security.txt", securityTxt, "text/plain; charset=utf-8"],
  ["/auth.md", authMd, MD_T],
  ["/schemas/event-staffing-request.schema.json", schemaJson, JSON_T],
  ["/.well-known/okf.json", okfJson, JSON_T],
];

// Validation gates: every JSON body parses, and no em-dash leaks into a
// published surface (brand rule).
const EM_DASH = /\u2014/;
for (const [path, body, type] of files) {
  if (EM_DASH.test(body)) throw new Error(`em-dash found in ${path}; fix the canonical source`);
  if (type.includes("json")) {
    try {
      JSON.parse(body);
    } catch (e) {
      throw new Error(`invalid JSON for ${path}: ${e.message}`);
    }
  }
}
if (EM_DASH.test(robots)) throw new Error("em-dash in cloudflare/robots.txt");

// Emit pure-ASCII JS string literals: escape every non-ASCII char to \uXXXX so
// the generated worker remains stable across review and deployment tooling. The
// runtime string is byte-identical (x decodes to the same char), so served
// content and sha256 digests are unchanged.
const asciiStr = (s) =>
  JSON.stringify(s).replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

const entries = files
  .map(
    ([path, body, type]) =>
      `  ${asciiStr(path)}: { body: ${asciiStr(body)}, type: ${asciiStr(type)} },`,
  )
  .join("\n");

const out = `// AUTO-GENERATED by scripts/build-edge-worker.mjs. Do not hand-edit.
// Cloudflare worker for the tempguru.co apex: serves robots.txt + agent
// discovery files in front of the Cloudflare Pages origin. Every file is derived
// from a canonical in-repo source, so this mirror cannot drift from
// mcp.tempguru.co. Regenerate with: npm run build:worker
//
// Deploy the reviewed file to the Cloudflare worker route bound to tempguru.co.
// Unmatched paths pass through to Cloudflare Pages, including unmatched
// .well-known/* paths used by platform-managed certificates and integrations.

const ROBOTS = ${JSON.stringify(robots)};

const AGENT_FILES = {
${entries}
};

const STATIC_SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/robots.txt") {
      return new Response(ROBOTS, {
        headers: {
          ...STATIC_SECURITY_HEADERS,
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=86400",
        },
      });
    }

    const agentFile = AGENT_FILES[url.pathname];
    if (agentFile) {
      return new Response(agentFile.body, {
        headers: {
          ...STATIC_SECURITY_HEADERS,
          "content-type": agentFile.type,
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    // Everything else passes through to the Cloudflare Pages origin.
    return fetch(request);
  },
};
`;

mkdirSync(r("cloudflare"), { recursive: true });
writeFileSync(r("cloudflare/worker.js"), out);
console.log(`Wrote cloudflare/worker.js: ${files.length} discovery files + robots.txt`);
console.log(`  version ${pkg.version} | em-dash guard + JSON parse passed`);
