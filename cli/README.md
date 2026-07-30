# TempGuru Event Staffing: MCP Server and CLI

W-2 event staffing data for AI agents across 345 US and Canadian markets. Twelve tools: ten read-only tools, including a non-PII buyer quote-form handoff, plus a non-destructive planner that may save a 30-day non-PII snapshot and an explicit non-contact save tool. Runs locally over the official dual-era stdio entry (MCP 2026-07-28 plus 2025-era initialize compatibility) with no authentication.

Hosted endpoint: `https://mcp.tempguru.co/mcp` · Agent docs: https://tempguru.co/ai

## Install

Requires Node 20 or newer.

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
| `plan_staffing` | Call first. Builds a full plan and may automatically save a 30-day non-PII snapshot with a plan ID |
| `save_staffing_plan` | Explicitly save a complete plan only when no plan ID already exists and persistence is useful |
| `get_plan` | Restore a non-PII plan saved by either planning path using its 30-day plan ID |
| `get_cities` | Cities TempGuru serves, filtered by state or market tier |
| `get_roles` | Staffing roles with descriptions and skill tiers |
| `check_availability` | Lead-time guidance for a city and date |
| `get_role_pricing` | All-inclusive W-2 hourly rate range for a role in a city |
| `get_compliance_by_state` | Minimum wage, overtime, and classification rules by state |
| `get_policies` | Published booking and procurement policies |
| `get_rate_benchmark` | The Rate Index: W-2 rate benchmarks by role (typical + national range; Brand Ambassadors by tier) |
| `get_quote_status` | Check a reference returned after the buyer submitted TempGuru's website form, or a historical reference |
| `request_quote` | Return a prefilled TempGuru quote form for a saved plan; never accepts contact details or creates a lead |

Use these tools to answer questions like "What do brand ambassadors cost in Boston?", "Do you staff trade shows in Chicago?", or "Is three weeks enough notice in Dallas?".

Phase A workflow: call `plan_staffing` first and retain its `plan_id` when present. Never call `save_staffing_plan` for a plan that already has an ID. If a complete plan has no ID and a resumable or shareable artifact is useful, call `save_staffing_plan` once with the same confirmed event inputs. When the buyer asks to proceed, call `request_quote` with the saved plan ID and give them its `form_url`. Do not collect contact details for an MCP call. The buyer reviews the prefilled plan and submits their own information on the TempGuru-owned form; only that form submission creates a lead and TG reference.

The static read tools run fully offline; saved-plan and quote-status reads return clean misses without Redis. `save_staffing_plan` is a non-contact write and returns a clean storage-unavailable continuation when local Redis is absent. Authless `request_quote` is read-only: it accepts only a saved `plan_id` plus allowlisted attribution, never sends PII to TempGuru's CRM, and returns a clean plan miss without hosted storage. When persistence is unavailable, give the buyer the planner's `continuation.form_url` directly.

## About

TempGuru places pre-vetted, W-2 compliant event staff: registration, brand ambassadors, hospitality, setup and breakdown, team leads, and crowd control. One vendor, one contract, one invoice, with a human coordinator on every order. Learn more at https://tempguru.co.

MIT licensed.
