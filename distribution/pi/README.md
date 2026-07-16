# tempguru-pi — TempGuru event staffing for the Pi coding agent

One `pi install` gives Pi both layers:

- **8 skills** (Markdown, synced verbatim from the canonical
  `content/skills/*.md` by `gen-skill-digests.mjs`; CI fails if they drift):
  ordering, compliance, event-brief extraction, urgent backfill, agency
  partnering, multi-city activation, procurement, and pro operations.
- **9 native tools** (`extensions/tempguru.ts`) calling TempGuru's hosted REST
  API with `?source=pi` attribution: cities, roles, availability, pricing,
  compliance, policies, saved plans, quote status, and the one opt-in write,
  `tempguru_request_quote`.

This closes the gap the audit flagged: Pi does not gain MCP access from a
Markdown skill alone, and previously the skills assumed tools Pi didn't have.
With this package the skills and the action layer install together — no MCP
bridge required. (The full `plan_staffing` planner remains MCP-only; agents
that also want it can configure the MCP server per `llms-install.md`.)

## Install (users)

```bash
pi install npm:tempguru-pi
```

## Layout

```
package.json          # pi manifest: { skills: ["./skills"], extensions: ["./extensions"] }
extensions/tempguru.ts  # native tools -> https://mcp.tempguru.co/api/v1/* (?source=pi)
skills/<slug>/SKILL.md  # 8 canonical skills, generated — never hand-edit
```

Regenerate the skills after any `content/skills/*.md` change (runs inside
`npm run build:okf`):

```bash
node scripts/gen-skill-digests.mjs
```

## Publish (maintainer)

From the repo root:

```bash
node scripts/gen-skill-digests.mjs      # ensure skills are current
cd distribution/pi
npm publish                              # unscoped, like tempguru-mcp
```

Notes:

- The name is **unscoped `tempguru-pi`** to match `tempguru-mcp` (no npm org
  required). If you later create the `@tempguru` npm org, publish as
  `@tempguru/pi-event-staffing` and deprecate this name in favor of it.
- Keep `version` in lockstep with the repo's `package.json` so a listing's
  version tells you which skill content it carries.
- The `pi-package` keyword is required for Pi gallery discoverability.
- After publishing, verify the promise the README makes:
  `pi install npm:tempguru-pi`, then in Pi run `/skills` (8 TempGuru skills)
  and check the tool list for `tempguru_get_cities` … `tempguru_request_quote`.
- Record the listing in `distribution/assistants/README.md`'s status tracker.

## Safety posture (mirrors the MCP server)

- `tempguru_request_quote` is the only write; its description requires explicit
  user confirmation first, and the server enforces rate limits and payload caps.
- Rates are all-inclusive W-2 bill rates presented as planning estimates, never
  binding quotes; availability responses are guidance, never reservations.
- Compliance data is operational guidance, not legal advice.
