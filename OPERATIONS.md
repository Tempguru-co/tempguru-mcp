# Operations — Deploy, Telemetry & Admin Dashboard

Internal documentation for the telemetry layer added 2026-06-04. The MCP server itself is stateless; this doc covers the *measurement* layer that sits alongside it.

---

## Deployment

- **Source repo:** [`Tempguru-co/tempguru-mcp`](https://github.com/Tempguru-co/tempguru-mcp) (GitHub, public)
- **Vercel project:** `temp-guru/tempguru-mcp` (team `temp-guru`)
- **Auto-deploy:** every push to `main` ships to **Production** via Vercel's GitHub App — no manual `vercel --prod` needed.

> **Failure mode — pushes stop deploying after a repo transfer/rename.** Vercel's Git integration breaks *silently*: `git push` no longer triggers a build, and the last good deploy keeps serving, so nothing looks broken until you notice prod is stale. Root cause: a GitHub repo transfer does **not** carry the Vercel GitHub App installation to the new owner/org (the org ends up with zero app installations).
>
> **Fix:**
> 1. Install/configure the Vercel GitHub App on the org and grant it the repo — [`github.com/apps/vercel`](https://github.com/apps/vercel) → **Configure** → select the org → grant access to `tempguru-mcp`. Requires an **org owner**; the CLI cannot perform this step.
> 2. From the repo root: `vercel git connect` — should print `Connected`.
> 3. Verify: push a trivial commit to `main`; a new Production deploy should appear within ~30s.
>
> Confirm a deploy was **git-triggered** (not a manual `vercel --prod`) by the `…-git-main-…` alias shown in `vercel inspect` — manual deploys never get that branch alias. Heads-up: the current CLI's `vercel inspect` does not print the commit SHA, so that alias is the reliable signal.

---

## Architecture

```
MCP request                                                     Vercel
  │                                                              edge
  ▼                                                                │
withAcceptNormalization (CORS + Accept-header shim)               │
  │                                                                │
  │  binds { userAgent, ipCountry } via AsyncLocalStorage          │
  ▼                                                                │
mcp-handler → tool callback                                        │
  │                                                                │
  │  reads ctx, calls queryX(), records track() (fire-and-forget) │
  ▼                                                                ▼
queryX (pure function, no I/O)                              Upstash Redis
  │                                                                ▲
  ▼                                                                │
JSON response back to client                                       │
                                                                   │
GET /admin (server component) ─────────► getMetrics() ────────────┘
                              │
                              ▼
                       Dashboard HTML
```

Telemetry writes never block MCP responses. If Upstash is down, `ff()` swallows the error silently and the tool call still returns normally to the client.

---

## Storage schema

All keys are namespaced by UTC date (`YYYY-MM-DD`). Every daily key carries a **90-day TTL**.

| Key | Type | Contents |
|---|---|---|
| `tools:{date}` | HASH | `tool_name → count` |
| `uas:{date}` | HASH | `ua_class → count` |
| `countries:{date}` | HASH | `iso2 → count` |
| `status:{date}` | HASH | `success`/`error` → count |
| `queries:cities:{date}` | ZSET | city slug, score = invocation count |
| `queries:roles:{date}` | ZSET | role slug, score = invocation count |
| `queries:states:{date}` | ZSET | state code, score = invocation count |
| `recent:invocations` | LIST | last 200 events, each a JSON string |
| `dates:active` | ZSET | `YYYY-MM-DD` → unix timestamp (for time-series widget) |

`recent:invocations` is trimmed on every write via `LTRIM 0 199`.

---

## User-agent classifier

`src/lib/telemetry/classify-ua.ts` maps raw UA strings to ~25 categories. First-match-wins. Categories grouped by:

- **Anthropic surfaces** — claude-ai, claude-code, claude-desktop
- **OpenAI surfaces** — openai-chatgpt, openai-codex, openai-agents-sdk
- **Other Western agents** — cursor, cline, windsurf, gemini, perplexity
- **Chinese ecosystem agents** — qwen-ecosystem (Qwen/DashScope/ModelScope-Agent), deepseek, doubao, kimi
- **Directory probes** — glama-probe, smithery-probe, modelscope-probe, mcp-inspector
- **Search crawlers** — baidu-spider, yisou-spider, sogou-spider, _360-spider, bing-bot, google-bot, yandex-bot, applebot, common-crawl
- **Scripted clients** — curl/wget/python-requests/httpx/axios/node-fetch/got
- **Catchall** — `other` (when nothing matches)

### Adding a new UA class

When `other` grows large, inspect the raw UA strings in Vercel logs or via Redis CLI, then add a new regex branch in `classify-ua.ts` and bump the `UaClass` union type. The classifier runs at MCP-call time, so changes apply to new traffic only — historical events keep their old classification.

---

## Admin dashboard

**URL:** `https://mcp.tempguru.co/admin`
**Auth:** single password via `ADMIN_PASSWORD` env var.
**Cookie:** `tg_admin`, HTTP-only, Secure, SameSite=Lax, 7-day expiry. Value is `sha256("admin:" + ADMIN_PASSWORD)`, so rotating the env var invalidates all existing sessions automatically.

### Time-range switcher
Top right: 1d / 7d / 30d / 90d. URL is `?days=N`. Maximum window is 90 days (matches TTL).

### Widgets
- **Stats header** — total requests, errors, unique tools, UA classes
- **Daily volume chart** — bar per day in window
- **By tool** — invocation count per tool, sorted desc with %-bars
- **By UA class** — same breakdown for clients (most strategically useful — Claude vs Cursor vs Qwen vs probes vs crawlers)
- **Top cities / roles / states** — top 20 each, demand signal from queries
- **By country** — Vercel edge geolocation
- **Recent invocations** — last 50 events with timestamps, tool, UA class, country, status, params

### What's NOT captured
- No raw IPs
- No request bodies or response bodies
- No user content (queries are just slug-form parameters — `boston`, `brand-ambassadors`)
- No PII
- No cookies, no analytics pixels, no cross-site identifiers

---

## Required env vars

Set via Vercel project settings (Production + Preview).

| Var | Source | Purpose |
|---|---|---|
| `KV_REST_API_URL` | Upstash Vercel Marketplace integration (auto-set) | Redis REST endpoint |
| `KV_REST_API_TOKEN` | Upstash integration (auto-set) | Redis auth token |
| `KV_REST_API_READ_ONLY_TOKEN` | Upstash integration (auto-set) | Read-only token (unused but populated) |
| `KV_URL` | Upstash integration (auto-set) | Redis protocol URL (unused by current code) |
| `ADMIN_PASSWORD` | Manual | Dashboard login password |

If `KV_REST_API_*` are unset: telemetry writes silently no-op; dashboard shows "storage not connected" notice; MCP tool responses are unaffected.

If `ADMIN_PASSWORD` is unset: `/admin/*` shows "Admin locked" notice with setup instructions; MCP tool responses are unaffected.

---

## Provisioning from scratch

If the database is ever destroyed or the project is forked:

1. **Vercel Marketplace** → search **Upstash for Redis** → install on the project
   - Region: **iad1** (matches Vercel deploy region for lowest latency)
   - Tier: Free (covers ~10k commands/day; our actual rate is far below this)
   - Custom Prefix: leave blank (defaults to `KV_`)
   - Environments: Production + Preview + Development
2. **Set `ADMIN_PASSWORD`** in Vercel → Project Settings → Environment Variables → Production + Preview
3. **Redeploy** — env var changes only take effect on a fresh build

Telemetry starts capturing on the next MCP request after deploy.

---

## Operational notes

### Rotating ADMIN_PASSWORD

Update the env var → redeploy. All existing sessions become invalid automatically because the cookie hash is derived from the password.

### Inspecting raw events

Via Upstash console (linked from Vercel marketplace tab):
```
LRANGE recent:invocations 0 49
```

Via redis-cli (if connecting directly):
```
LRANGE recent:invocations 0 49
HGETALL tools:2026-06-04
ZREVRANGE queries:cities:2026-06-04 0 -1 WITHSCORES
```

### Watching for new clients

Refresh the dashboard daily for the first week. If a new UA class shows up as a large fraction of `other`, that's a signal to add a new classifier rule. The `Recent invocations` table shows the classified bucket but not the raw UA — to see the raw string, check Vercel function logs filtered to the relevant tool.

### Cost ceiling

Upstash free tier is 10,000 commands/day. Each MCP tool invocation writes ~8 commands (counters + ZSET adds + TTL refresh + ring buffer LPUSH/LTRIM). That gives a budget of ~1,250 tool invocations per day before any cost. Current production rate is far below this. If real traffic ramps past 1k/day sustained, switch to the next Upstash tier or sample writes.

### Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Dashboard shows "storage not connected" | KV_REST_API_URL/TOKEN env vars missing | Re-install Upstash Marketplace integration |
| Dashboard shows "Admin locked" | ADMIN_PASSWORD env var missing | Add to Vercel env vars + redeploy |
| Tool responses slow but dashboard still works | Upstash latency spike | Verify Upstash region matches Vercel region; consider switching to fire-and-forget exclusively (already the case) |
| `other` bucket growing | Unclassified client | Inspect Vercel logs for raw UA strings; add regex to `classify-ua.ts` |
| Redirect loop on /admin | Stale browser cookie | Clear cookies for mcp.tempguru.co OR open in incognito |
| `git push` to `main` doesn't deploy | Vercel GitHub App not installed on the org (e.g. after a repo transfer) | Install the Vercel app on the org → `vercel git connect` → verify with a test push (see **Deployment**) |
