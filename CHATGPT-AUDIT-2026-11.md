# MCP + ChatGPT audit, 2026-11-11

Scope: the live TempGuru MCP server and its published artifacts, the ChatGPT
plugin listing (still showing package v1.0.0), the ChatGPT Custom GPT, and what
the newly claimed Business Hub profile can and cannot do for lead flow.
Everything marked **verified** was checked live on 2026-11-11 from this repo's
own gates or direct requests; everything else cites its source at the bottom.

## Bottom line

1. **The MCP server is healthy and fully released at 1.7.3.** Live server,
   npm, the official MCP Registry, GHCR, and the `v1.7.3` tag all agree; every
   CI gate passes against production. Two small drifts: the Python client is
   at 0.3.0 in source but 0.2.0 on PyPI, and the assistants tracker still
   describes 1.7.3 as pending on npm and the Registry (fixed in this commit).
2. **Yes, the ChatGPT plugin must be updated, and the old runbook was for a
   flow that no longer exists.** OpenAI replaced the App Directory with the
   plugin directory on 2026-07-09. Our 2026-06-10 submission (package v1.0.0)
   was carried over as a plugin. OpenAI scans the MCP server daily, so the
   tools behind the listing have kept updating by themselves, but the listing
   metadata, bundled skills, and version number only change when a new ZIP is
   uploaded. Nobody has uploaded one, so the directory shows v1.0.0 with
   June-era copy and zero bundled skills. This commit adds a generator that
   builds the 1.7.3 package from canonical sources; what remains is a dashboard
   upload only Megan can do.
3. **Business Hub is a profile-and-insights surface today, not a channel.** It
   lets TempGuru control what ChatGPT says about the company and shows mention,
   click, and discovery-topic counts, but OpenAI states claiming "does not
   guarantee higher placement," the Business Agent program is limited to US
   ecommerce and online-service businesses and is explicitly not connected to
   a company's plugin, and the "service business" claim path was "Coming soon"
   at launch. The business-driving moves are: finish verification, make the
   profile say exactly what the plugin says, wire `utm_source=chatgpt.com`
   attribution, use discovery topics to steer content, and have a Business
   Agent ready to publish the day the category opens.

---

## 1. MCP server audit (verified)

