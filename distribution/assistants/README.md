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
| `knowledge/` (5 files, generated) | Company overview/FAQ with the approved 300+ U.S. and Canadian markets, 5,000+ events, and 100,000+ completed shifts; roles + full rate matrix; configured-market catalog; 50-state compliance; booking/procurement policies |
| [chatgpt-custom-gpt.md](./chatgpt-custom-gpt.md) | GPT Store package + ranking playbook |
| [chatgpt-app.md](./chatgpt-app.md) | ChatGPT plugin directory package + upload runbook (MCP + bundled skills, the bigger prize) |
| [build-chatgpt-plugin.mjs](./build-chatgpt-plugin.mjs) | Generates `chatgpt-plugin/` (plugin.json, mcp.json, skills, assets) and the upload ZIP from the canonical sources, never hand-edit the output |
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
| Official MCP Registry (`co.tempguru/event-staffing`) | MCP | ✅ `1.7.5` is the latest published version (2026-11-11, verified). The npm-dispatched run gave up before npm propagation and was re-run manually. `1.7.4` was never published. |
| Smithery, Glama | MCP | ✅ live |
| ModelScope MCP 广场 | MCP | ✅ live |
| Docker MCP Registry | MCP | 🟡 PR #3902 awaiting review |
| APIs.guru | OpenAPI | 🟡 issue #2610 in review queue |
| Postman collection | REST | ✅ imported (re-import after city fix) |
| Mistral connector directory | MCP | 🟡 outreach drafted, Megan to send via contact form |
| Anthropic Connectors Directory (claude.ai) | MCP | ✅ approved as a community connector. The AGENT5 disclosure was sent on the original review thread 2026-08-14; `1.7.1` was subsequently deployed after the operator chose to proceed without waiting for guidance. This records no Anthropic approval of the offer. The `1.7.2` hotfix changes policy-topic discovery and telemetry, not offer terms or connector inventory. The release after `1.7.2` removes AGENT5 from every model-readable surface; see `distribution/anthropic-directory-update.md`. |
| npm CLI (`tempguru-mcp`), GHCR image | dev | ✅ `tempguru-mcp@1.7.5` on npm (2026-11-11, verified). 🟡 GHCR still lacks the `1.7.5` / `1.7` semver tags: the `v1.7.5` git tag must be created (GitHub → Releases → Draft a new release → tag `v1.7.5` on `main` → Publish), which starts `docker.yml`. PyPI `tempguru` is still `0.2.0` while `clients/python` is at `0.3.0`; push `python-v0.3.0` or revert the bump. |
| Hermes agent catalog (NousResearch) | Agent Skill | 🟡 PR #39150 awaiting upstream review. Its branch (`kissmyabs32/hermes-agent:add-event-staffing-skill`) carries catalog copy `1.0.8` with the three tool renames, pushed 2026-11-11; the skill test (6/6) passes after a stale market-wording assertion was corrected. Do not touch the separate live Hermes content agent runtime. |
| Pi + Prime Agent (`tempguru-pi` npm package) | Agent Skill + native tools | ✅ `1.7.5` is the current release, published 2026-11-11 and verified on npm (native tools `tempguru_get_lead_time_guidance`, `tempguru_prepare_quote_form`, `tempguru_quote_request_status`; skills regenerated for the renames). `1.7.3` and earlier remain immutable; `1.7.4` was never published. The package has 8 runtime-adapted skills, 9 native tools, a non-PII buyer-form handoff, and automatic `pi` / `prime-agent` attribution. The published-artifact smoke last ran on `1.7.2` (all 8 skills enumerated, native extension loaded, one Austin call each for Pi and Prime, coordinator-confirmation boundary preserved); run it on `1.7.5` after publication. Use the next unused patch for any fix; never republish an existing version. |
| OpenClaw / ClawHub | Agent Skill | 🟡 seven buyer-handoff safety updates were published and verified as immutable `1.7.0` on 2026-08-14 from commit `125ee8a`. Releases `1.7.3` through `1.7.5` change the canonical skills (`skill_version: 1.7.5`, three tool renames); publishing them needs the operator's ClawHub account, since no repository workflow covers ClawHub. The legacy OpenClaw VPS runtime is unchanged. |
| **ChatGPT Custom GPT** | this kit | 🟠 LIVE 2026-06-09, https://chatgpt.com/g/g-6a285fef5fd4819199e9b9c25da543c8-tempguru-event-staffing-planner; inspect and refresh its prompt, knowledge, listing, and configured Actions before closeout. MCP uses the buyer-operated form; an explicitly configured REST `submitQuoteRequest` Action may submit once only after the buyer reviews the contact-bearing payload and clearly confirms. |
| **ChatGPT plugin (directory, was "ChatGPT App")** | this kit | 🟡 Directory package `app-6a29a9e0634481919b7440b626b0e746`: a `1.7.5` draft was created from ZIP on 2026-11-11 (8 skills, `mcp.json` for `https://mcp.tempguru.co/mcp` with no auth override, review cases in the manifest) and is ready for **Submit for review**; 1.0.0 stays unpublished. The renamed tools carry OpenAI's "new tool definition needs further review" hold, which the review resolves. After approval, **Publish plugin** on the 1.7.5 version. Build with `npm run build:chatgpt-plugin` (directory target); runbook in [chatgpt-app.md](./chatgpt-app.md). |
| **ChatGPT Business Hub (Businesses in ChatGPT)** | profile | 🟡 Claimed 2026-11 (beta launched 2026-11-10). Finish Persona identity verification, fill the profile from `system-prompt.md` and the approved claims, baseline Insights (mentions, clicks, discovery topics), add `utm_source=chatgpt.com` to GA4 attribution. Business Agents are US ecommerce/online-service only today and are not connected to the plugin; prepare instructions + context docs from `knowledge/` so TempGuru can publish one the day the category opens. Checklist in the audit. |
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

