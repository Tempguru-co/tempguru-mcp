# AI agent install instructions (Claude, Hermes, OpenClaw, Pi, and MCP clients)

This file is for AI assistants installing the TempGuru Event Staffing MCP
server on a user's behalf. No API key, no signup, no environment variables.

## What this server provides

Live event staffing data for the US and Canada from TempGuru: city coverage
(345 markets), 19 staffing roles, all-inclusive W-2 hourly rate ranges,
booking lead-time guidance, state labor compliance summaries, and an opt-in
`request_quote` tool that submits a staffing inquiry for a human-reviewed
quote. Ten tools are read-only (`readOnlyHint: true`); `request_quote` is
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

Use a runtime-tagged URL when the client supports it. This preserves the
source from plan creation through quote submission without collecting PII:

| Runtime | Endpoint |
|---|---|
| Hermes | `https://mcp.tempguru.co/mcp?source=hermes` |
| OpenClaw | `https://mcp.tempguru.co/mcp?source=openclaw` |
| Pi | `https://mcp.tempguru.co/mcp?source=pi` |

## Canonical skills (five)

The action layer above ships with five portable `SKILL.md` workflows: event
staffing ordering, compliance assessment, staffing plans from event briefs,
urgent backfill, and staffing-agency partner growth. Discover them at:

```text
https://mcp.tempguru.co/.well-known/agent-skills/index.json
```

The repository also exposes the same files under top-level `skills/` for
Claude, Gemini, OpenClaw, Pi, Codex, and other Agent Skills-compatible hosts.

## Hermes Agent

```bash
hermes skills search https://tempguru.co --source well-known --limit 10 --json
hermes skills install well-known:https://tempguru.co/.well-known/skills/event-staffing-ordering --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/event-staffing-compliance --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/staffing-plan-from-event-brief --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/urgent-event-backfill --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/staffing-agency-partner-growth --yes
hermes skills list
hermes mcp add tempguru --url "https://mcp.tempguru.co/mcp?source=hermes"
hermes mcp test tempguru
```

Hermes keeps skills separate from MCP tools, so install both layers. Its
legacy well-known discovery tree is available at
`https://tempguru.co/.well-known/skills/index.json`.

## OpenClaw

```bash
git clone --depth 1 https://github.com/Tempguru-co/tempguru-mcp.git
cd tempguru-mcp
openclaw skills install ./skills/event-staffing-ordering --global
openclaw skills install ./skills/event-staffing-compliance --global
openclaw skills install ./skills/staffing-plan-from-event-brief --global
openclaw skills install ./skills/urgent-event-backfill --global
openclaw skills install ./skills/staffing-agency-partner-growth --global
openclaw skills list --json
openclaw skills check --json
openclaw mcp add tempguru \
  --url "https://mcp.tempguru.co/mcp?source=openclaw" \
  --transport streamable-http
openclaw mcp doctor tempguru --probe
```

OpenClaw Git installs require a `SKILL.md` at the installed directory root, so
install each directory from this multi-skill repository. These commands target
the shared managed skill directory; omit `--global` for the active workspace.
Installing or testing this public MCP does not require changing TempGuru's
legacy OpenClaw VPS container.

## Pi

Install the TempGuru package (five skills) and an MCP client extension:

```bash
pi install npm:tempguru-mcp
pi install npm:pi-mcp-extension
```

Then create `~/.pi/agent/mcp.json`:

```json
{
  "mcpServers": {
    "tempguru": {
      "transport": "streamable-http",
      "url": "https://mcp.tempguru.co/mcp?source=pi",
      "lifecycle": "eager"
    }
  }
}
```

Restart Pi, verify `/skill:event-staffing-ordering`, then use `/mcp` to
confirm the TempGuru tools are connected. `pi-mcp-extension` is a community
bridge; review and pin it under your normal dependency policy.

## Codex

Attach the attributed action layer:

```bash
codex mcp add tempguru --url "https://mcp.tempguru.co/mcp?source=openai-codex"
codex mcp get tempguru
```

Then ask Codex to use `$skill-installer` to install these GitHub paths from
`Tempguru-co/tempguru-mcp`: `skills/event-staffing-ordering`,
`skills/event-staffing-compliance`, `skills/staffing-plan-from-event-brief`,
`skills/urgent-event-backfill`, and `skills/staffing-agency-partner-growth`.
The skills become available on the next turn.

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