| Check | Result |
|---|---|
| `GET /api/v1/health` | `{"status":"ok","version":"1.7.3"}` |
| MCP `initialize` | `serverInfo.version 1.7.3`, protocol `2025-06-18` negotiated with a 2025-era client; server card advertises `2026-07-28` down to `2024-10-07`; `instructions` present (golden order reaches every client's system prompt) |
| `tools/list` | 12 tools, every one with `title`, explicit `readOnlyHint` / `destructiveHint` / `openWorldHint`, and an `outputSchema` (so ChatGPT and Claude get `structuredContent`). 10 read-only; `plan_staffing` and `save_staffing_plan` are the two non-destructive, non-contact writes |
| `resources/list`, `prompts/list` | 8 skill resources, 2 prompts |
| OpenAPI | `info.version 1.7.3`, 10 paths, eight reads + `submitQuoteRequest` + health |
| `/.well-known/` | `mcp.json`, `mcp/server-card.json`, `agent-card.json`, `openai-apps-challenge` all 200 |
| npm `tempguru-mcp` | 1.7.3 published (11 versions, 1.0.0 to 1.7.3) |
| npm `tempguru-pi` | 1.7.3 |
| Official MCP Registry `co.tempguru/event-staffing` | 1.7.3 is `isLatest`, published 2026-11-02 (the first `publish-registry` run failed, the manual re-dispatch succeeded) |
| GHCR `tempguru-co/event-staffing` | `latest`, `1.7.3`, `1.7` present |
| Git | `v1.7.3` tag on `e734908` (main) |
| `npm run check:submissions` | OK: 345 market rows, 19 roles, 12 tools, 9 distribution files in sync |
| `npm run check:live-discovery` | OK: 8 skills, 12 tools across modern + legacy MCP, A2A, OKF, server cards, llms inventories |
| `npm run check:agent-readiness` | passed |
| `npm run test:unit` | 242 passed |
| Assistant knowledge + Copilot manifests | regenerated, no diff (in sync with `content/mcp-data/`) |

Drift and gaps found:

- **PyPI.** `clients/python/pyproject.toml` is 0.3.0; PyPI serves 0.2.0 and the
  only Python tag is `python-v0.2.0`. Either push `python-v0.3.0` (the
  `publish-pypi.yml` workflow does the rest) or revert the source bump.
- **Tracker rows.** `distribution/assistants/README.md` said npm and the
  Registry were waiting on 1.7.3; both have had it since 2026-11-02. Corrected
  in this commit.
- **Skill descriptions vs OpenAI limits.** `event-staffing-ordering` (1,114
  chars) and `staffing-agency-partner-growth` (1,037) exceed OpenAI's 1,024-char
  skill-description limit at final submission. The ChatGPT package generator
  trims them (keeping the trigger sentences and the closing "Not for ..."
  exclusion); tightening the canonical text in `content/skills/` would make
  the trim a no-op and keep one description everywhere.
- **`tempguru.co/support` is a 404.** OpenAI requires a support URL; the
  package uses `https://tempguru.co/contact` (200). Nothing to fix unless a
  dedicated support page is wanted.
- **ChatGPT attribution.** The MCP URL on file with OpenAI has no `?source=`
  tag and the plugin update flow cannot change a server URL, so ChatGPT-plugin
  calls are attributed by the `openai-chatgpt` UA class and OpenAI's published
  egress ranges (`OPERATIONS.md`, "Verified AI-platform calls"). `request_quote`
  still stamps `utm_medium` from the `source_platform` the model passes; the
  skills tell it to pass `chatgpt-app`.

No server code change is needed for the plugin update. The server already
satisfies every documented plugin-directory check: explicit annotations on all
tools, no-auth, HTTPS, domain-verification token served, no promotional copy
in model-readable fields.

## 2. ChatGPT plugin audit

### What changed under us

- **2026-06-10:** TempGuru Event Staffing submitted through the Apps SDK form as
  package v1.0.0 (business-verified org, domain verification shipped the same
  day). Tracker said "in Review".
- **2026-07-09:** OpenAI retired the App Directory in favor of the plugin
  directory shared by ChatGPT and Codex; existing apps were packaged into
  plugins. A plugin is `plugin.json` + `mcp.json` + `skills/` + `assets/` in one
  ZIP.
- **Since then:** OpenAI scans hosted MCP servers daily and "eligible tool
  updates can go live after automated checks pass without a new package
  version." So the 12 current tools are what ChatGPT sees. But "to update
  metadata, assets, or bundled skills, upload a new ZIP to the existing
  plugin," which "creates a package version with its own checks and review
  outcome," and "publishing an update replaces the previous package version."
  That is why the listing still reads v1.0.0.
- **The old runbook** (`distribution/assistants/chatgpt-app.md`) described the
  Apps SDK dashboard flow, which no longer applies. Rewritten in this commit.

### What the stale v1.0.0 package costs

- The directory copy predates `get_policies`, `get_plan`, `save_staffing_plan`,
  `get_rate_benchmark`, the non-PII `request_quote` contract, and the current
  approved scale claims (300+ U.S. and Canadian markets, 5,000+ events,
  100,000+ completed shifts).
- **No bundled skills.** Skills are the plugin feature that lets ChatGPT trigger
  a workflow from a plain "I need booth staff in Vegas" without the user
  invoking anything. The 8 canonical skills already ship to Claude Code,
  Codex, Gemini, Pi, and Hermes; ChatGPT is the one major surface without them.
- The version number itself signals abandonment to reviewers and to anyone
  comparing listings.

### What this commit adds

- `distribution/assistants/build-chatgpt-plugin.mjs` (also
  `npm run build:chatgpt-plugin`): generates
  `distribution/assistants/chatgpt-plugin/` from `package.json`,
  `content/public-facts.json`, and the portable `skills/` copies, and zips it.
  Version = server version, so every release bumps the listing. It enforces
  OpenAI's stricter final-submission limits (displayName 30, shortDescription
  30, longDescription 4,000, 3 default prompts at 128, skill descriptions
  1,024, `plugin:skill` names 64, square icon, HTTPS URLs) and exits non-zero
  on any violation.
- `plugin.json` carries the full listing (`Business & Operations`, eight
  capability strings, four listing URLs, brand color `#24BBEA` which clears the
  2:1 contrast floor on white and on `#212121`), the review block (five
  positive cases with `tools_triggered` and `expected_behavior`, three negative
  cases, `commerce: false`), and release notes. `publication.countries` is
  omitted on purpose so the existing targeting is preserved.
- `mcp.json` points at exactly `https://mcp.tempguru.co/mcp` with
  `auth.type: none`, byte-identical to the URL on file, because the update flow
  cannot change a server URL.
