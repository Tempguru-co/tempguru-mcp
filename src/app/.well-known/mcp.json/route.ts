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
      name: "tempguru-event-staffing",
      title: "TempGuru Event Staffing",
      description:
        "MCP server for TempGuru event staffing data: city coverage (300+ US/Canada markets), staffing roles, lead-time guidance, all-inclusive W-2 rate ranges, and state-by-state compliance rules, plus an opt-in request_quote submission tool.",
      endpoint: "https://mcp.tempguru.co/mcp",
      transport: "streamable-http",
      protocolVersion: "2025-03-26",
      authentication: { type: "none" },
      documentation: "https://tempguru.co/ai",
      serverCard: "https://mcp.tempguru.co/.well-known/mcp/server-card.json",
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
