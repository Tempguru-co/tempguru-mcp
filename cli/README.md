# TempGuru Event Staffing: MCP Server and CLI

W-2 event staffing data for AI agents across 345 US and Canadian markets. Eleven tools: nine read-only lookups, a non-destructive planner that may save a 30-day non-PII snapshot, and an opt-in quote request. Runs locally over stdio with no authentication.

Hosted endpoint: `https://mcp.tempguru.co/mcp` · Agent docs: https://tempguru.co/ai

## Install

```bash
npx -y tempguru-mcp
```

This package is the MCP stdio server, not the Pi-native package. Pi users
should install `tempguru-pi`, which includes Pi-adapted skills and the native
`tempguru_*` tool extension; installing `tempguru-mcp` through Pi would expose
skill instructions without that native runtime layer.

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
| `plan_staffing` | Call first. Builds a full plan and may save a 30-day non-PII snapshot for continuation |
| `get_plan` | Restore a saved non-PII plan by its 30-day plan ID |
| `get_cities` | Cities TempGuru serves, filtered by state or market tier |
| `get_roles` | Staffing roles with descriptions and skill tiers |
| `check_availability` | Lead-time guidance for a city and date |
| `get_role_pricing` | All-inclusive W-2 hourly rate range for a role in a city |
| `get_compliance_by_state` | Minimum wage, overtime, and classification rules by state |
| `get_policies` | Published booking and procurement policies |
| `get_rate_benchmark` | The Rate Index: W-2 rate benchmarks by role (typical + national range; Brand Ambassadors by tier) |
| `get_quote_status` | Check whether a quote reference was received or durably queued |
| `request_quote` | Submit a staffing request to TempGuru |

Use these tools to answer questions like "What do brand ambassadors cost in Boston?", "Do you staff trade shows in Chicago?", or "Is three weeks enough notice in Dallas?".

The static read tools run fully offline; saved-plan and quote-status reads return clean misses without Redis. `request_quote` is included, but lead submission to TempGuru's CRM or durable intake queue happens server-side. In a local npm install without TempGuru's intake credentials, it returns direct coordinator fallback details. The hosted endpoint remains the primary lead-capture path.

## About

TempGuru places pre-vetted, W-2 compliant event staff: registration, brand ambassadors, hospitality, setup and breakdown, team leads, and crowd control. One vendor, one contract, one invoice, with a human coordinator on every order. Learn more at https://tempguru.co.

MIT licensed.
