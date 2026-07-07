# AI Discovery Gap Analysis — July 2026

**What we didn't do, what's broken, and what will actually get us more business.**

Produced 2026-07-07 from a 13-agent audit: 4 agents read this repo end-to-end, 3 probed
production (mcp.tempguru.co, tempguru.co, and 16 external registries/directories), 5
researched how each AI surface actually picks vendors in mid-2026 (plus competitors,
buyer-intent SERPs, and our entity/trust footprint), and 1 adversarial critic stress-tested
the combined findings. Everything marked **[verified]** was tested directly; everything
marked **[verify]** is a strong signal that needs one more check before acting on it.

---

## 1. The verdict

The engineering is real and genuinely first-in-category. The strategy as executed is
**inverted**: we built the fulfillment rail (MCP tools, OKF, llms.txt, registries) and
assumed it creates demand. It doesn't — and the evidence is now in.

**Three load-bearing facts:**

1. **Agent-readable infrastructure does not create discovery.** MCP tools only fire for
   users who already connected them. Anthropic's docs: Claude only proactively surfaces
   connectors a user has *already* connected. OpenAI weights in-conversation app
   suggestions by *app usage patterns* — an approved app with no installs gets ~zero
   proactive distribution. The official MCP Registry states it is "not intended to be
   directly consumed by host applications." llms.txt: 97% of files get zero AI fetches;
   Google explicitly doesn't read it. OKF is real (announced ~June 16, 2026) but v0.1
   with no third-party ingestion path — `.well-known/okf.json` is our own invention that
   nothing fetches. Measured traction after a month of saturation-level registry work:
   Smithery useCount = 9, PulseMCP = 38 weekly visitors, GitHub = 1 star.

2. **Recommendations today come from web-search grounding — and we're absent from that
   layer.** Every major assistant grounds commercial answers in a search index (ChatGPT →
   Bing + own index; Claude → Brave; Gemini/AI Overviews → Google + Business Profile;
   Perplexity → own index + licensed Yelp data) and over-cites a knowable inventory:
   review directories (Clutch/Yelp/G2), "best X" listicles, programmatic city pages,
   Reddit/LinkedIn. Our buyer simulation (13 queries): TempGuru appeared in **3 of 13**,
   zero transactional city queries, zero best-of lists, and — the worst one — **zero
   presence for "W-2 event staffing agency vs 1099"**, our own moat query, where 10
   competitors rank and AI answers quote *their* misclassification numbers.

3. **The funnel eats what discovery delivers.** "Brand ambassadors in New York" returns
   city-not-found **[verified — exact-match resolution, no NYC/Vegas/DC aliases]**.
   plan_staffing reports a covered city as `city_not_found` when role phrasing misses
   ("brand ambassador" singular fails) **[verified]**. A converted lead lands in an
   unwatched Notion row: no alert to Megan, no acknowledgment email to the buyer, no
   reference ID, no dedup, and the lead is *lost* if the Notion write fails. We promise
   "quote within one business day" with no timestamp to even measure it.

**The one proof the mechanism works:** the conference-registration query — where our
convention guide ranks #6 — had our exact numbers ("2× registration headcount in the
first 90 minutes of Day 1", "4–8 week planning window") lifted verbatim into the AI
answer. When we rank, we get quoted. We just barely rank anywhere.

**What survives of the thesis:** (a) we are still nearly alone at the *public no-auth*
protocol layer in this vertical — the transact rail is built and cheap to keep; (b) the
Rate Index occupies a verifiably open canonical-source slot (nobody publishes
methodology-backed all-in W-2 *bill* rates — salary sites publish worker pay, Air Fresh
publishes undated blog numbers); (c) the ChatGPT Apps directory has **zero staffing
apps**. The move is not to abandon the below-the-search layer — it's to invert the
investment so the demand layer (content, reviews, citations, directories-with-installs)
feeds the fulfillment layer we already built, and to fix the funnel before demand arrives.

