// GET /.well-known/mcp/server-card.json
//
// MCP Server Card per SEP-1649 (schema in standardization at
// modelcontextprotocol PR #2127). Several public MCP directories and
// agent platforms link to this URL for at-a-glance server metadata
// before they hit /mcp itself. Update if the final SEP-1649 schema diverges.
//
// served with application/json + 1-hour public cache.

import pkg from "../../../../../package.json";
import { MARKET_CATALOG_DESCRIPTION } from "@/lib/public-facts";

const SERVER_CARD = {
  $comment:
    "MCP Server Card per SEP-1649 (schema in standardization at modelcontextprotocol PR #2127). Update if the final schema diverges.",
  description:
    "Public TempGuru MCP server for repository-backed event staffing planning, configured-market matching, pricing, lead-time guidance, compliance, policy, and buyer-operated handoff tools. " +
    MARKET_CATALOG_DESCRIPTION,
  serverInfo: {
    // Matches serverInfo.name from the live initialize + the npm package id
    // (check:submissions gates this against mcp.json and the runtime).
    name: "tempguru-mcp",
    title: "TempGuru Event Staffing",
    version: pkg.version,
    description:
      "Dual-era Model Context Protocol server for TempGuru's repository-backed event staffing catalog. Twelve tools: ten read-only tools including a non-PII request_quote buyer handoff, the non-destructive plan_staffing planner, and an explicit non-destructive save_staffing_plan write. Also ships 8 skill resources and two guided prompts. " +
      MARKET_CATALOG_DESCRIPTION,
    websiteUrl: "https://tempguru.co",
  },
  transport: {
    type: "streamable-http",
    url: "https://mcp.tempguru.co/mcp",
  },
  // Preferred modern revision. The same endpoint also accepts the listed
  // initialize-based 2025-era revisions through its stateless fallback.
  // Keep in sync with /.well-known/mcp.json (check:submissions gates this).
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
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
  workflow: {
    phase: "A",
    instructions: [
      "Call plan_staffing first with the event city, date, roles, and headcount.",
      "If a complete plan already includes plan_id, retain it and do not call save_staffing_plan; the planner already saved the non-PII snapshot.",
      "Call save_staffing_plan only for a complete plan that has no plan_id and needs a durable 30-day artifact; the server recomputes rates and totals from bounded event inputs before saving.",
      "When the buyer asks to proceed, call request_quote with the saved plan_id and give them its form_url; the buyer enters and submits their own contact details.",
    ],
  },
  tools: [
    {
      name: "plan_staffing",
      description:
        "Planner meta-tool, call first. Turns an event shape into a complete plan and may save a 30-day non-PII snapshot for plan_id continuation. Non-destructive, but not read-only.",
    },
    {
      name: "save_staffing_plan",
      description:
        "Explicitly save a complete plan as a 30-day non-PII artifact after the server recomputes rates and totals from bounded event inputs. Use only when the plan has no plan_id; never duplicate a plan_staffing autosave.",
    },
    {
      name: "get_plan",
      description:
        "Restore a complete non-PII staffing plan saved within the last 30 days.",
    },
    {
      name: "get_cities",
      description:
        "List configured market entries or match one city. Catalog membership is not confirmed order coverage or live inventory.",
    },
    {
      name: "get_roles",
      description:
        "List all event staffing roles with descriptions and skill tiers.",
    },
    {
      name: "check_availability",
      description:
        "Tier-based lead-time guidance for a configured city/date, optionally with role and headcount; not an inventory or order-coverage check.",
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
      name: "get_policies",
      description:
        "Published booking and procurement policies, with unsupported values explicitly deferred to a coordinator.",
    },
    {
      name: "get_rate_benchmark",
      description:
        "The TempGuru Event Staffing Rate Index: full benchmark table of all-inclusive W-2 hourly rates by role (typical + national range; Brand Ambassadors by tier), with methodology and citation line.",
    },
    {
      name: "get_quote_status",
      description:
        "Check a TG reference returned after a buyer-submitted website form, including historical references.",
    },
    {
      name: "request_quote",
      description:
        "Restore a saved non-PII plan and return a prefilled TempGuru buyer form. Read-only: never accepts contact data or creates a lead; the buyer personally submits the form.",
    },
  ],
  authentication: { required: false },
  documentationUrl: "https://tempguru.co/ai-agents",
  relatedResources: {
    a2aEndpoint: "https://mcp.tempguru.co/a2a",
    agentCard: "https://mcp.tempguru.co/.well-known/agent-card.json",
    authenticationGuide: "https://mcp.tempguru.co/auth.md",
    publicFacts: "https://mcp.tempguru.co/.well-known/tempguru-facts.json",
  },
  // Knowledge layer: the same data the tools serve, published as a static
  // Open Knowledge Format (OKF v0.1) bundle that agents can read or ingest
  // directly. The tools above are the action layer (how to plan, price, and
  // submit); this is the knowledge layer (what the roles, rates, and rules mean).
  knowledge: {
    format: "OKF",
    okfVersion: "0.1",
    description:
      "Canonical Open Knowledge Format bundle: staffing roles, all-inclusive W-2 rate card, the Rate Index benchmark, configured-market catalog, state compliance, and quote workflows. " +
      MARKET_CATALOG_DESCRIPTION,
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
