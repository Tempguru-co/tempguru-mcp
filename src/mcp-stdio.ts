// TempGuru MCP server, stdio transport (local / Docker / embedded).
//
// A self-contained build of the same MCP server that runs at
// https://mcp.tempguru.co/mcp. It registers the identical 11 tools and Skill
// resources via the shared registerTools(), but speaks MCP over stdin/stdout
// instead of streamable HTTP, the form that Claude Desktop, the Docker MCP
// Catalog, on-device assistants, and Glama's sandboxed checker expect from a
// locally-run server.
//
// Boots with no configuration: nine lookup tools serve static data or clean
// not-found variants, plan_staffing fails open without saved-plan storage, and
// request_quote returns a clean error if NOTION_API_KEY is unset (e.g. a
// credential-less Docker build), so the server never crashes on startup.
//
// IMPORTANT: stdout is the MCP protocol channel, nothing may write to it except
// the transport. All diagnostics go to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTools, SERVER_INSTRUCTIONS, SKILL_SLUGS, type SkillSlug } from "./lib/mcp/register-tools";

// Skill resource bodies, loaded best-effort. Resolved relative to this binary
// first (so they load when the server is installed as an npm package and run via
// npx from any directory), then relative to cwd (the Docker/Glama build runs from
// the project root). Skills found are registered; a missing file skips just that
// skill, and if none are found, tools still register with no resources.
function loadSkills(): Partial<Record<SkillSlug, string>> | undefined {
  let here: string;
  try {
    here = dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }
  const candidates = [
    join(here, "skills"), // npm CLI layout: <pkg>/skills
    join(here, "..", "content", "skills"), // dist layout: <pkg>/content/skills
    join(process.cwd(), "skills"), // portable Agent Skills checkout layout
    join(process.cwd(), "content", "skills"), // run from project root
  ];
  for (const dir of candidates) {
    const found: Partial<Record<SkillSlug, string>> = {};
    for (const slug of SKILL_SLUGS) {
      for (const path of [join(dir, slug, "SKILL.md"), join(dir, `${slug}.md`)]) {
        try {
          found[slug] = readFileSync(path, "utf-8");
          break;
        } catch {
          // Try the portable directory layout, then the canonical flat layout.
        }
      }
    }
    if (Object.keys(found).length > 0) return found;
  }
  console.error("[tempguru-mcp] Skill resources not found; registering tools only.");
  return undefined;
}

const server = new McpServer({
  name: "tempguru-mcp",
  version: pkg.version,
  title: "TempGuru Event Staffing",
  description:
    "W-2 event staffing data for AI agents: 345 US/CA markets. Eleven tools: nine read-only lookups, a non-destructive planner that may save a 30-day non-PII snapshot, and one opt-in request_quote contact submission. Ships skill resources and guided prompts. No authentication required.",
  icons: [
    {
      src: "https://mcp.tempguru.co/logo.svg",
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ],
} as { name: string; version: string }, { instructions: SERVER_INSTRUCTIONS });

registerTools(server, { resources: loadSkills() });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[tempguru-mcp] stdio server ready, 11 tools, ${SKILL_SLUGS.length} skill resources, 2 prompts.`);
}

main().catch((err) => {
  console.error("[tempguru-mcp] fatal:", err);
  process.exit(1);
});
