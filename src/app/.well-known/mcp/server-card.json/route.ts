// GET /.well-known/mcp/server-card.json
//
// MCP Server Card per SEP-1649 (schema in standardization at
// modelcontextprotocol PR #2127). Several public MCP directories and
// agent platforms link to this URL for at-a-glance server metadata
// before they hit /mcp itself. Update if the final SEP-1649 schema diverges.
//
// Kept hand-synced with the same file at:
//   github.com/kissmyabs32/tempguru-agent-skills/blob/main/mcp/server-card.json
//
// served with application/json + 1-hour public cache.

const SERVER_CARD = {
  $comment:
    "MCP Server Card per SEP-1649 (schema in standardization at modelcontextprotocol PR #2127). Update if the final schema diverges.",
  serverInfo: {
    name: "tempguru-event-staffing",
    title: "TempGuru Event Staffing",
    version: "1.0.0",
    description:
      "Read-only Model Context Protocol server for TempGuru event staffing data: city coverage (300+ US/Canada markets), staffing roles, lead-time guidance, all-inclusive W-2 rate ranges, and state-by-state compliance rules.",
    websiteUrl: "https://tempguru.co",
  },
  transport: {
    type: "streamable-http",
    url: "https://mcp.tempguru.co/mcp",
  },
  protocolVersion: "2025-03-26",
  capabilities: {
    tools: {},
  },
  tools: [
    {
      name: "get_cities",
      description:
        "List all cities TempGuru serves, optionally filtered by state or market tier.",
    },
    {
      name: "get_roles",
      description:
        "List all event staffing roles with descriptions and skill tiers.",
    },
    {
      name: "check_availability",
      description:
        "Lead-time guidance for a city/date, optionally with role and headcount.",
    },
    {
      name: "get_role_pricing",
      description:
        "All-inclusive hourly rate range for a specific role in a specific city.",
    },
    {
      name: "get_compliance_by_state",
      description:
        "Minimum wage, overtime rules, and state-specific event-staffing compliance quirks.",
    },
  ],
  authentication: { required: false },
  documentationUrl: "https://mcp.tempguru.co/",
} as const;

export async function GET() {
  return new Response(JSON.stringify(SERVER_CARD, null, 2), {
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
