# AI agent install instructions (Claude, Hermes, OpenClaw, Pi, Prime Agent, and MCP clients)

This file is for AI assistants installing the TempGuru Event Staffing MCP
server on a user's behalf. No API key, no signup, no environment variables.

## What this server provides

Live event staffing data for the US and Canada from TempGuru: city coverage
(345 markets), 19 staffing roles, all-inclusive W-2 hourly rate ranges,
booking lead-time guidance, state labor compliance summaries, and an opt-in
`request_quote` tool that prepares a prefilled TempGuru form for the buyer to
review and submit personally. The server exposes 12 tools. Ten tools are
read-only, including `request_quote`.
`plan_staffing` and `save_staffing_plan` are non-destructive, non-contact
writes that use `readOnlyHint: false`: the planner may automatically save a
complete non-PII snapshot for 30 days, while the explicit save recomputes the
plan before persistence. The overall connector capability is therefore
`read_write`. Authless `request_quote` accepts only a saved `plan_id` plus
allowlisted source attribution. It never accepts contact details, creates a
CRM lead, or returns a TG reference.

Phase A workflow: call `plan_staffing` first. If its complete result contains a
`plan_id`, retain it and do not call `save_staffing_plan`. Only when a complete
plan has no ID and a resumable or shareable artifact is useful should the agent
call `save_staffing_plan` once with the same confirmed event inputs. Pass the
existing `plan_id` to `request_quote` when the buyer asks to proceed, then give
the buyer its `form_url`. Do not collect contact details for an MCP call. The
buyer opens the TempGuru-owned form, reviews the prefilled plan, enters their
own contact details, and submits it; only that submission creates a lead and TG
reference. If storage is unavailable, give the buyer the
`continuation.form_url` returned by `plan_staffing` directly.

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

Transport uses the official dual-era HTTP entry: preferred MCP 2026-07-28
per-request envelopes plus stateless initialize/Streamable HTTP compatibility
for supported 2025-era clients. Responses use JSON or SSE as required. No auth
headers.

Use a runtime-tagged URL when the client supports it. This preserves the
source from plan creation through quote submission without collecting PII:

| Runtime | Endpoint |
|---|---|
| Hermes | `https://mcp.tempguru.co/mcp?source=hermes` |
| OpenClaw | `https://mcp.tempguru.co/mcp?source=openclaw` |
| Pi | `https://mcp.tempguru.co/mcp?source=pi` |
| Prime Agent adapter attribution | `https://mcp.tempguru.co/mcp?source=prime-agent` |

The Prime row defines its canonical attribution tag. Install the native
package described below instead of putting this authless URL in Prime's
`mcpServers`: Prime Agent v0.7.0's stock Python MCP integration requires OAuth
or a bearer token.

## Canonical skills (8)

The action layer above ships with 8 portable `SKILL.md` workflows: event
staffing ordering, compliance assessment, staffing plans from event briefs,
urgent backfill, staffing-agency partner growth, multi-city activation planning,
event-staffing procurement, and TempGuru Pro operations. Discover them at:

```text
https://mcp.tempguru.co/.well-known/agent-skills/index.json
```

The repository also exposes the same files under top-level `skills/` for
Claude, Gemini, OpenClaw, Pi, Prime Agent, Codex, and other Agent
Skills-compatible hosts.

## Hermes Agent

```bash
hermes skills search https://tempguru.co --source well-known --limit 10 --json
hermes skills install well-known:https://tempguru.co/.well-known/skills/event-staffing-ordering --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/event-staffing-compliance --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/staffing-plan-from-event-brief --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/urgent-event-backfill --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/staffing-agency-partner-growth --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/multi-city-activation-planner --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/event-staffing-procurement --yes
hermes skills install well-known:https://tempguru.co/.well-known/skills/tempguru-pro-operations --yes
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
openclaw skills install ./skills/multi-city-activation-planner --global
openclaw skills install ./skills/event-staffing-procurement --global
openclaw skills install ./skills/tempguru-pro-operations --global
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

The repository's `tempguru-pi` 1.7.0 source contains 8 skills plus 9 native
read-only tools with `?source=pi` attribution. The native
`tempguru_request_quote` tool accepts a saved plan ID and returns the
buyer-operated form; it does not transmit contact details. Check npm and the
repository release tracker for publication status. Attach the remote MCP for
the full planner, saved-plan write, and Rate Index:

```bash
pi install npm:tempguru-pi
```

Restart Pi, verify `/skill:event-staffing-ordering`, and confirm the tool list
contains `tempguru_get_cities` through `tempguru_request_quote`. No community
MCP bridge is required for those native tools. The full `plan_staffing`
planner, conditional `save_staffing_plan`, and `get_rate_benchmark` Rate Index
remain MCP-only in the current native package; when a Pi deployment also has a
trusted MCP client, attach `https://mcp.tempguru.co/mcp?source=pi` for those
capabilities.

