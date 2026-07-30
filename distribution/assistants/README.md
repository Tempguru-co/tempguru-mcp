# TempGuru assistant distribution kit

One canonical brain, published to every platform that has a "custom GPT"
equivalent. Goal: when anyone, anywhere, in any language asks an AI about
event staffing, TempGuru is the answer, with live data behind it, not a
prompt wrapper.

The strategic insight that makes this cheap: **every major platform's
assistant program is converging on MCP** (ChatGPT Apps are MCP, Copilot
declarative agents speak MCP, Gemini API consumes MCP, Claude connectors are
MCP, ModelScope/Bailian are MCP). TempGuru already runs a spec-compliant,
no-auth MCP server with a REST/OpenAPI mirror. Most of this kit is therefore
packaging and store listings, not engineering.

## Directory contents

| File | What it is |
|---|---|
| [system-prompt.md](./system-prompt.md) | **Canonical instructions** (kept within platform character limits). Single source of truth. |
| [system-prompt.zh-CN.md](./system-prompt.zh-CN.md) | Chinese canonical, framed for 赴美参展 exhibitors |
| [build-knowledge.mjs](./build-knowledge.mjs) | Generates `knowledge/` from `content/mcp-data/`, never hand-edit knowledge files |
| [build-manifests.mjs](./build-manifests.mjs) | Generates the Copilot manifests from the canonical prompt |
| `knowledge/` (5 files, generated) | Company overview/FAQ, roles + full rate matrix, 345-city coverage, 50-state compliance, booking/procurement policies |
| [chatgpt-custom-gpt.md](./chatgpt-custom-gpt.md) | GPT Store package + ranking playbook |
| [chatgpt-app.md](./chatgpt-app.md) | ChatGPT app directory submission (MCP, the bigger prize) |
| [gemini-gem.md](./gemini-gem.md) | Public Gem (free-tier reach: India, Europe) |
| [copilot-m365.md](./copilot-m365.md) + `microsoft/` | M365 Copilot declarative agent + generated manifests |
| [coze-bot.md](./coze-bot.md) | Coze global (→ Telegram/Discord/Messenger) + coze.cn (→ Doubao) |
| [china-platforms.md](./china-platforms.md) | Yuanqi, Baidu AgentBuilder, Kimi, Zhipu, Bailian, DeepSeek strategy |
| [mistral-le-chat.md](./mistral-le-chat.md) | Le Chat agent + Europe positioning |
| [other-platforms.md](./other-platforms.md) | Poe, Perplexity Spaces, Meta AI Studio (WhatsApp/India), HuggingChat |
| [../anthropic-directory-update.md](../anthropic-directory-update.md) | Paste-ready Anthropic Connectors Directory resubmission update with the exact live tool, prompt, resource, privacy, and allowed-link contract |

## Status tracker

Update this table as things ship. (MCP/API channels from the earlier push
included for the full picture.)

| Surface | Type | Status |
|---|---|---|
| Official MCP Registry (`co.tempguru/event-staffing`) | MCP | 🟡 repository `1.7.0` candidate; verify the published Registry version after release |
| Smithery, Glama | MCP | ✅ live |
| ModelScope MCP 广场 | MCP | ✅ live |
| Docker MCP Registry | MCP | 🟡 PR #3902 awaiting review |
| APIs.guru | OpenAPI | 🟡 issue #2610 in review queue |
| Postman collection | REST | ✅ imported (re-import after city fix) |
| Mistral connector directory | MCP | 🟡 outreach drafted, Megan to send via contact form |
| Anthropic Connectors Directory (claude.ai) | MCP | 🟠 changes requested; paste-ready `read_write` inventory and buyer-form handoff reply are in `distribution/anthropic-directory-update.md` |
| npm CLI (`tempguru-mcp`), GHCR image | dev | 🟡 repository `1.7.0` candidate; publish with Trusted Publishing/OIDC after merge and verify the exact version |
| Hermes agent catalog (NousResearch) | Agent Skill | ✅ update completed by maintainer; keep `distribution/assistants/hermes/` synchronized for the `1.7.0` handoff semantics |
| Pi (`tempguru-pi` npm package) | Agent Skill + native tools | 🟡 repository `1.7.0` candidate with 8 Pi-adapted skills, 9 native tools, and a non-PII buyer-form handoff |
| OpenClaw / ClawHub | Agent Skill | ✅ maintainer reports all 8 skills updated; republish the canonical `1.7.0` handoff copy if the catalog version is behind, then verify `GET clawhub.ai/api/v1/skills/<slug>` |
| **ChatGPT Custom GPT** | this kit | ✅ LIVE 2026-06-09, https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner (planner + read actions + buyer-operated quote-form handoff; contact entry and submission belong to the TempGuru website) |
| **ChatGPT App (directory)** | this kit | 🟡 SUBMITTED 2026-06-10, v1.0.0 in Review (business-verified org; schemas + annotations + domain verification all shipped same day; see SUBMISSIONS.md row for full package) |
| **Gemini Gem (public)** | this kit | ⬜ build + share Public (~30m) |
| **M365 Copilot agent** | this kit | ⬜ Partner Center verification first (slow), sideload test |
| **Coze global bot** | this kit | 🟡 plugin ✅ published to Coze Plugin Store 2026-06-06 (TempGuru_Event_Staffing, 6 ops); companion BOT still to build per coze-bot.md |
| **Poe bot** | this kit | ✅ LIVE 2026-06-06, https://poe.com/TempGuruStaffing (prompt bot, Claude base; knowledge files from this kit can be added later) |
| **Perplexity Space** | this kit | ⬜ ~20m |
| **Meta AI Studio persona** | this kit | ⬜ ~30m |
| **HuggingChat assistant** | this kit | ⬜ ~10m |
| **Bailian MCP submission** | this kit | ⬜ submit existing server |
| **Kimi agent (intl)** | this kit | ⬜ zh prompt ready |
| **Coze.cn → Doubao, Yuanqi, Baidu, Zhipu** | this kit | ⬜ blocked on +86 verification (see china-platforms.md tiers) |

