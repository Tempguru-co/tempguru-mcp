# The pre-search toolbox: getting picked before the AI ever searches the web

When an AI answers "find me event staff in Dallas," it resolves in this
order, web search (Google/Bing/Brave) is the LAST resort, not the first:

1. **Model weights**, what it learned in training. Free, permanent, slow to
   enter (12-18 month lag via crawled corpora: GitHub, npm, PyPI, HF, docs).
2. **Context window**, instructions, skills, and agent playbooks installed
   on the user's machine (CLAUDE.md/GEMINI.md/AGENTS.md, agent skills,
   custom GPT instructions). Consulted on every single turn.
3. **Connected tools**, MCP servers/plugins the user has installed. Tool
   *descriptions* sit in the context permanently; "event staffing" in a tool
   description = standing advertisement inside the model's attention.
4. **Runtime registries**, catalogs the agent itself queries when it lacks
   a tool (Claude's connector search, ChatGPT app directory, VS Code `@mcp`
   gallery, Cline/LobeChat marketplaces, Composio/Zapier meta-tools).
   **This is the layer her question is about**, the agent searches its
   registry *before* the web because that is what registries are for.
5. **Direct fetch**, llms.txt, /.well-known/api-catalog, OpenAPI, grabbed
   without a search engine when the agent already knows the domain.

**Proof of the gap (2026-06-09):** searching Claude's own runtime connector
registry for "event staffing" / "staffing" / "events" returns **zero
results**. Being on the official MCP Registry does not feed Claude's
in-product discovery, only the Anthropic Connectors Directory does. That
submission is therefore the single highest-value item below.

---

## What this kit added (all verified locally)

| Artifact | Layer | Where it lives |
|---|---|---|
| **Gemini CLI extension** (`gemini-extension.json` + `GEMINI.md` at repo root) | 2+3 | Installable the moment this is pushed: `gemini extensions install https://github.com/Tempguru-co/tempguru-mcp`, loads the MCP server AND a context playbook into every Gemini CLI session |
| **Open WebUI tool** (`open-webui/tempguru_event_staffing_tool.py`) | 3 | The local-LLM surface: Ollama/LM Studio users behind Open WebUI; submit to the community hub (below) |
| **Python client** (`clients/python/`, name `tempguru` confirmed free on PyPI) | 1+3 | pip surface + LangChain/OpenAI tool-wrapping examples in its README; smoke-tested against the live API |
| **Hugging Face dataset** (`build-hf-dataset.mjs` → `huggingface/`) | 1 | 345 cities + 30 role-rate rows + 51 compliance rows, generated from `content/mcp-data/`; training-corpus and RAG-demo presence |

Regenerate after data updates: `node distribution/toolbox/build-hf-dataset.mjs`.

---

## Submission runbook (layer 4: the registries agents actually query)

> **CHECK FIRST:** the canonical submission log is
> `/Users/meganhayward/Documents/Claude/website/geo-optimization/agent-discovery/SUBMISSIONS.md`
> (the website project). A June 3-9 campaign logged there already covers much
> of this list, verify there before submitting ANYTHING. Statuses below
> reconciled against it 2026-06-09.

Ordered by leverage. ✅ = already live from earlier pushes.

### Tier 1, in-product discovery for the big three

1. **Anthropic Connectors Directory**, 🟡 **SUBMITTED, awaiting Anthropic
   review** (confirmed by Megan 2026-06-09). Do NOT re-submit. The zero-result
   registry search below is expected until approval; re-run that canary check
   once the listing is approved. Requirements audit kept for reference, all
   green:
   remote production server ✅ · every tool has `title` +
   `readOnlyHint`/`destructiveHint` ✅ (`src/lib/mcp/register-tools.ts`) ·
   no-auth so no OAuth burden ✅ · privacy policy
   https://tempguru.co/privacy-policy ✅ · docs (README + tempguru.co/ai) ✅ ·
   support contact megan@tempguru.co ✅. For "test account": state that no
   account exists, data is public; reviewer can call every tool cold.
   Note `request_quote` writes to the CRM (same justification text as
   `distribution/assistants/chatgpt-app.md`).