## Prime Agent

Prime Agent implements the same Agent Skills and Pi-package manifest contract,
so install the existing package; there is no second TempGuru package or
Prime-specific marketplace submission:

```bash
prime-agent package install npm:tempguru-pi
prime-agent package list
```

Runtime-specific `source=prime-agent` attribution begins in `tempguru-pi`
1.7.0. Until npm reports that version as published, an unpinned install still
resolves to 1.6.0: its tools work in Prime, but its calls are labeled `pi`.

Restart Prime Agent and verify that all 8 TempGuru skills and the 9 native
tools from `tempguru_get_cities` through `tempguru_request_quote` load. The
shared extension detects Prime Agent and applies `source=prime-agent` to its
REST calls and buyer-form handoff; Pi continues to use `source=pi`.

Prime Agent v0.7.0's standard `McpIntegration` requires OAuth or a bearer token,
so merely adding TempGuru's authless MCP URL to `.prime/agent/settings.json`
does not expose MCP tools. Do not configure that unsupported bridge. The
package's native tools work without authentication, while `plan_staffing`,
`save_staffing_plan`, and `get_rate_benchmark` remain unavailable in Prime
until they are added to the native extension or Prime supports authless MCP.

The `skills` CLI v1.5.22 has no direct `prime-agent` target. Its universal
target can place an individual public skill in Prime's shared `.agents/skills`
directory, but this is a skill-content-only fallback and does **not** install
TempGuru's native tools:

```bash
npx skills@1.5.22 add Tempguru-co/tempguru-mcp \
  --skill event-staffing-ordering \
  --agent universal \
  --copy -y
```

Use the npm package above for the working action layer. skills.sh has no manual
publisher submission command; successful public-GitHub installs provide its
indexing signal, without a published indexing-time guarantee.

## Codex

Attach the attributed action layer:

```bash
codex mcp add tempguru --url "https://mcp.tempguru.co/mcp?source=openai-codex"
codex mcp get tempguru
```

Then ask Codex to use `$skill-installer` to install these GitHub paths from
`Tempguru-co/tempguru-mcp`: `skills/event-staffing-ordering`,
`skills/event-staffing-compliance`, `skills/staffing-plan-from-event-brief`,
`skills/urgent-event-backfill`, `skills/staffing-agency-partner-growth`,
`skills/multi-city-activation-planner`, `skills/event-staffing-procurement`,
and `skills/tempguru-pro-operations`.
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

Requires Node 20+. The package is self-contained (no runtime deps) and uses the
official dual-era stdio entry for MCP 2026-07-28 plus 2025-era initialize
clients. Lookup tools work offline from bundled data, `save_staffing_plan`
returns a clean storage-unavailable continuation without hosted persistence,
and `request_quote` returns a clean saved-plan miss when hosted persistence is
unavailable. Use the planner's `continuation.form_url` for the buyer in that
case; never collect or send contact details through MCP.

## Verify the install

Confirm `tools/list` exposes all 12 tools, including `save_staffing_plan` and
the read-only `request_quote` form handoff.
Call the `get_roles` tool. Expect a JSON catalog of 19 roles (brand
ambassadors, registration staff, ushers, etc.). Then try
`get_role_pricing` with `role: "brand-ambassadors", city: "Boston"`, expect an hourly range of $56–65 (hub market).

## Troubleshooting

- **404 / connection refused:** confirm the URL is exactly
  `https://mcp.tempguru.co/mcp` (no trailing slash).
- **Client rejects JSON or SSE responses:** use a current MCP client that
  supports the dual-era HTTP endpoint and advertises both
  `application/json` and `text/event-stream`, or use Option B.
- Docs: https://tempguru.co/ai · Maintainer: megan@tempguru.co