**The competitive window is narrower than assumed.** Instawork ships an OAuth Partner
MCP that prices and *books* shifts end-to-end (github.com/Instawork/skills — **[verify
directly before repeating any "only staffing MCP" claim]**), and RentAHuman owns both
agent-layer SERPs ("AI agent hire event staff") with an MCP marketplace, per-city pages,
escrow payments, and press coverage. Air Fresh Marketing and eventstaff.com already run
better llms.txt files than most tech companies (eventstaff.com's includes LLM "grounding
rules"). The premise "before the gig apps figure anything out" is already false at two
layers; it's still true at the public-MCP, ChatGPT-app, and canonical-benchmark layers.

---

## 2. Broken right now (fix before anything else)

Confirmed in production on 2026-07-07:

1. **Agent-skills digest mismatch on the flagship ordering skill, both hosts**
   [verified cryptographically]. The index claims sha256 `bd26a85e…`; served bytes hash
   `5da463f2…`. Any digest-verifying client rejects our primary booking skill. Root
   cause: digest hand-maintained in `src/app/.well-known/agent-skills/index.json/route.ts`;
   `public/.well-known/agent-skills/index.json` is a stale third copy with two more wrong
   digests. Fix: compute digests at build time from `content/skills/*.md`, delete the
   shadow copy, add a digest gate to `check:submissions`, redeploy Vercel + apex worker.

2. **llms.txt links a 404** [verified]: `tempguru.co/compliance` → 404 (real page is
   `/compliance-hub`) — in the file built specifically for AI consumption, on our core
   differentiator. Add a CI link-check for every URL in llms.txt/llms-full.txt.

3. **llms-full.txt contradicts everything** [verified]: "same-day staffing, workers
   placed within 2 hours, no rush fees" (6+ times) vs llms.txt/MCP "2–4 weeks standard";
   registration $25–32/hr vs the $40 BA floor; "#1 event staffing platform" self-superlatives;
   names Instawork (violating our own rule). An assistant that quotes it gets contradicted
   by our own tools mid-conversation. Rewrite or delete; regenerate from `content/mcp-data/`.

4. **Cross-surface fact chaos** [verified]: markets stated as 275, 300+, 345, and 446
   across our own pages; four different rate ranges; $16–20/hr seasonal copy vs the $40
   floor; "2,500+ events" vs "5,000+ events"; TempGuru vs TAG vs Temporary Assistance
   Guru in live SERP titles; duplicate titles across 3+ URLs. Engines cross-check before
   citing; contradictions are why they hedge or misquote us. One canonical fact sheet,
   propagated everywhere, with the existing check-rates CI pattern extended to the apex
   marketing pages and llms workers.

5. **Our best commercial page is indexed under a French URL** [verified]:
   `quick-guides/5-instawork-alternatives-for-corporate-events?lang=fr` is what Google
   surfaces for our only ranking comparison content. Fix canonical/hreflang sitewide.

6. **State minimum-wage data is stale while labeled "2026 state minimums"**
   [verified stale; replacement values need independent audit]: CA, MO, MI, NY, AK, AZ,
   DC all carry 2025-vintage values. File touched exactly once, no per-state as_of/source,
   no Jan-1/Jul-1 update process. For a compliance-branded company this is the single
   most dangerous data quality issue. Audit all 51 against state DOL sources, add
   `as_of`/`source_url` per state, add a freshness CI gate.

7. **Canada is marketed but not served** [verified]: 38 Canadian markets, zero
   provincial compliance records (Ontario/BC/Alberta have daily-OT rules that change
   budgets), USD numbers relabeled "CAD", `rate_range_usd` field on Canadian cities.
   Either add provinces or say honestly "coordinator confirms provincial rules."

8. **Version drift + supply-chain smells** [verified]: npm is at 1.3.0; repo, hosted
   server, and MCP Registry say 1.2.0; npm releases 1.2.1–1.3.0 were never committed to
   the public repo. `server.json` has no `packages` block, so registry clients can't
   resolve the npm install. One release pipeline: version bump → tag → CI publishes
   npm + GHCR + registry + deploy, plus a drift gate.

9. **"kissmyabs32" is outcompeting us for our own brand** [verified]: the duplicate
   Glama listing under that personal handle ranks #1 on Google for "tempguru mcp"; the
   duplicate Context7 entry has trustScore 5.0 vs official 2.1; the Docker PR was filed
   from it. Claim/merge the duplicates, do all future submissions from Tempguru-co, add
   named humans to the GitHub org. Anyone doing diligence on an unauthenticated server
   that takes PII currently finds an anonymous joke username as the maintainer of record.

10. **Live assistants are serving a stale 11-role catalog** [verified by regeneration]:
    roles expanded to 19 on 2026-06-13, but `distribution/assistants/knowledge/*.md`
    was never regenerated or re-uploaded — the ChatGPT GPT, Poe bot, and Coze plugin
    answer from the old catalog (8 sellable roles invisible). HF dataset jsonl and
    Open WebUI docstrings equally stale. Regenerate, re-upload, and extend
    `check:submissions` to cover the knowledge/HF/Open-WebUI artifacts.

11. **MCP polish gaps** [verified live]: `plan_staffing` and `get_rate_benchmark` — the
    two flagship tools — return no structuredContent/outputSchema (the other 6 do);
    initialize returns no `instructions` field (the golden order never reaches client
    system prompts); `get_rate_benchmark`'s advertised `tier` parameter is dead code;
    discovery docs advertise protocolVersion 2025-03-26 while the server negotiates
    2025-06-18 and the name differs between them ("tempguru-mcp" vs
    "tempguru-event-staffing"); mcp subdomain homepage is **noindex,nofollow with zero
    JSON-LD** while robots.txt invites every crawler; no security.txt; MCP write path
    has no rate limit (REST mirror does); OT is detected but never priced into totals
    (CA estimates knowingly low).

12. **Tracker rot — our own ledger can't be trusted** [verified]: mcpservers.org marked
    "✅ live" but is missing; mcp.so marked submitted but soft-404s; awesome-mcp-servers
    marked merged but 0 mentions found in the three big lists [verify which is true];
    Postman marked imported but still read-only/stale (no submitQuoteRequest); the
    Anthropic Connectors submission is self-reported with no external evidence — and the
    portal requires a Team/Enterprise Claude org [verify which org filed, or whether it
    was filed at all]. Every "✅" needs external re-verification; every pending item
    needs an owner and a next-action date.

---

## 3. Dated follow-ups that are due NOW

- **GitHub MCP Registry / VS Code @mcp gallery**: our own follow-up date on the
  partnerships@github.com email is **~2026-07-08 — tomorrow**. GitHub curates roughly
  quarterly; missing a cycle costs 3 months.
- **Anthropic Connectors Directory**: submitted 2026-06-09 (self-reported), ~4 weeks
  silent. First **verify the submission exists** (Team/Enterprise org requirement),
  then escalate with the submission date. Re-run the "event staffing" connector-search
  canary after any approval. Our own docs call this the single highest-value listing.
- **ChatGPT app**: tracker says blocked on business verification; ecosystem research
  says submitted 2026-06-10 and in review. Verify status in the dev console, respond
  same-day to reviewer feedback, and pre-build the post-approval activation campaign
  (both platforms gate proactive surfacing on installs/usage — approval without an
  install campaign yields nothing).
- **Docker MCP Catalog PR #3902**: stalled 31 days with the template unfilled — it will
  never be reviewed in that state. Fill it, run `task validate`/`task build`, comment to
  re-trigger triage (and create the Docker Hub namespace it references).
- **Pending PRs**: LangChain docs #4392 (~4 wks — nudge), Google knowledge-catalog
  #75/#76 (~3 wks — nudge), Cline #1763, mcp.so #2625, APIs.guru #2610, mcpmarket
  941702. Mistral outreach was drafted and apparently **never sent** — send it.

---

## 4. The prioritized plan

### Sprint 0 (this week) — stop the bleeding, chase the queues
Items in §2 (1–5, 9, 10) + §3. Nothing here is more than a day of work; several are
minutes. Also: drop the ClaudeBot Crawl-delay in apex robots.txt; fix `/ai` redirect
(currently downgrades to http://); add privacy-policy/ToS URLs to the server card,
mcp.json, and directory metadata (the policy exists at tempguru.co/privacy-policy — it's
just not linked on any machine surface, and OpenAI review hard-requires it).

### Sprint 1 (weeks 1–2) — make the funnel convert
1. **City/role resolution**: alias layer in cities.json (NYC, Vegas, LA, SF, Philly, DC,
   borough/suburb → parent metro), "City ST" parse, punctuation normalization,
   Levenshtein did-you-mean populating the existing (never-used) `suggestion` field;
   role singular/plural + synonym map (security → crowd control, greeters/check-in →
   registration, promo models → brand ambassadors). Fix plan_staffing's false
   `city_not_found` (resolve city independently of role matches; distinct
   `roles_not_found` status). Golden-case evals for every alias class.
2. **Lead lifecycle**: transactional email (Resend/Postmark ~30 lines) — acknowledgment
   to buyer + alert to megan@ (and/or Slack webhook) with deal URL and trust level;
   durable fallback (Redis `leads:pending` + retry drain) so a Notion outage can't lose
   a lead; 24h dedup (SETNX on hash of email+city+dates); public reference code
   (TG-2607-XXXX) in the payload; optional `contact_phone`; make company/event_name
   optional; full ISO timestamp + SLA aging tile on /admin; fix the lead-trust date
   parser (ISO dates currently mis-score as "past event" → real agent leads get
   down-ranked) [verified].
3. **Attribution**: persist ua_class, channel (MCP/REST), and a plan_id (minted by
   plan_staffing, accepted by request_quote) onto every Notion lead as structured
   properties; add telemetry to the 5 REST read routes (currently invisible); weekly
   closed-won-by-channel report. This is what makes every future decision measurable.
4. **MCP hardening**: structuredContent + outputSchema on plan_staffing and
   get_rate_benchmark; `instructions` in initialize; implement or remove the tier param;
   rate-limit the MCP write path; OT-adjusted totals alongside straight-time; sync
   protocolVersion/name in discovery docs from one source; security.txt; strip the
   ChatGPT-GPT steering link from tool outputs (cross-platform steering reads badly in
   an Anthropic review); un-noindex the mcp subdomain and add Organization/WebAPI/
   Service/Dataset JSON-LD.

### Sprint 2 (weeks 2–6) — build the demand layer (this is where the business is)
5. **Programmatic city pages** for all 345 markets from `content/mcp-data/` (the exact
   data the tools serve — a rendering gap, not a data gap): per-city bill-rate ranges
   (worker pay vs all-in side by side), lead times, venues, state compliance flags,
   FAQPage schema, 2–3 falsifiable numeric heuristics per page (the pattern that
   demonstrably got us quoted). Prioritize top-20 convention hubs + small markets where
   only gig apps rank (Boise-class SERPs have zero managed agencies).
6. **The W-2 vs 1099 pillar** + a maintained **Misclassification Enforcement Tracker**
   (DOL 2024 rule → May 2025 non-enforcement → Feb 2026 proposed rescission → final rule
   imminent; state regimes unaffected; Qwick/SF settlement, Instawork/Colorado, Party
   Staff v. Qwick et al., Upshift v. Instawork et al. — all public record). This is our
   moat query and a live news cycle currently owned by a competitor (HYPE) and a
   software vendor (Lasso). Policy decision required: keep "never name competitors" for
   agent/sales conversations; allow factual public-record citations in editorial.
7. **Comparison pages**: real `/vs/instawork` and `/vs/qwick` (current /versus page
   names them exactly once with a generic title) — factual tables: W-2 vs 1099,
   misclassification liability, fill accountability, insurance, coordinator model.
8. **Rate Index → canonical source**: internal links from the three pages that already
   rank for rate queries (it currently doesn't rank for its own name and is outranked
   by our own blog posts); downloadable CSV/PDF; quarterly versioned refresh;
   per-role/per-city rate pages; meta description (currently EMPTY on the page)
   [verified]; annual "US/Canada Event Staffing Rate Report" with press kit pitched to
   BizBash, Event Marketer, Exhibitor, TSNN, Skift Meetings, SIA; HARO/Qwoted founder
   quotes. Publish the dataset (CC-BY, attribution-required citation line) to
   HuggingFace, Kaggle, data.world, Google Dataset Search — attribution-required
   licensing turns every reuse into the brand mention that correlates 0.664 with AI
   visibility (vs 0.218 for backlinks).
9. **Reviews + entity**: create GBP (Jacksonville Beach), Bing Places, Apple Business
   Connect; claim Clutch (event-staffing category — its category page ranks page 1),
   G2/Capterra (StaffED), Yelp in hub markets; automated post-event review request
   (25–50 Google + 20 Trustpilot in 2 quarters — with 5,000+ events this is process,
   not demand); fix stale citations (Eventective still lists the old Tennessee phone
   865-806-5519 and $25–56 rates [verified]; Buzzfile lists us as "Tag"; ZoomInfo
   misspells "Meaghan"); enrich Wikidata Q139944840 (legal name, Sunbiz ID, founder,
   logo, references — no Wikipedia attempt until real press exists); close the sameAs
   loop bidirectionally; publish case studies (State Farm Stadium 2020, if rights
   permit) and a "verify our compliance" page (COI sample, carriers, coverage, W-9,
   E-Verify); disclosed founder-led participation on r/eventplanning, r/Tradeshows,
   Quora (zero TempGuru mentions exist anywhere on Reddit/Quora today).

### Sprint 3 (weeks 4–8) — channels with real reach, in this order
10. **M365 Copilot**: start Partner Center verification **today** (the acknowledged
    multi-week long pole; manifests already generated; corporate event planners live in
    M365). 11. **Claude Code plugin marketplace**: submit `plugins/tempguru` via the
    community-marketplace form — shipped May 22, 2026, after our tracker's last
    reconciliation; hours of work; no staffing competitor present. 12. **Meta-platforms**
    (one integration = thousands of agents): Zapier public integration (OpenAPI import,
    10 Zap templates, embed to waive the 50-user bar), Pipedream component, Composio
    toolkit (cheap; Workday-acquisition roadmap risk — submit, don't depend), n8n node.
    13. **Perplexity**: Tech Partner application for the 400+ connector directory +
    the 20-minute Space; self-serve no-auth remote MCP works there today. 14. **ChatGPT
    Ads experiment**: self-serve since May 2026, conversation-contextual targeting
    against ~900M WAU [verify current CPC/eligibility in Ads Manager before budgeting];
    wire Conversions API to request_quote. 15. **Google**: publish the Gemini Gem
    (30 min, still undone); note the shipped Gemini CLI extension's consumer audience
    collapsed with the June 2026 Antigravity cutover [verify against Google's official
    announcement] — get into the Antigravity MCP Store instead; Gemini Enterprise
    "add TempGuru" how-to. 16. **Cheap tail in one sitting**: HF dataset upload (org +
    `hf upload`), Open WebUI hub, Continue hub, HuggingChat, Meta AI, Poe knowledge
    upload, Coze consumer bot (plugin shipped, bot never built — it's the thing that
    fans out to Telegram/Discord/Messenger), Bailian/Kimi, awesome-mcp-servers PRs
    (verify the merged-#7373 claim first), llama-index upstream PR, npm publish
    workflow. 17. **Alexa+ outreach**: Action SDK application citing the Yelp/Angi
    request-a-quote precedent (BD-gated; low cost; zero staffing players present).

### Quarter 2 — transactability (the Instawork gap)
An agent choosing between "booked now with confirmed price" (Instawork Partner MCP) and
"a human emails you within one business day" (us) completes the booking every time. We
can't instantly confirm workers (coordinator model) — but we can instantly commit a
price, a reference, and an SLA:
- **v1 (1–2 weeks, rate math already exists)**: instant indicative quote with reference
  code + published response-time SLA + `get_quote_status` tool + `get_policies` tool
  (minimums, cancellation, backfill terms, COI timing, payment terms — questions that
  gate every real booking and currently answer "email megan@").
- **v2**: OT-adjusted totals; Stripe deposit/hold link in the confirmation payload;
  multi-city plan mode (the "one coordinator, one invoice" differentiator is currently
  unsupported by the flagship tool); budget-first mode; event archetypes (fill the
  ~15 load-bearing TODOs in the one draft archetype or delete the directory).
- **v3**: OAuth account linking for repeat-buyer rebooking; ACP/UCP service-category
  watch (travel/hospitality landed first; register in Merchant Center to be ready);
  A2A v1.0-conformant signed agent card + thin task endpoint (current apex card is
  pre-1.0, unsigned, and points A2A clients at an MCP endpoint they can't speak to).

---

## 5. Measurement is the governing system, not a nice-to-have

The strategy's success metric has never been measured. Stand up, this month:

1. **Weekly recommendation-share panel** — ~30 buyer prompts ("who should staff my
   trade show booth in Vegas", "best event staffing agency Chicago", "how much do brand
   ambassadors cost", "W-2 event staffing", "is TempGuru legit") run via API against
   ChatGPT, Claude, Gemini, Perplexity, Copilot; log mention/citation/recommendation
   and which sources each engine grounded on. This is the true KPI. Today it scores
   near zero — which is also the baseline that proves the point.
2. **Bing Webmaster AI Performance** (free since Feb 2026): exactly which URLs Copilot
   cites and the grounding queries it generates. Register both hosts in Bing WMT +
   Google Search Console; add IndexNow pings on deploy.
3. **Channel dashboard**: telemetry ua_class × REST/MCP × Notion lead → closed-won
   revenue. One weekly report.
4. **Quarterly kill/double-down review** of every distribution surface, each with an
   owner and a next-action date. Standing rule: zero attributed leads in 90 days →
   explicitly kill or explicitly re-justify. (The 40-artifact, 10-stalled-submission,
   stale-knowledge-file pattern is what happens without this.)
5. **Quarterly canaries**: "event staffing" searched inside Claude connectors, ChatGPT
   apps, Perplexity directory, Cursor, Docker, VS Code @mcp; plus the monthly
   competitor probe (curl matrix of competitor /llms.txt, /.well-known/mcp.json,
   registry entries, and "AI booking" press) so we know the day Instawork/Qwick/
   PeopleReady ship a public agent surface.

---

## 6. Workstreams nobody had scoped (from the adversarial review)

1. **Event-industry SaaS + partner stacks** — the highest-intent surface, orthogonal to
   AI assistants: Cvent Supplier Network, Eventbrite/Bizzabo app marketplaces, exhibitor
   services (Freeman/GES) and venue/AV partner programs, CVB/DMO vendor directories
   (travelportland.com and visitsanantonio.com temporary-staffing pages already rank in
   our SERPs — cheap authoritative listings), IAEE/MPI/PCMA/ESCA directories, and a
   possible Ubeya partnership (it sells software to the local agencies we aggregate —
   channel, not competitor). These double as the third-party citations the GEO layer needs.
2. **Fulfillment capacity + key-person risk**: the entire conversion loop is megan@ —
   quote review, the 1-business-day SLA, every directory contact. No backup owner, no
   SLA instrumentation, no per-market fill-capability data behind the confident
   lead-time/99%-fill claims. Define fill tiers per market and have the tools read
   them; train a second quote responder; shared pipeline inbox; pre-negotiated surge
   terms in top-20 markets. If any channel works, the first thing that breaks is one
   person's inbox — and no system will notice.
3. **Legal/compliance hardening as its own track**: privacy/ToS linked from every
   machine surface; stale wage data (above); Canada honesty; Quebec Bill 96 exposure if
   marketing into 38 Canadian markets with zero FR-CA; machine-quoted rates that the
   eventual human quote systematically exceeds (OT gap) invites disputes; trademark
   filings for "TempGuru" and "Event Staffing Rate Index" before the benchmark strategy
   makes the names worth stealing.
4. **Procurement enablement**: corporate buyers can't complete a purchase from a chat —
   they need COI naming their venue, W-9, insurance verification, Ariba/Coupa vendor
   registration, net-30. Publish a public vendor packet page (structured data, linked
   from plan_staffing next_steps and OKF); register in Ariba Discovery/Coupa; "onboarded
   as a vendor in 48 hours" is a citable differentiator gig apps can't match.
5. **Email infrastructure**: audit SPF/DKIM/DMARC on tempguru.co before sending
   transactional mail (an ack email that lands in spam is worse than none); dedicated
   subdomain via Resend/Postmark; templated ack + quote emails with reference ID and
   booking CTA; optional SMS (event ops is phone-first and we don't even collect phone).
6. **Defensive brand posture**: claim the "Event Staffing Planner" name on every
   assistant store now (the squatting risk is flagged in our own docs and remains
   open); seed "TempGuru review" / "is TempGuru legit" / "TempGuru pricing" content
   before someone else defines those queries (today's top trust artifacts: a 2-review
   Trustpilot page and the kissmyabs32 handle); brand-mention alerting; pre-write the
   founder story so the 2025 JTA controversy cluster isn't the entity's dominant news
   signal (the founder's stadium-ops + hockey-ownership background is an unpitched
   trade-press story).

---

## 7. Things the audit flagged as needing verification before acting

- Instawork Partner MCP scope (github.com/Instawork/skills) — verify directly; it
  changes the "first and only" positioning everywhere.
- Anthropic Connectors submission existence + which org filed it.
- awesome-mcp-servers merge status (tracker says merged #7373; live check found 0
  mentions in all three major lists).
- ChatGPT Ads pricing/eligibility for B2B services — confirm inside Ads Manager.
- Gemini CLI consumer deprecation / Antigravity cutover — confirm against official
  Google announcements before reallocating.
- The corrected 2026 minimum-wage values quoted in the audit — re-verify against state
  DOL sources before writing them into the dataset.
- WECAN "Top 10" listing (we rank 7th) — possibly auto-generated/pay-to-play; verify
  before celebrating or amplifying.
- All single-run SERP absence results are geo/personalization-dependent — treat as
  strong signals, re-run via the weekly panel.

---

## 8. One-line summary

We built a beautiful checkout counter below the search layer, never put the store on
any street buyers actually walk down, and left the cash register unattended — the fix
is to point the same data pipeline at the citation layer (city pages, rate report,
reviews, comparison content), force the two first-party directories through, make the
funnel convert (aliases, alerts, attribution, instant quote), and measure recommendation
share weekly so the next quarter's effort goes where the bookings come from.
