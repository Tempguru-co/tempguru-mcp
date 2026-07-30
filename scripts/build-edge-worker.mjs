// Generates the apex Cloudflare edge worker (cloudflare/worker.js) that serves
// TempGuru's robots.txt + agent-discovery files at the tempguru.co apex (which
// otherwise points at Squarespace and 404s these paths).
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
//   - agent-card: built here (no Next route exists), version from package.json.
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

// The digest generator's canonical list drives both discovery trees here. The
// submission gate separately proves the route and MCP resources expose the same
// exact set.
const skillBodies = Object.fromEntries(
  SKILL_SLUGS.map((s) => [s, readFileSync(r(`content/skills/${s}.md`), "utf8")]),
);
const okfJson = readFileSync(r("public/.well-known/okf.json"), "utf8");
const securityTxt = readFileSync(r("public/.well-known/security.txt"), "utf8");
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

// /.well-known/agent-card.json: A2A-style card. No Next route serves it, so it
// is built here; version tracks package.json, market count tracks the standard.
const agentCard = {
  name: "TempGuru Event Staffing",
  description:
    "W-2 compliant temporary event staffing for conventions, trade shows, festivals, concerts, sporting events, and brand activations across 345 US and Canadian markets. Checks city coverage, role pricing, lead times, and state compliance. Prepares a non-PII plan handoff for a buyer to personally submit to a human coordinator.",
  url: "https://mcp.tempguru.co/mcp",
  version: pkg.version,
  provider: { organization: "Temporary Assistance Guru, Inc.", url: "https://tempguru.co" },
  capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: false },
  skills: [
    {
      id: "event-staffing-ordering",
      name: "Event Staffing Order",
      description:
        "Order W-2 compliant temporary event staff for conventions, trade shows, festivals, concerts, sporting events, and brand activations in 345 US and Canadian markets. Checks city coverage, role pricing, availability, and state compliance, then prepares a prefilled form the buyer personally submits.",
      tags: ["event-staffing", "trade-show", "brand-ambassador", "w2", "staffing", "registration"],
      examples: [
        "I need 4 brand ambassadors for a trade show in Austin June 15-17",
        "What does it cost to staff a festival in Miami?",
        "Book registration staff for our conference in Chicago",
        "Send TempGuru a quote request: 6 brand ambassadors for our 2-day expo in Dallas, August 12-13",
      ],
    },
    {
      id: "event-staffing-compliance",
      name: "Event Staffing Compliance Check",
      description:
        "Assess worker classification and compliance risk for event staffing, W-2 vs 1099, joint-employer liability, COI requirements, wage and hour rules. Includes live state-by-state lookups.",
      tags: ["compliance", "w2", "1099", "misclassification", "event-staffing", "employment-law"],
      examples: [
        "Is using 1099 workers for my trade show staff compliant in California?",
        "What are the overtime rules for event staff in New York?",
      ],
    },
    {
      id: "staffing-plan-from-event-brief",
      name: "Staffing Plan From Event Brief",
      description:
        "Extract a complete staffing plan from an event document (RFP, BEO, run of show, exhibitor manual, production schedule): map functions to roles, estimate headcount, price with live W-2 rates, and prepare a buyer-operated handoff for a human-reviewed quote.",
      tags: ["event-staffing", "rfp", "beo", "run-of-show", "event-planning", "staffing-plan"],
      examples: [
        "Here's the BEO for our gala, how many staff do we need and what will it cost?",
        "Read this exhibitor manual and build the booth staffing plan",
      ],
    },
    {
      id: "urgent-event-backfill",
      name: "Urgent Event Backfill",
      description:
        "Same-week and day-of staffing emergencies: no-shows, vendor cancellations, events within 72 hours. Honest rush lead-time guidance, a prefilled buyer submission form, and a direct phone path. Never promises availability.",
      tags: ["event-staffing", "urgent", "backfill", "no-show", "last-minute", "rush"],
      examples: [
        "Our staffing vendor cancelled and the event is Saturday",
        "Three of our registration staff didn't show up this morning",
      ],
    },
    {
      id: "staffing-agency-partner-growth",
      name: "Staffing Agency Partner Growth",
      description:
        "For staffing agency owners: join TempGuru's network of 200+ vetted local partners to receive event staffing order flow in your market. Routes partner inquiries to the coordinator, not through the buyer quote tool.",
      tags: ["staffing-agency", "partner-network", "event-staffing", "b2b", "supply-side"],
      examples: [
        "Our agency has W-2 event staff in Phoenix, how do we get more event orders?",
        "How does a local staffing agency join a national event staffing network?",
      ],
    },
    {
      id: "multi-city-activation-planner",
      name: "Multi-City Activation Planner",
      description:
        "Plan and price a multi-city event staffing program (tour, roadshow, sampling tour, festival circuit, national activation) as one consolidated order. Confirms coverage per market, prices each leg with live W-2 rates, surfaces state and provincial overtime differences, and prepares a buyer-operated quote handoff.",
      tags: ["event-staffing", "multi-city", "tour", "roadshow", "activation", "w2"],
      examples: [
        "Plan staffing for a 6-city product roadshow next quarter",
        "We need brand ambassadors in Chicago, Dallas, and Miami on one invoice",
      ],
    },
    {
      id: "event-staffing-procurement",
      name: "Event Staffing Procurement",
      description:
        "Answer event staffing procurement and vendor-onboarding questions (COI, W-9, insurance and workers' comp posture, cancellation and payment terms, MSAs, approved-vendor setup) from published policy, explicit when a value is coordinator-confirmed, then bridge a real event into a priced plan and buyer-operated quote handoff.",
      tags: ["event-staffing", "procurement", "vendor-onboarding", "coi", "insurance", "w2"],
      examples: [
        "Can you send a COI naming our venue as additional insured?",
        "What are your payment terms and are you an approved vendor?",
      ],
    },
    {
      id: "tempguru-pro-operations",
      name: "TempGuru Pro Operations",
      description:
        "For staffing-company operators: route interest in operations tooling (scheduling, dispatch, timesheets, invoicing) to a TempGuru contact. Lead capture only; does not promise product features, pricing, or availability, and never uses the buyer quote tool.",
      tags: ["staffing-software", "operations", "scheduling", "dispatch", "b2b", "supply-side"],
      examples: [
        "We run a staffing company and need scheduling and invoicing software",
        "Does TempGuru offer a platform to manage our own staff and shifts?",
      ],
    },
  ],
  defaultInputModes: ["text/plain", "application/json"],
  defaultOutputModes: ["text/plain", "application/json"],
  authentication: { schemes: [] },
  documentationUrl: "https://tempguru.co/ai",
  iconUrl: "https://mcp.tempguru.co/logo.svg",
};

