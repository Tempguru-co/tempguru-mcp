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
import { join } from "node:path";
import { registerTools } from "./lib/mcp/register-tools";

// Skill resource bodies, loaded best-effort from the repo's content/ tree
// (present when the binary is run from the project root, as in the Docker
// build). If unreadable, tools still register — only the resources are skipped.
function loadSkills(): { ordering: string; compliance: string } | undefined {
  try {
    const dir = join(process.cwd(), "content", "skills");
    return {
      ordering: readFileSync(join(dir, "event-staffing-ordering.md"), "utf-8"),
      compliance: readFileSync(join(dir, "event-staffing-compliance.md"), "utf-8"),
    };
  } catch (err) {
    console.error(
      "[tempguru-mcp] Skill resources not found; registering tools only:",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

const server = new McpServer({
  name: "tempguru-mcp",
  version: "1.0.0",
  title: "TempGuru Event Staffing",
  description:
    "W-2 event staffing data for AI agents: 300+ US/CA markets, brand ambassadors, registration, hospitality, setup/breakdown. Five read-only lookups (coverage, rates, lead times, state compliance summaries) plus an opt-in request_quote submission. No authentication required.",
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
  console.error("[tempguru-mcp] stdio server ready — 6 tools.");
}

main().catch((err) => {
  console.error("[tempguru-mcp] fatal:", err);
  process.exit(1);
});
