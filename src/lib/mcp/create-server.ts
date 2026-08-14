import { McpServer, type ServerOptions } from "@modelcontextprotocol/server";
import pkg from "../../../package.json";
import {
  getServerInstructions,
  registerTools,
  type RegisterToolsOptions,
} from "./register-tools";
import { MARKET_CATALOG_DESCRIPTION } from "../public-facts";

const PUBLIC_CATALOG_CACHE_HINT = {
  ttlMs: 300_000,
  cacheScope: "public",
} as const;

const PUBLIC_RESOURCE_CACHE_HINT = {
  ttlMs: 86_400_000,
  cacheScope: "public",
} as const;

const CACHE_HINTS = {
  "server/discover": PUBLIC_CATALOG_CACHE_HINT,
  "tools/list": PUBLIC_CATALOG_CACHE_HINT,
  "prompts/list": PUBLIC_CATALOG_CACHE_HINT,
  "resources/list": PUBLIC_CATALOG_CACHE_HINT,
  "resources/templates/list": PUBLIC_CATALOG_CACHE_HINT,
  "resources/read": PUBLIC_RESOURCE_CACHE_HINT,
} satisfies NonNullable<ServerOptions["cacheHints"]>;

/**
 * Build one transport-neutral TempGuru MCP server instance.
 *
 * The official HTTP and stdio entries both call a factory, allowing the same
 * tools, prompts, resources, metadata, and cache policy to serve 2025-era and
 * 2026-era clients without parallel implementations.
 */
export function createTempGuruMcpServer(options: RegisterToolsOptions = {}): McpServer {
  const server = new McpServer(
    {
      name: "tempguru-mcp",
      version: pkg.version,
      title: "TempGuru Event Staffing",
      description:
        "W-2 event staffing data for AI agents. " +
        MARKET_CATALOG_DESCRIPTION +
        " Twelve tools: ten read-only tools including a non-PII request_quote buyer handoff, a compatibility planner that may save a 30-day non-PII snapshot, and an explicit non-contact save_staffing_plan artifact write. Ships skill resources and guided prompts. No authentication required.",
      icons: [
        {
          src: "https://mcp.tempguru.co/logo.svg",
          mimeType: "image/svg+xml",
          sizes: ["any"],
        },
      ],
    },
    {
      instructions: getServerInstructions(),
      cacheHints: CACHE_HINTS,
    },
  );

  registerTools(server, options);
  return server;
}
