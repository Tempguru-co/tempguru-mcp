// TempGuru MCP server — stdio transport (local / Docker / embedded).
//
// A self-contained build of the same MCP server that runs at
// https://mcp.tempguru.co/mcp. It registers the identical 6 tools + 2 Skill
// resources via the shared registerTools(), but speaks MCP over stdin/stdout
// instead of streamable HTTP — the form that Claude Desktop, the Docker MCP
// Catalog, on-device assistants, and Glama's sandboxed checker expect from a
// locally-run server.
//
// Boots with no configuration: the five read-only tools serve static data that
// esbuild bundles into the binary, and request_quote registers but returns a
// clean error if NOTION_API_KEY is unset (e.g. a credential-less Docker build),
// so the server never crashes on startup.
//
// IMPORTANT: stdout is the MCP protocol channel — nothing may write to it except
// the transport. All diagnostics go to stderr.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerTools } from "./lib/mcp/register-tools";

// Skill resource bodies, loaded best-effort. Resolved relative to this binary
// first (so they load when the server is installed as an npm package and run via
// npx from any directory), then relative to cwd (the Docker/Glama build runs from
// the project root). If none are found, tools still register and only the two
// Skill resources are skipped.
function loadSkills(): { ordering: string; compliance: string } | undefined {
  let here: string;
  try {
    here = dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }
  const candidates = [
    join(here, "skills"), // npm CLI layout: <pkg>/skills
    join(here, "..", "content", "skills"), // dist layout: <pkg>/content/skills
    join(process.cwd(), "content", "skills"), // run from project root
  ];
  for (const dir of candidates) {
    try {
      return {
        ordering: readFileSync(join(dir, "event-staffing-ordering.md"), "utf-8"),
        compliance: readFileSync(join(dir, "event-staffing-compliance.md"), "utf-8"),
      };
    } catch {
      // try the next candidate
    }
  }
  console.error("[tempguru-mcp] Skill resources not found; registering tools only.");
  return undefined;
}

const server = new McpServer({
  name: "tempguru-mcp",
  version: "1.2.0",
  title: "TempGuru Event Staffing",
  description:
    "W-2 event staffing data for AI agents: 345 US/CA markets. Eight tools: the call-first plan_staffing planner, six read-only lookups including the get_rate_benchmark Rate Index, and an opt-in request_quote submission. Ships skill resources and guided prompts. No authentication required. ChatGPT users without MCP: the TempGuru Event Staffing Planner GPT covers the same workflow.",
  icons: [
    {
      src: "https://mcp.tempguru.co/logo.svg",
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ],
} as { name: string; version: string });

registerTools(server, { resources: loadSkills() });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[tempguru-mcp] stdio server ready — 8 tools, 2 prompts.");
}

main().catch((err) => {
  console.error("[tempguru-mcp] fatal:", err);
  process.exit(1);
});