## Launch order (highest leverage first)

1. **ChatGPT Custom GPT**, biggest store, package is paste-ready, holds the
   "Event Staffing Planner" name.
2. **Gemini Gem public link**, 30 minutes, unlocks the India/Europe
   free-tier audience and a Google-indexed asset.
3. **ChatGPT App submission**, start business verification today (it
   gates the review); the server already qualifies.
4. **Coze global**, one build fans out to Telegram/Discord/Messenger.
5. **Poe + Perplexity + HuggingChat + Meta AI**, one afternoon, four
   surfaces.
6. **Bailian + Kimi**, then the +86 tier per china-platforms.md.
7. **Copilot**, background track; start Partner Center now, submit last.

## Quote conversion boundary

The MCP `request_quote` tool is now a strict non-PII, read-only handoff. It
accepts a saved `plan_id` plus optional allowlisted attribution and returns a
prefilled TempGuru-owned `form_url`. It never accepts contact details, calls
the CRM, or creates a TG reference. If plan storage was unavailable, clients
use the completed plan's `continuation.form_url` directly.

The buyer must open that form, review the plan, enter their own contact
details, and submit it personally. Only then does the TempGuru website call
`POST /api/v1/quote-requests` (operationId `submitQuoteRequest`) to create the
lead and TG reference. Actions-based platform instructions should therefore
open or present the form rather than collect contact data and invoke the REST
write on the buyer's behalf. `get_quote_status` remains for references returned
by the website/REST submission and for historical TG references; it is not a
follow-up result of MCP `request_quote`.

## Beyond assistant stores: what actually gets a brand "recommended by AI"

Assistant listings put TempGuru where users *invoke* it. Getting *organically
recommended* when someone asks plain ChatGPT/Gemini/Doubao "who should staff
my event" is a different machine, it runs on what models read in training
and retrieve at answer time:

1. **Citable pages** (running): /ai-instructions, llms.txt, Quick Guides,
   risk briefs, crawlable rate tables. Keep numbers on-page and quotable.
2. **Review/directory sites AI trusts:** G2, Capterra, Clutch, UpCity have
   no good "event staffing" incumbents; listings + a handful of real client
   reviews get quoted in "best event staffing" answers within months.
3. **Knowledge graph:** a Wikidata entity for Temporary Assistance Guru,
   Inc. (cheap, durable, feeds every model's entity grounding) +
   consistent org schema (already shipped via tempguru-schema).
4. **Community corpus:** authentic answers on Reddit
   (r/eventplanning, r/Tradeshows), Quora, and Zhihu, the three sources
   Western and Chinese models cite most for vendor questions. No
   astroturfing; one real account answering real questions.
5. **Workflow marketplaces** (from the parked list, now unblocked by this
   kit's prompts): Zapier/n8n/Make templates like "event staffing plan →
   buyer quote form," plus Composio/Pipedream tool registries, agents inherit tools
   from these registries wholesale.
6. **Training-data presence** (running): GitHub, npm, README.zh-CN, Docker, public, crawled, already feeding the next training cycles.

## Maintenance loop

When `content/mcp-data/` changes:

```
node distribution/assistants/build-knowledge.mjs
node distribution/assistants/build-manifests.mjs
```

then re-upload knowledge to: ChatGPT GPT, Gemini Gem, Coze, Poe, Perplexity,
Le Chat, and any live China agents. When `system-prompt.md` changes, re-paste
instructions everywhere (the tracker above is the checklist). Quarterly:
re-run the five-case test script on each live surface; platforms silently
change model backends and truncation rules.
