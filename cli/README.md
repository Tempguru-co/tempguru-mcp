# TempGuru Event Staffing: MCP Server and CLI

W-2 event staffing data for AI agents across 345 US and Canadian markets. A call-first planner, six read-only lookups (coverage, rates, availability, compliance, the Rate Index benchmark) plus an opt-in quote request. Runs locally over stdio, no authentication for the read tools.

Hosted endpoint: `https://mcp.tempguru.co/mcp` · Agent docs: https://tempguru.co/ai

## Install

```bash
npx -y tempguru-mcp
```

## Use it in your MCP client

Works with Claude Desktop, Cursor, Windsurf, Claude Code, and other stdio MCP clients:

```json
{
  "mcpServers": {
    "tempguru-event-staffing": {
      "command": "npx",
      "args": ["-y", "tempguru-mcp"]
    }
  }
}
```

## Tools

| Tool | Use it for |
|---|---|
| `plan_staffing` | Call first. Turns an event shape into a full plan: coverage, per-role W-2 rate math, lead time, and state compliance flags |
| `get_cities` | Cities TempGuru serves, filtered by state or market tier |
| `get_roles` | Staffing roles with descriptions and skill tiers |
| `check_availability` | Lead-time guidance for a city and date |
| `get_role_pricing` | All-inclusive W-2 hourly rate range for a role in a city |
| `get_compliance_by_state` | Minimum wage, overtime, and classification rules by state |
| `get_rate_benchmark` | The Rate Index: W-2 rate benchmarks by role (typical + national range; Brand Ambassadors by tier) |
| `request_quote` | Submit a staffing request to TempGuru |

Use these tools to answer questions like "What do brand ambassadors cost in Boston?", "Do you staff trade shows in Chicago?", or "Is three weeks enough notice in Dallas?".

The seven read tools run fully offline from bundled data. `request_quote` is included, but lead submission to TempGuru's CRM happens server-side. In a local npm install, without TempGuru's CRM credentials, `request_quote` falls back to returning contact details so the user can reach a coordinator directly. The hosted endpoint at `https://mcp.tempguru.co/mcp` remains the primary lead-capture path and submits quotes live.

## About

TempGuru places pre-vetted, W-2 compliant event staff: registration, brand ambassadors, hospitality, setup and breakdown, team leads, and crowd control. One vendor, one contract, one invoice, with a human coordinator on every order. Learn more at https://tempguru.co.

MIT licensed.