// path -> { body, type }. Order mirrors the live worker for easy diffing.
const files = [
  ["/.well-known/mcp.json", mcpJson, JSON_T],
  ["/.well-known/mcp/server-card.json", serverCard, JSON_T],
  ["/.well-known/agent-card.json", JSON.stringify(agentCard, null, 2), JSON_T],
  ["/.well-known/agent-skills/index.json", agentSkillsIndex, JSON_T],
  ...SKILL_SLUGS.map((s) => [`/.well-known/agent-skills/${s}/SKILL.md`, skillBodies[s], MD_T]),
  ["/.well-known/skills/index.json", JSON.stringify(skillsIndex, null, 2) + "\n", JSON_T],
  ...SKILL_SLUGS.map((s) => [`/.well-known/skills/${s}/SKILL.md`, skillBodies[s], MD_T]),
  ["/.well-known/api-catalog", apiCatalog, "application/linkset+json"],
  ["/.well-known/security.txt", securityTxt, "text/plain; charset=utf-8"],
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
// the worker file survives copy-paste through any editor/clipboard intact. The
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
// discovery files in front of the Squarespace origin. Every file is derived
// from a canonical in-repo source, so this mirror cannot drift from
// mcp.tempguru.co. Regenerate with: npm run build:worker
//
// Deploy: paste this whole file into the Cloudflare worker bound to tempguru.co.
// Unmatched paths pass through to Squarespace (including unmatched .well-known/*,
// do not 404 those; Squarespace uses /.well-known/acme-challenge/* for certs).

const ROBOTS = ${JSON.stringify(robots)};

const AGENT_FILES = {
${entries}
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/robots.txt") {
      return new Response(ROBOTS, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=86400",
        },
      });
    }

    const agentFile = AGENT_FILES[url.pathname];
    if (agentFile) {
      return new Response(agentFile.body, {
        headers: {
          "content-type": agentFile.type,
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=3600",
        },
      });
    }

    // Everything else passes through to the Squarespace origin.
    return fetch(request);
  },
};
`;

mkdirSync(r("cloudflare"), { recursive: true });
writeFileSync(r("cloudflare/worker.js"), out);
console.log(`Wrote cloudflare/worker.js: ${files.length} discovery files + robots.txt`);
console.log(`  version ${pkg.version} | em-dash guard + JSON parse passed`);