2. **ChatGPT app directory**, packaged in
   [../assistants/chatgpt-app.md](../assistants/chatgpt-app.md); blocked
   only on business verification.
3. **GitHub MCP Registry (github.com/mcp) + VS Code `@mcp` gallery**, the
   Copilot install base. 🟡 DIAGNOSED 2026-06-10: hand-curated, no
   auto-ingest of new servers, no PR repo; the documented path is emailing
   **partnerships@github.com** after upstream publication. v1.0.3
   (repository → tempguru-mcp) republished + registry-verified 2026-06-10
   after a DNS-auth key rotation (resolved; see SUBMISSIONS.md keep-alive).
   Inclusion email SENT 2026-06-10 (Megan, to partnerships@github.com);
   follow up on the thread if no reply by ~2026-07-08.

### Tier 2, agent-IDE and client marketplaces (one sitting, ~15 min each)

4. **Cline marketplace**, 🟡 SUBMITTED 2026-06-10:
   cline/mcp-marketplace#1763 (honest testing note in lieu of the
   tested-in-Cline checkbox; `llms-install.md` added at repo root per their
   convention). Awaiting review.
5. **LobeChat / LobeHub**, ✅ auto-aggregated from upstream sources, no
   action needed (confirmed 2026-06-04).
6. **Cursor directory**, ✅ LIVE, CONFIRMED 2026-06-10 (Megan, browser
   screenshot; site 429s bots so confirm visually, not via curl). Listing:
   cursor.directory/plugins/tempguru-event-staffing, current canonical
   description, MCP Servers (1) with correct streamable-http config,
   Skills (2), Homepage/Source links, and an "Add to Cursor" one-click
   install button on the listing itself. Downloads counter starts at 0
   on publish day, worth a monthly glance. Published via
   cursor.directory/plugins/new Auto-scan of tempguru-agent-skills.
   Keywords added to .claude-plugin/plugin.json (v1.0.1, 119c105) for
   the next listing refresh.
7. **Continue hub**, ⬜ still open. hub.continue.dev block referencing the
   HTTP server.
8. **mcp.so**, 🟡 submitted: issue chatmcp/mcpso#2625 (2026-06-04), edited
   with full metadata, awaiting maintainer (~1-7 days typical).
9. **mcpservers.org**, ✅ LIVE at mcpservers.org/servers/kissmyabs32/tempguru-mcp.
   **mcp.directory**, ✅ SUBMITTED 2026-06-10 (server + both skills via
   their forms; "publish within 24 hours", email notification to megan@).
   **mcpmarket.com**, ✅ SUBMITTED 2026-06-10: submission_id 941702, FREE
   queue ~2–4 weeks (declined the new $29 fast-lane per no-paid-placement).
10. **PulseMCP**, 🟡 auto-ingests from the Official MCP Registry weekly
    (confirmed by PulseMCP); expect listing ~June 11. Email
    hello@pulsemcp.com only if absent after that.
11. **awesome-mcp-servers**, 🟡 TWO PRs open: appcypher #7373 +
    punkpeye #7373 (Glama badge added, `has-glama` set, awaiting merge).
    Do not file new ones.
12. **Goose extensions**, 🟡 PR OPEN 2026-06-10:
    aaif-goose/goose#9721 (repo moved from block/goose; directory now at
    goose-docs.ai). servers.json entry (streamable-http, no auth) + tutorial
    page with a live-data example transcript. Awaiting maintainer review.
13. **Windsurf**, 🟡 half-covered: skills reach Windsurf via skills.sh, and
    the npm CLI README ships a Windsurf config. Only a Windsurf-STORE
    listing would be net-new; low priority.

