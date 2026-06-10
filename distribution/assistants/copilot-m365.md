# Microsoft 365 Copilot: declarative agent + Agent Store

Microsoft's GPT equivalent. A **declarative agent** (instructions +
conversation starters + API actions, no custom code) ships as an app package
and appears in the Agent Store inside Microsoft 365 Copilot, Teams, Outlook,
Word, Excel, and PowerPoint. This is the channel for the audience that books
the most event staff: corporate event planners, marketing ops, and admins
living in Outlook/Teams.

Generated manifests (do not hand-edit; regenerate with
`node distribution/assistants/build-manifests.mjs` whenever
[system-prompt.md](./system-prompt.md) changes):

- `microsoft/declarativeAgent.json` — agent definition, canonical
  instructions embedded (5.5k chars, limit 8k)
- `microsoft/ai-plugin.json` — API plugin pointing at
  `https://mcp.tempguru.co/openapi.json`: the five read-only operations
  plus `submitQuoteRequest` (the one write operation, opt-in)

Note: declarative agents also support MCP servers directly now (Microsoft
365 dev blog, 2026). The OpenAPI plugin path here is the conservative,
fully-GA route; switch the action to the MCP server later if the MCP path
exits preview — one less spec to keep aligned.

---

## Package assembly (what's still needed beyond the two manifests)

A Copilot app package is a zip containing:

1. `manifest.json` — Teams app manifest v1.19+ referencing
   `declarativeAgent.json` under `copilotAgents.declarativeAgents`. Generate
   the scaffold with the Microsoft 365 Agents Toolkit (VS Code extension,
   "Declarative Agent" template), then drop in the two generated files.
2. `declarativeAgent.json` ✅ generated
3. `ai-plugin.json` ✅ generated
4. `color.png` (192x192) and `outline.png` (32x32) icons — export from
   `public/logo.svg`.

Developer/publisher identity: a Microsoft Partner Center account for
Temporary Assistance Guru, Inc. (one-time setup, this is the slow part —
start it early; verification can take days).

## Two publishing routes

| Route | Audience | Effort |
|---|---|---|
| **Microsoft Commercial Marketplace / AppSource** (Partner Center submission, Microsoft validation) | Every M365 Copilot tenant whose admin enables it — the public route | Days of paperwork, then review |
| **Sideload / org catalog** | Only your own tenant | Minutes — use this to test |

Sequence: sideload and test with the Agents Toolkit first, then submit to
Partner Center. Validation includes Responsible AI checks against the
instructions; the canonical prompt's honesty rules (no fabricated rates, not
legal advice, no availability promises) are exactly what those checks want
to see.

## Test script (sideloaded, in Copilot chat)

Same six cases as the ChatGPT package
([chatgpt-custom-gpt.md](./chatgpt-custom-gpt.md) pre-publish script —
including the `submitQuoteRequest` confirm-then-submit case), plus:

7. "Format this staffing plan for an email to my VP" → renders the plan as a
   paste-ready table (Copilot-specific instruction suffix covers this).

## Reality check

This is the highest-friction channel in the kit (Partner Center, validation,
tenant-admin gating) and the slowest to show volume. It is also the only
channel that puts TempGuru inside the software where corporate event budgets
get approved. File it as a background track: start Partner Center
verification now, submit when the ChatGPT + Gemini + Coze fast lanes are
live.
