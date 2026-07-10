# AI agent install instructions (Cline, Claude, Cursor, any MCP client)

This file is for AI assistants installing the TempGuru Event Staffing MCP
server on a user's behalf. No API key, no signup, no environment variables.

## What this server provides

Live event staffing data for the US and Canada from TempGuru: city coverage
(345 markets), 19 staffing roles, all-inclusive W-2 hourly rate ranges,
booking lead-time guidance, state labor compliance summaries, and an opt-in
`request_quote` tool that submits a staffing inquiry for a human-reviewed
quote. Seven tools are read-only (`readOnlyHint: true`); `request_quote` is
the single write tool (`destructiveHint: false`) and should only be called
after the user explicitly confirms the plan.

## Option A, remote server (preferred, zero install)

Add to the client's MCP settings (for Cline: `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "tempguru-event-staffing": {
      "url": "https://mcp.tempguru.co/mcp",
      "type": "streamableHttp"
    }
  }
}
```

Transport is MCP Streamable HTTP (negotiates protocol 2025-06-18). No auth headers.

## Option B, local stdio via npm

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

Requires Node 18+. The package is self-contained (no runtime deps); lookup
tools work offline from bundled data, and `request_quote` degrades to
returning TempGuru's contact info when run locally.

## Verify the install

Call the `get_roles` tool. Expect a JSON catalog of 19 roles (brand
ambassadors, registration staff, ushers, etc.). Then try
`get_role_pricing` with `role: "brand-ambassadors", city: "Boston"`, expect an hourly range of $56–65 (hub market).

## Troubleshooting

- **404 / connection refused:** confirm the URL is exactly
  `https://mcp.tempguru.co/mcp` (no trailing slash).
- **Client requires SSE:** SSE is not supported (removed in spec rev
  2025-03-26); use a client version with Streamable HTTP support, or
  Option B.
- Docs: https://tempguru.co/ai · Maintainer: megan@tempguru.co