- Each bundled skill's `agents/openai.yaml` gains
  `policy: { products: [CHAT, CODEX], allow_implicit_invocation: true }` and
  its MCP dependency is rebound to the bundled server key so ChatGPT does not
  register a second connector.
- `scripts/check-submissions.mjs` now holds the generated `plugin.json` to the
  approved public figures, so the listing can never drift from the claims
  registry.

### What only Megan can do (dashboard)

1. In platform.openai.com → Plugins → TempGuru Event Staffing, check the
   current state. If v1.0.0 is somehow still "In Review" five months on,
   cancel that review before uploading (only one review can be active per
   plugin). Download the existing ZIP as the baseline OpenAI holds.
2. Record the demo walkthrough: the five positive cases from `chatgpt-app.md`
   in ChatGPT (chatgpt.com/plugins → + → Add custom MCP server, see
   `chatgpt-app.md`; Developer Mode no longer exists). Put the
   reviewer-accessible URL in
   `review.demo_recording_url` (the generator warns until it is set), rerun
   `npm run build:chatgpt-plugin`.
3. **MCPs → Issues → Rescan**, resolve any annotation-justification findings.
4. **Upload plugin to make changes** → `distribution/assistants/chatgpt-plugin.zip`
   → resolve automated findings → submit for review. Feedback comes by email;
   rejections can be appealed by reply.
5. Publish on approval. Then add the plugin link to tempguru.co/ai-agents, the
   README badge row, and the Business Hub profile description.

## 3. ChatGPT Custom GPT (secondary surface)

- Live since 2026-06-09 as "Event Staffing Planner by TempGuru".
- Knowledge files regenerate with no diff, so the data in the repo is current,
  but `RELEASE.md` lists "re-upload knowledge and re-paste instructions" as an
  open 1.7.3 closeout item and the tracker has no upload date after June.
  Re-upload the five `knowledge/` files, re-paste `system-prompt.md`, and
  re-import Actions from `https://mcp.tempguru.co/openapi.json` (1.7.3 adds
  `getPolicies`, `getPlan`, `getQuoteStatus`; `submitQuoteRequest` stays the
  one consequential write).
- Confirm the builder profile shows "by tempguru.co" (DNS-verified domain),
  the strongest ranking signal the store exposes.

## 4. Business Hub: what it is and how to use it

Facts (launched in beta 2026-11-10; see sources):

- Claiming requires owning or representing the business and a website;
  verification is by business phone/email, DNS TXT, or Shopify. **Persona
  identity verification** is required after the claim before changes publish,
  feeds connect, insights show, or agents can be created. The blue check
  appears on Persona approval.
- Editable: website, description, category, contact phone/email, a free-text
  field of information ChatGPT may share in conversations, logo, cover photo,
  delivery and return policy. Every change is reviewed by OpenAI before it
  publishes.
- Insights (7/28 days): mentions, website clicks, discovery topics. Shown only
  above a volume threshold; blank is not zero. ChatGPT links carry
  `utm_source=chatgpt.com`.
- Product feeds are for sellers of products (CSV/JSONL, US targeting by
  default). The "through a service" option was "Coming soon" on launch day.
- Business Agents: US ecommerce and online-service businesses only, subject to
  a separate category and intended-use review. Built from instructions and
  context documents the business provides; they explain and link to the
  website, cannot book, purchase, or look up orders, must identify as AI, may
  not invent prices or availability, may not request sensitive data, and may
  not submit forms without explicit authorization. OpenAI: "If your business
  also has a ChatGPT plugin, the agent's chat doesn't use it. The two are not
  connected." Agents can be sponsored as ChatGPT Ads destinations.
- OpenAI on ranking: claiming "does not guarantee higher placement or sales,"
  and its product lead said joining "should not have an impact" on how often a
  company appears.

### Do now (this week)

