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
        "Dual-era TempGuru event staffing MCP across 345 US/Canada markets with 12 tools: nine read-only lookups, the non-destructive plan_staffing planner, an explicit non-destructive save_staffing_plan write, and one opt-in request_quote contact submission. Also ships 8 skill resources and two guided prompts.",
      endpoint: "https://mcp.tempguru.co/mcp",
      transport: "streamable-http",
      // Preferred modern revision. The same endpoint also accepts the listed
      // initialize-based 2025-era revisions through its stateless fallback.
      // Keep in sync with the server card (check:submissions gates this).
      protocolVersion: "2026-07-28",
      supportedProtocolVersions: [
        "2026-07-28",
        "2025-11-25",
        "2025-06-18",
        "2025-03-26",
        "2024-11-05",
        "2024-10-07",
      ],
      protocolCompatibility: {
        modern: "MCP 2026-07-28 per-request envelopes",
        legacy: "Stateless MCP initialize/streamable-HTTP compatibility",
      },
      authentication: { type: "none" },
      documentation: "https://tempguru.co/ai",
      serverCard: "https://mcp.tempguru.co/.well-known/mcp/server-card.json",
      knowledge: "https://mcp.tempguru.co/.well-known/okf.json",
      workflow: {
        phase: "A",
        instructions: [
          "Call plan_staffing first with the event city, date, roles, and headcount.",
          "If a complete plan already includes plan_id, retain it and do not call save_staffing_plan; the planner already saved the non-PII snapshot.",
          "Call save_staffing_plan only for a complete plan that has no plan_id and needs a durable 30-day artifact; the server recomputes rates and totals from bounded event inputs before saving.",
          "Only after the user explicitly confirms, call request_quote and include plan_id when one is available.",
        ],
      },
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
