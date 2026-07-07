// GET /.well-known/mcp.json
//
// MCP server discovery document per SEP-1649. HTTP-based domain discovery:
// agents and MCP clients check this path to find the server endpoint and
// capabilities before opening a connection.
//
// Companion surfaces:
//   /.well-known/mcp/server-card.json   rich metadata (already live)
//   DNS TXT _mcp.tempguru.co            DNS-layer discovery (Cloudflare)
//
// Served at mcp.tempguru.co AND at tempguru.co via Cloudflare Worker.
// Both copies must stay in sync.

const MCP_DISCOVERY = {
  servers: [
    {
      // Matches serverInfo.name returned by the live server on initialize and
      // the npm package identifier (check:submissions gates this consistency).
      name: "tempguru-mcp",
      title: "TempGuru Event Staffing",
      description:
        "MCP server for TempGuru event staffing data: city coverage (345 US/Canada markets), staffing roles, lead-time guidance, all-inclusive W-2 rate ranges, and state-by-state compliance rules, plus a plan_staffing planner, a get_rate_benchmark Rate Index, and an opt-in request_quote submission tool. Ships tools, skill resources, and guided prompts.",
      endpoint: "https://mcp.tempguru.co/mcp",
      transport: "streamable-http",
      // Matches the version the live server actually negotiates on initialize.
      // Keep in sync with the server card (check:submissions gates this).
      protocolVersion: "2025-06-18",
      authentication: { type: "none" },
      documentation: "https://tempguru.co/ai",
      serverCard: "https://mcp.tempguru.co/.well-known/mcp/server-card.json",
      knowledge: "https://mcp.tempguru.co/.well-known/okf.json",
    },
  ],
} as const;

export async function GET() {
  return new Response(JSON.stringify(MCP_DISCOVERY, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}
