// GET /.well-known/mcp/server-card.json
//
// MCP Server Card per SEP-1649 (schema in standardization at
// modelcontextprotocol PR #2127). Several public MCP directories and
// agent platforms link to this URL for at-a-glance server metadata
// before they hit /mcp itself. Update if the final SEP-1649 schema diverges.
//
// Kept hand-synced with the same file at:
//   github.com/tempguru-co/tempguru-agent-skills/blob/main/mcp/server-card.json
//
// served with application/json + 1-hour public cache.

import pkg from "../../../../../package.json";

const SERVER_CARD = {
  $comment:
    "MCP Server Card per SEP-1649 (schema in standardization at modelcontextprotocol PR #2127). Update if the final schema diverges.",
  serverInfo: {
    // Matches serverInfo.name from the live initialize + the npm package id
    // (check:submissions gates this against mcp.json and the runtime).
    name: "tempguru-mcp",
    title: "TempGuru Event Staffing",
    version: pkg.version,
    description:
      "Model Context Protocol server for TempGuru event staffing data: city coverage (345 US/Canada markets), staffing roles, lead-time guidance, all-inclusive W-2 rate ranges, and state-by-state compliance rules. Includes a plan_staffing planner tool, a get_rate_benchmark Rate Index tool, a request_quote write tool that submits structured staffing requests to TempGuru's pipeline, two skill resources, and guided prompt templates. For ChatGPT users without MCP, the TempGuru Event Staffing Planner GPT covers the same workflow: https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner",
    websiteUrl: "https://tempguru.co",
  },
  transport: {
    type: "streamable-http",
    url: "https://mcp.tempguru.co/mcp",
  },
  // Matches the version the live server actually negotiates on initialize.
  // Keep in sync with /.well-known/mcp.json (check:submissions gates this).
  protocolVersion: "2025-06-18",
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
  tools: [
    {
      name: "plan_staffing",
      description:
        "Planner meta-tool, call first. Turns an event shape (city, date, roles + headcount) into a complete plan: coverage, per-role W-2 rate math, lead-time guidance, and state compliance flags.",
    },
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
    {
      name: "get_rate_benchmark",
      description:
        "The TempGuru Event Staffing Rate Index: full benchmark table of all-inclusive W-2 hourly rates by role (typical + national range; Brand Ambassadors by tier), with methodology and citation line.",
    },
    {
      name: "request_quote",
      description:
        "Submit a structured staffing request to TempGuru's pipeline. A coordinator reviews and responds with a quote within one business day. Not a reservation; does not guarantee pricing or availability.",
    },
  ],
  authentication: { required: false },
  documentationUrl: "https://mcp.tempguru.co/",
  // Knowledge layer: the same data the tools serve, published as a static
  // Open Knowledge Format (OKF v0.1) bundle that agents can read or ingest
  // directly. The tools above are the action layer (how to plan, price, and
  // submit); this is the knowledge layer (what the roles, rates, and rules mean).
  knowledge: {
    format: "OKF",
    okfVersion: "0.1",
    description:
      "Canonical Open Knowledge Format bundle: staffing roles, all-inclusive W-2 rate card, the Rate Index benchmark, 345-market coverage, state compliance, and quote workflows.",
    bundle: "https://mcp.tempguru.co/okf/index.md",
    tarball: "https://mcp.tempguru.co/okf.tar.gz",
    discovery: "https://mcp.tempguru.co/.well-known/okf.json",
  },
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