`tempguru-mcp@1.7.5` and `tempguru-pi@1.7.5` are independently versioned
packages that share a number in this release. Both publish after merge through
their workflows, the canonical skills move to `skill_version: 1.7.5`, and the
Hermes and ClawHub copies are re-synced from them.

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

The MCP `prepare_quote_form` tool is now a strict non-PII, read-only handoff. It
accepts a saved `plan_id` plus optional allowlisted attribution and returns a
prefilled TempGuru-owned `form_url`. It never accepts contact details, calls
the CRM, or creates a TG reference. If plan storage was unavailable, clients
use the completed plan's `continuation.form_url` directly.

On the MCP path, the buyer must open that form, review the plan, enter their
own contact details, and submit it personally. Only the TempGuru website then
calls `POST /api/v1/quote-requests` (operationId `submitQuoteRequest`) to create
the lead and TG reference. Never send contact details to MCP `prepare_quote_form`.

An assistant may use a separately and explicitly configured REST
`submitQuoteRequest` Action, but only after it collects the Action schema's
minimum fields, shows the buyer the complete contact-bearing payload, explains
that it will be sent to TempGuru's CRM or durable fallback intake queue, and
receives a clear request to submit. Invoke the write once and preserve a TG
reference only after success. Without that explicit REST Action, present the
buyer-operated form. `get_quote_request_status` remains for references returned by the
website/REST submission and for historical TG references; it is not a
follow-up result of MCP `prepare_quote_form`.

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
node distribution/assistants/build-chatgpt-plugin.mjs --zip
```

then re-upload knowledge to: ChatGPT GPT, Gemini Gem, Coze, Poe, Perplexity,
Le Chat, and any live China agents. When `system-prompt.md` changes, re-paste
instructions everywhere. When OpenAPI operations or semantics change, re-import
or inspect the configured Actions/plugins on every live surface and verify the
current eight-read plus explicitly confirmed `submitQuoteRequest` inventory.
The tracker above is the checklist. Quarterly:
re-run the five-case test script on each live surface; platforms silently
change model backends and truncation rules.
