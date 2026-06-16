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
| [system-prompt.md](./system-prompt.md) | **Canonical instructions** (4.7k chars, fits every platform). Single source of truth. |
| [system-prompt.zh-CN.md](./system-prompt.zh-CN.md) | Chinese canonical, framed for 赴美参展 exhibitors |
| [build-knowledge.mjs](./build-knowledge.mjs) | Generates `knowledge/` from `content/mcp-data/`, never hand-edit knowledge files |
| [build-manifests.mjs](./build-manifests.mjs) | Generates the Copilot manifests from the canonical prompt |
| `knowledge/` (4 files, generated) | Company overview/FAQ, roles + full rate matrix, 345-city coverage, 50-state compliance |
| [chatgpt-custom-gpt.md](./chatgpt-custom-gpt.md) | GPT Store package + ranking playbook |
| [chatgpt-app.md](./chatgpt-app.md) | ChatGPT app directory submission (MCP, the bigger prize) |
| [gemini-gem.md](./gemini-gem.md) | Public Gem (free-tier reach: India, Europe) |
| [copilot-m365.md](./copilot-m365.md) + `microsoft/` | M365 Copilot declarative agent + generated manifests |
| [coze-bot.md](./coze-bot.md) | Coze global (→ Telegram/Discord/Messenger) + coze.cn (→ Doubao) |
| [china-platforms.md](./china-platforms.md) | Yuanqi, Baidu AgentBuilder, Kimi, Zhipu, Bailian, DeepSeek strategy |
| [mistral-le-chat.md](./mistral-le-chat.md) | Le Chat agent + Europe positioning |
| [other-platforms.md](./other-platforms.md) | Poe, Perplexity Spaces, Meta AI Studio (WhatsApp/India), HuggingChat |

## Status tracker

Update this table as things ship. (MCP/API channels from the earlier push
included for the full picture.)

| Surface | Type | Status |
|---|---|---|
| Official MCP Registry (`co.tempguru/event-staffing`) | MCP | ✅ live |
| Smithery, Glama | MCP | ✅ live |
| ModelScope MCP 广场 | MCP | ✅ live |
| Docker MCP Registry | MCP | 🟡 PR #3902 awaiting review |
| APIs.guru | OpenAPI | 🟡 issue #2610 in review queue |
| Postman collection | REST | ✅ imported (re-import after city fix) |
| Mistral connector directory | MCP | 🟡 outreach drafted, Megan to send via contact form |
| Anthropic Connectors Directory (claude.ai) | MCP | 🟡 submitted, awaiting review (2026-06-09), do not re-submit |
| npm CLI (`tempguru-mcp`), GHCR image | dev | ✅ live |
| **ChatGPT Custom GPT** | this kit | ✅ LIVE 2026-06-09, https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner (planner + read actions + in-chat quote submission via the live `submitQuoteRequest` action) |
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

## The one product gap this kit exposed, closed 2026-06-09

`request_quote` used to exist only on the MCP transport; Actions-based
platforms could read everything but had to hand off to the web form to
convert. `POST /api/v1/quote-requests` (operationId `submitQuoteRequest`)
now mirrors it on the REST surface: same zod validation, same CRM write,
same confirmation payload (all shared modules, no drift), same no-PII
telemetry rules (contact/event fields go only to the CRM), plus a light
per-IP rate limit. It is documented in the OpenAPI spec as the one write
operation, opt-in, no reservation, no payment.

Every Actions-based config in this kit (Custom GPT, Coze, Copilot) now
enables it, with explicit-user-confirmation language in the platform
suffixes. The form links with per-platform UTMs remain as the error path
and for platforms with no tool support. Re-import the OpenAPI spec on any
surface that was wired up before this date.

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
   kit's prompts): Zapier/n8n/Make templates like "event staffing quote →
   CRM," plus Composio/Pipedream tool registries, agents inherit tools
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