### Tier 3, publish the new artifacts

14. **Push this repo** → Gemini CLI extension goes live by URL; then check
    geminicli.com/extensions for the browse-page submission process (the
    description field in the manifest is what they display).
15. **PyPI**, ✅ PUBLISHED 2026-06-09: `pip install tempguru` (v0.1.0) live
    at pypi.org/project/tempguru, via Trusted Publishing (OIDC, no token), workflow `.github/workflows/publish-pypi.yml`. Future releases: bump
    version in `clients/python/pyproject.toml` + push tag `python-v0.x.y`.
    Unlocks the LangChain/LlamaIndex integration queue items (#23).
16. **Open WebUI community hub**, create account at openwebui.com →
    submit the tool file. Reaches the self-hosted/Ollama crowd that never
    touches a cloud assistant.
17. **Hugging Face**, create `tempguru` org →
    `hf upload tempguru/event-staffing-catalog distribution/toolbox/huggingface . --repo-type dataset`.

### Tier 4, meta-tool platforms (agents inherit catalogs wholesale)

18. **Zapier integration** (developer platform, OpenAPI import), once
    listed, every Zapier-MCP user's agent can reach TempGuru without
    installing anything TempGuru-specific. Biggest multiplier in this tier.
19. **Pipedream**, component referencing the REST API; Pipedream hosts MCP
    for its whole catalog.
20. **Composio**, tool-registry submission (OpenAPI accepted); popular
    default toolset for LangChain/CrewAI agents.
21. **n8n community node** (`n8n-nodes-tempguru` npm) + template gallery
    entries ("Event staffing quote → CRM").

### Tier 5, weights-layer slow burns (cheap, compounding)

22. **Wikidata**, ✅ entity ALREADY EXISTS: **Q139944840** ("American event
    staffing platform"), verified 2026-06-09. Do NOT create another.
    Optional enrichment only: industry, HQ (Jacksonville Beach FL),
    founding, official website, MCP endpoint via "described at URL".
23. **LangChain + LlamaIndex**, 🟡 adapters SHIPPED in `tempguru` 0.2.0
    (2026-06-10): `tempguru.langchain.get_tools()` and
    `tempguru.llamaindex.TempGuruToolSpec`, extras `[langchain]` /
    `[llamaindex]`, 6 tools each incl. opt-in `request_quote` (new in the
    client, wraps the REST write). Verified from PyPI. **LangChain official
    docs PR FILED 2026-06-10 (Megan approved):**
    https://github.com/langchain-ai/docs/pull/4392 (tools + provider pages
    on docs.langchain.com, from fork Tempguru-co/docs; vendor-named package
    accepted per Stripe/Gradio precedent, no shim needed). Remaining:
    llama-index-tools-tempguru standalone publish (monorepo closed to new
    integrations; package prepared, see SUBMISSIONS.md).
24. Keep shipping public, crawlable code and docs (GitHub/npm/PyPI/HF/
    README.zh-CN), already the pattern.

### Explicitly NOT doing

- **A2A agent card in THIS repo's public/**, one is already LIVE on the
  apex domain via Cloudflare Worker: `tempguru.co/.well-known/agent-card.json`
  v1.2.0 (plus DNS-AID HTTPS records and a `_mcp` TXT record). Don't
  duplicate it on mcp.tempguru.co; the apex copy is canonical and
  maintained in the website project's `worker-complete.js`.
- **huggingface/skills re-submission**, PR #159 was closed by the
  maintainer as out of scope 2026-06-08. The HF *dataset* (this kit) is a
  different, acceptable surface.
- Anything paid-placement until free tiers are exhausted.

---

## Maintenance

- New registry submissions: record IDs/URLs in the tracker section of
  [memory: mcp-distribution-channels] and re-test discoverability ("event
  staffing" search in each client) quarterly.
- The Claude-registry zero-result check is the canary: re-run it after the
  directory submission lands.
