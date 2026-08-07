# tempguru-pi — TempGuru event staffing for Pi and Prime Agent

This package documents the runtime-adapted skill and native-tool behavior
included in version `1.7.0`. Publication status is tracked in the repository,
not inside this immutable npm artifact.

One package gives either Pi or Prime Agent both layers:

- **8 skills** (Markdown, generated from canonical `content/skills/*.md` by
  `gen-skill-digests.mjs` with a Pi runtime-routing preamble and native tool-name
  substitutions; CI fails if either layer drifts):
  ordering, compliance, event-brief extraction, urgent backfill, agency
  partnering, multi-city activation, procurement, and pro operations.
- **9 native read-only tools** (`extensions/tempguru.ts`) calling TempGuru's
  hosted REST API with runtime-aware attribution (`?source=pi` in Pi and
  `?source=prime-agent` in Prime Agent): cities, roles, availability, pricing,
  compliance, policies, saved plans, quote status, and
  `tempguru_request_quote`. The quote tool accepts only a saved plan ID and
  returns a TempGuru form the buyer submits personally; it never accepts PII or
  creates a CRM lead.

This closes most of the gap the audit flagged: neither runtime gains API access
from a Markdown skill alone, so the package installs an attributed native
action layer with the skills. No MCP bridge is required for the 9 granular
operations.
The full `plan_staffing` planner, explicit `save_staffing_plan` artifact write,
and `get_rate_benchmark` remain MCP-only in version 1.7.0. Pi can attach the
remote MCP through a compatible client; Prime Agent has the authless-MCP
limitation described below. See `llms-install.md` until native REST parity
ships in a follow-up release.

The generated runtime copies perform this mapping inside every installed skill, so
the model sees it at runtime (the README is not relied on as hidden context):

| Canonical name | Installed native name |
|---|---|
| `get_cities` | `tempguru_get_cities` |
| `get_roles` | `tempguru_get_roles` |
| `check_availability` | `tempguru_check_availability` |
| `get_role_pricing` | `tempguru_get_role_pricing` |
| `get_compliance_by_state` | `tempguru_get_compliance` |
| `get_policies` | `tempguru_get_policies` |
| `get_plan` | `tempguru_get_plan` |
| `get_quote_status` | `tempguru_quote_status` |
| `request_quote` | `tempguru_request_quote` |

There is no native mapping yet for `plan_staffing`, `save_staffing_plan`, or
`get_rate_benchmark`. Every generated package skill therefore contains the same
explicit fallback: use the remote MCP when attached; otherwise compose a
transparent straight-time plan from the granular native tools, never invent a
saved `plan_id`, and use city pricing or the public OKF Rate Index instead of
inventing planner/benchmark output.

Pi can use a separately attached trusted MCP client for those three operations.
Prime Agent v0.7.0's stock Python MCP integration currently requires OAuth or
a bearer token, so it cannot attach TempGuru's authless server as-is. Do not add
an ineffective `mcpServers` entry in Prime; those three operations remain
unavailable there until the native adapter gains parity or Prime supports
authless MCP.

## Install (users)

```bash
pi install npm:tempguru-pi
prime-agent package install npm:tempguru-pi
prime-agent package list
```

There is no separate Prime Agent marketplace or TempGuru Prime package. Prime
intentionally consumes the same `pi.skills` and `pi.extensions` manifest.

## Layout

```
package.json            # shared pi manifest: skills + extensions
extensions/tempguru.ts  # native tools -> /api/v1/* with Pi/Prime attribution
skills/<slug>/SKILL.md  # 8 runtime-adapted canonical skills, generated — never hand-edit
```

Regenerate the skills after any `content/skills/*.md` change (runs inside
`npm run build:okf`):

```bash
node scripts/gen-skill-digests.mjs
```

## Publish (maintainer)

The canonical publisher is the manual
`.github/workflows/publish-pi.yml` GitHub Action. It validates the requested
version, package identity, generated skill digests, and tarball contents before
publishing with npm Trusted Publishing (OIDC). From the repository:

```bash
gh workflow run publish-pi.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main \
  -f version=1.7.0
```

Notes:

- Before the first OIDC release, configure the existing `tempguru-pi` package's
  npm Trusted Publisher with this exact identity: organization
  `Tempguru-co`, repository `tempguru-mcp`, workflow filename
  `publish-pi.yml`, environment `Production`, allowed action `npm publish`.
  The workflow must be run from `main`.
- Do not run `npm publish` locally. The GitHub workflow is the release path and
  requires no long-lived npm token.
- The name is **unscoped `tempguru-pi`** to match `tempguru-mcp` (no npm org
  required). If you later create the `@tempguru` npm org, publish as
  `@tempguru/pi-event-staffing` and deprecate this name in favor of it.
- Pi package patch versions may move independently from the MCP CLI when the
  native adapter changes. Always bump to an unpublished version before release,
  and record the published Pi version in `distribution/assistants/README.md`.
- The `pi-package` keyword is required for Pi discovery and Prime package
  compatibility; `prime-agent` and `agent-skills` make that support explicit.
- Pi and Prime Agent both provide the core `typebox` runtime; keep it as a
  `"*"` peer dependency rather than bundling a second copy.
- After publishing, verify the promise the README makes in both runtimes. Run
  `pi install npm:tempguru-pi`, then in Pi run `/skills`. Also run
  `prime-agent package install npm:tempguru-pi` and
  `prime-agent package list`. Each runtime must expose 8 TempGuru skills and
  the 9 tools `tempguru_get_cities` … `tempguru_request_quote`.
- Confirm npm independently before calling the release live:
  `npm view tempguru-pi@1.7.0 version`.
- Record the listing in `distribution/assistants/README.md`'s status tracker.

## Safety posture (mirrors the MCP server)

- `tempguru_request_quote` is read-only. It requires a saved `plan_id`, returns
  a prefilled `https://mcp.tempguru.co/request-quote` URL, and never accepts or
  transmits contact details. The buyer must review and submit the form
  personally; only the REST form submission creates a lead or TG reference.
- Rates are all-inclusive W-2 bill rates presented as planning estimates, never
  binding quotes; availability responses are guidance, never reservations.
- Compliance data is operational guidance, not legal advice.