1. **Finish Persona verification.** Nothing publishes without it.
2. **Make the profile match the plugin, word for word.** Description from the
   first paragraph of `distribution/assistants/system-prompt.md`; the approved
   scale claims only (300+ U.S. and Canadian markets, 5,000+ events, 100,000+
   completed shifts; "completed shifts are worker-shift assignments, not unique
   people"); the W-2 model; "rates are all-inclusive W-2 bill rates"; "no
   payment until you approve the quote"; US and Canada only. Category: event
   staffing / staffing services. Contact: `megan@tempguru.co`, (904) 206-8953.
   Website: `https://tempguru.co`. Put the Rate Index and the get-staffing
   form in the free-text field, with the same caveat language the tools use
   (planning estimates, coordinator confirms).
3. **Attribution.** Add `utm_source=chatgpt.com` to the GA4 source map next to
   the existing `ai-agent` / `chatgpt-gpt` / `chatgpt-app` mediums, and record
   the 28-day baseline of mentions, clicks, and discovery topics in the
   assistants tracker.
4. **Watch discovery topics.** They are the only first-party view of which
   conversations surface TempGuru. Feed each topic into the content queue (the
   Sprint 2 demand-layer plan in `GAP-ANALYSIS-2026-07.md`: programmatic city
   pages, the W-2 vs 1099 pillar). The Business Hub cannot move ranking, but
   the pages it shows ChatGPT citing can.

### Prepare now, publish when eligible

5. **Business Agent kit.** Instructions = the INSTRUCTIONS block of
   `system-prompt.md` minus tool references, plus the agent policy lines
   (identify as AI representing TempGuru; quote only published ranges labeled
   estimates; never collect contact details in chat; link to
   `https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=chatgpt-business-agent`).
   Context documents = the five generated `knowledge/` files. Keep it in this
   repo so it regenerates with the data. TempGuru is a service business; try
   the "online service" path when it opens, and ask OpenAI's business support
   whether managed staffing qualifies now.
6. **Sponsorship test.** Once an agent is live, a small ChatGPT Ads campaign
   with the agent as destination is the one paid lever inside ChatGPT; the
   GAP analysis already lists the Conversions API wiring to the buyer form.

What not to expect: Business Hub does not install the plugin for anyone, does
not feed the plugin's tools, and does not change how often ChatGPT recommends
TempGuru. The plugin (section 2) is still the mechanism that puts live rates
into conversations; the Hub is the mechanism that makes the brand card and
citations accurate when ChatGPT does mention TempGuru.

## 5. Prioritized action list

| # | Action | Owner | Effort |
|---|---|---|---|
| 1 | Record demo video, set `demo_recording_url`, `npm run build:chatgpt-plugin`, upload ZIP via "Upload plugin to make changes", submit | Megan | 1-2 h |
| 2 | Persona verification + profile copy + GA4 `chatgpt.com` source + Insights baseline | Megan | 1 h |
| 3 | Re-upload Custom GPT knowledge, re-paste instructions, re-import Actions | Megan | 30 min |
| 4 | Push `python-v0.3.0` tag (or revert the source bump) | Megan / repo | 5 min |
| 5 | Tighten the two long canonical skill descriptions under 1,024 chars, regenerate digests | repo | 30 min |
| 6 | Business Agent instructions + context docs committed next to `knowledge/` | repo | 1 h |
| 7 | After approval: plugin link on tempguru.co/ai-agents, README badge, Business Hub description | repo + Megan | 20 min |

## Sources

- OpenAI, "Upload and submit your plugin": https://developers.openai.com/plugins/deploy/submission
- OpenAI, "Package your plugin": https://developers.openai.com/plugins/build/plugins
- OpenAI, "Plugin submission errors" (field limits, annotation rules): https://developers.openai.com/plugins/deploy/submission-errors
- OpenAI, "Skills" (description drives invocation; `dependencies.tools`): https://developers.openai.com/plugins/build/skills
- OpenAI, "Introducing Businesses in ChatGPT": https://openai.com/index/introducing-businesses-chatgpt/
- OpenAI Help, "Setting up your business on ChatGPT": https://help.openai.com/en/articles/20001635-setting-up-your-business-on-chatgpt
- OpenAI, "Businesses in ChatGPT Terms": https://openai.com/policies/businesses-in-chatgpt-terms/
- Search Engine Land, "ChatGPT Business Hub is now live": https://searchengineland.com/chatgpt-business-hub-is-now-live-501350
- Flavio Copes, "A deep dive into Businesses in ChatGPT" (plugin/agent non-connection, Persona, "Coming soon" service path): https://flaviocopes.com/businesses-in-chatgpt/
- Citeme, "Businesses in ChatGPT explained": https://www.citeme.io/ressources/businesses-in-chatgpt
- Datastudios, "ChatGPT Business Hub: free business agents for US brands" (ranking quotes): https://www.datastudios.org/post/chatgpt-business-hub-free-business-agents-us-brands
- eSEOspace, "ChatGPT App Directory explained" (2026-07-09 directory change): https://eseospace.com/blog/chatgpt-app-directory-explained/
- OpenAI Developer Community, plugin versioning and resubmission threads: https://community.openai.com/t/versioning-for-chatgpt-apps/1371387 and https://community.openai.com/t/can-you-tweak-fix-update-while-waiting-for-review/1370382/4
