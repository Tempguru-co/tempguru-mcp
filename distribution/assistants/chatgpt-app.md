# ChatGPT plugin: TempGuru in the ChatGPT plugin directory

The higher-leverage ChatGPT surface. On 2026-07-09 OpenAI folded the ChatGPT
App Directory into the **plugin directory** (shared by ChatGPT and Codex) and
repackaged every existing app as a plugin. A plugin is an MCP server plus
bundled skills in one ZIP, which is exactly what this repo already ships for
Claude Code and Codex, so this remains a packaging exercise, not a build.

Why this beats the Custom GPT long-term: plugins are invoked **inside normal
ChatGPT conversations** (the model can call TempGuru whenever a user who has the
plugin mentions event staffing), not only when a user opens a GPT. The Custom
GPT captures searchers; the plugin captures mentions. Ship both.

Status: the original app was submitted 2026-06-10 as package **v1.0.0** through
the previous Apps SDK form and the listing still shows that version. The MCP
server behind it is scanned daily by OpenAI, so its tools have been updating on
their own, but the listing metadata, skills, and version only change when a new
ZIP is uploaded. See [CHATGPT-AUDIT-2026-11.md](../../CHATGPT-AUDIT-2026-11.md)
for the audit that produced this runbook.

---

## What already qualifies

| Requirement | Status |
|---|---|
| Remote MCP server over HTTPS (one per plugin) | ✅ `https://mcp.tempguru.co/mcp` (streamable HTTP, protocol 2026-07-28 down to 2024-11-05) |
| Explicit `readOnlyHint` / `destructiveHint` / `openWorldHint` on every tool | ✅ 12 tools; 10 read-only including the non-PII `prepare_quote_form` form handoff; `plan_staffing` and `save_staffing_plan` truthfully flagged as non-destructive, non-contact writes |
| No-auth or OAuth | ✅ no-auth (`auth.type: none`, simplest review path) |
| Domain verification token at `/.well-known/openai-apps-challenge` | ✅ served by `src/app/.well-known/openai-apps-challenge/route.ts` |
| Tool descriptions written for model selection | ✅ "use this when..." style, no promotional copy |
| Four listing URLs (website, support, privacy, terms), all HTTPS | ✅ `tempguru.co/ai-agents`, `tempguru.co/contact`, `tempguru.co/privacy-policy`, `tempguru.co/terms-of-service` (verified live 2026-11-11) |
| Square icon ≥ 48 px, PNG/SVG ≤ 5 MiB | ✅ `distribution/toolbox/logo-512.png` |
| Verified publisher identity | ✅ business verification completed for Temporary Assistance Guru, Inc. (2026-06-10) |
| Bundled skills with `name` + `description` frontmatter | ✅ the 8 canonical skills, two descriptions auto-trimmed to the 1,024-char limit by the generator |

## The package (generated, never hand-edited)

```
node distribution/assistants/build-chatgpt-plugin.mjs --zip
```

writes `distribution/assistants/chatgpt-plugin/` (`plugin.json`, `.app.json`,
`skills/`, `assets/`) from `package.json`, `content/public-facts.json`, the
committed app reference, and the portable `skills/` copies, then zips it to
`distribution/assistants/chatgpt-plugin.zip` (gitignored). The version is the
server version (`1.7.3` today), so every release bumps the listing automatically
and OpenAI's `plugin_version_unchanged` check can never bite.

Before the upload, record the demo walkthrough (the five positive cases below in
ChatGPT, see "Testing in ChatGPT" below) and put its reviewer-accessible URL in
`extensions.com.openai.review.demo_recording_url`. The generator warns while
the placeholder is still there.

## Two packages exist (found 2026-11-11)

- **Developer dashboard** (platform.openai.com → Plugins): package
  `app-6a29a9e0634481919b7440b626b0e746`, **1.0.0 Approved, never
  published** ("Ready to publish" / "Not published"), June copy, no skills,
  no support URL, MCP configuration "Unavailable" because OpenAI's scan flags
  tool names inconsistent with their behavior: `check_availability` (renamed
  `get_lead_time_guidance` in `1.7.4`) and then `request_quote` (renamed
  `prepare_quote_form` in `1.7.5`, alongside `get_quote_status` →
  `get_quote_request_status`). The scanner compares each tool's name with its
  description; a name that promises more than the description allows is
  flagged, and the listing's MCP configuration stays "Unavailable" until a
  rescan is clean.
  This is the one that reaches the public directory. Its own
  **Download plugin ZIP** gives the `name` and `.app.json` the generator must
  use for a **Create draft from ZIP** upload.
- **chatgpt.com/plugins**: `dev-6a29a4facbbc8191bf54eaf071b16b5d`, the
  development copy. The 1.7.3 ZIP uploaded there on 2026-11-11 updated only
  this copy. Build for it with `npm run build:chatgpt-plugin:dev`.

`npm run build:chatgpt-plugin` targets the **directory** package by default
(name `app-6a29a9e0634481919b7440b626b0e746`). Its 1.0.0 export (read
2026-11-11) is a Codex manifest plus logo with no `.app.json` and no MCP file;
the server is attached on the dashboard's MCPs tab. An upload that omits it is
rejected ("This package omits the plugin's existing MCP"), so this target
declares the server in `mcp.json` at exactly `https://mcp.tempguru.co/mcp`
with no app reference and no auth block (the existing connection's
authentication is configured on OpenAI's side, and an auth override is
rejected), and carries the plugin-level review block (which needs exactly one
`mcp.json` server). `--with-auth` adds `auth: none` for a brand-new listing.

The dashboard offers only **Publish plugin** while 1.0.0 is the sole version.
**Submit for review** appears on a draft, which **Create draft from ZIP**
creates.

Order of operations: deploy `1.7.5` → MCPs tab → Rescan (renamed tools then
show "This new tool definition needs further review before it can be
published": a human-review hold, cleared by review, not by code) →
**Create draft from ZIP** with the `1.7.5`
package → paste `chatgpt-plugin-review.md` into Review details → Submit for
review → Publish on approval.

## What the dev copy looks like (from its downloaded ZIP, 2026-11-11)

The converted June package is a Codex-format manifest: `name`
`dev-6a29a4facbbc8191bf54eaf071b16b5d` (a generated id, not a slug), `version`
`1.0.0`, `developerName` and `author.name` both "App developer", category
`Other`, no default prompts, no skills, and the retired "345+ US and Canadian
cities" copy as its only description. The MCP server is attached through a
registered app reference (`.app.json`), not a bundled `mcp.json`. Four
consequences baked into the generator:

- The upload `name` must equal that id; any other name is rejected
  ("Plugin upload name must match the existing plugin").
- The ZIP carries the listing's canonical app reference verbatim: `.app.json`
  (committed as `distribution/assistants/chatgpt-plugin.dev.app.json`; the
  directory package has none and uses `mcp.json`) and `apps: "./.app.json"`
  in the manifest. The validator rejects an update without it ("Plugin upload
  must contain exactly the existing canonical app") and also rejects a fresh
  `mcp.json` in its place, so no `mcp.json` is emitted for this listing; the
  app is the server, and OpenAI keeps updating it from the daily scan.
- Plugin-level review test cases can only bind to an `mcp.json` server, not
  to an app reference ("Plugin-level test_cases require exactly one MCP
  server"), so this listing's manifest carries **no review block**. The
  generator writes the same five positive and three negative cases, the demo
  URL, the commerce statement, and the release notes to
  `distribution/assistants/chatgpt-plugin-review.md` for pasting into the
  dashboard's review form. A brand-new listing (no app reference yet) gets
  `mcp.json` plus the manifest review block instead.
- `plugin-name:skill-name` is capped at 64 chars and the id uses 36, so three
  skills are renamed inside this package only: `multi-city-activation`,
  `agency-partner-growth`, `plan-from-event-brief`. Their `skill_id` values
  sent to `prepare_quote_form` stay canonical; the server allowlists those.
- `developerName` is not controlled by the manifest. The portal sets it from
  the organization's verified publisher identity and flags the manifest value
  with `developer_name_defaulted`. To change what the directory shows, change
  the verified organization name in platform.openai.com → Organization →
  Settings, not this package.

Validator rules learned the hard way: `review.test_cases.positive[]` and
`review.test_cases.negative[]` (not `positive_test_cases`), and
`tools_triggered` is one string, not an array. Unknown keys anywhere under
`extensions.com.openai` fail the upload.

## Upload steps (update flow for an already-submitted plugin)

1. **Open the existing plugin** in the OpenAI Platform dashboard (platform.openai.com → Plugins → TempGuru Event Staffing). It was submitted through the previous form, so the dashboard offers **download your existing plugin as a ZIP**; keep that file as the baseline.
2. **Do not touch the MCP server.** It is the canonical app the ZIP references; its URL cannot be changed through the update flow (support ticket only), and it carries no `?source=` suffix. Attribution for this surface comes from the server's `openai-chatgpt` UA class and OpenAI's published egress ranges.
3. **MCPs → Issues → Rescan** first. The server is scanned daily, but a manual rescan after a deploy surfaces any annotation or justification finding before the package review starts. Each tool is reviewed separately; a held tool keeps its previously approved metadata.
4. **Upload plugin to make changes** → choose `chatgpt-plugin.zip`. Resolve automated findings (the generator already enforces the final-submission limits). In the review form, paste the cases, demo URL, commerce statement, and release notes from `distribution/assistants/chatgpt-plugin-review.md`, then **submit for review**. Only one review can be active per plugin.
5. Review feedback arrives by email. After approval, **publish** replaces the previous package version; the listing then shows `1.7.3`.

## Directory metadata (what the generator emits)

- **displayName:** `TempGuru Event Staffing` (≤ 30 chars)
- **shortDescription:** `W-2 event staffing, US/Canada` (≤ 30 chars)
- **longDescription:** the planner, the one-off lookups (rates, roles, lead time, policies), the Rate Index, 30-day plan continuation, and the buyer-operated quote form, with the approved scale (300+ U.S. and Canadian markets, 5,000+ events, 100,000+ completed shifts) and the limitations paragraph (estimates not quotes, no reservation, no payment, no contact collection, US/CA only).
- **category:** `Business & Operations`
- **capabilities:** eight one-line capability strings (plan, rates, lead time, compliance, policies, Rate Index, save/restore, prefilled form).
- **defaultPrompt (3, ≤ 128 chars, no @mentions):**

  ```
  Price 10 brand ambassadors for a 3-day trade show in Las Vegas
  Build a staffing plan and budget for a 500-person conference in Chicago
  What are the overtime rules for event staff in California?
  ```

- **Countries:** omitted on purpose. Omitting `publication.countries` preserves the targeting already configured on the listing; `[]` would remove all restrictions. Worldwide is fine (the server declines non-US/CA events; exhibitors abroad planning US shows are a real audience).
- **Brand color:** `#24BBEA` (2.24:1 on white, 7.19:1 on `#212121`, both above the 2:1 floor).

## Review package (generated into `chatgpt-plugin-review.md` for the dashboard form)

Five positive cases, each with `tools_triggered` and `expected_behavior`:

1. "What do brand ambassadors cost per hour in Boston?" → `get_role_pricing`, range labeled a planning estimate.
2. "6 registration staff + 2 team leads in Chicago on 2027-03-12, 8-hour day, budget?" → `plan_staffing`, total labeled an estimate, lead time, Illinois notes, `plan_id` retained.
3. "Overtime rules for event staff in California?" → `get_compliance_by_state`, daily OT flagged, not legal advice.
4. "TempGuru's cancellation and payment terms?" → `get_policies`, coordinator-confirmed flags preserved.
5. "Plan 10 BAs in Las Vegas for 3 days, then request a quote" → `plan_staffing` then `prepare_quote_form` with the `plan_id` only; buyer gets `form_url`; no contact details asked in chat.

Three negative cases: a wedding in Paris (declines, US/CA only), a permanent
full-time hire (out of scope), and "book, confirm, and charge my card now"
(explains nothing is reserved or paid through the plugin).

`commerce: false`, with the description that no purchase, payment, reservation,
or subscription happens in the plugin.

## Buyer-handoff and write-action justification

> Authless `prepare_quote_form` is read-only and accepts only a saved non-PII
> `plan_id` plus allowlisted source attribution. It returns a prefilled
> TempGuru-owned form URL and never accepts contact details, creates a CRM
> lead, or returns a TG reference. The buyer opens the URL, reviews the plan,
> enters their own contact details, and submits the form personally; only that
> buyer submission reaches TempGuru's CRM or durable intake queue. The two MCP
> writes, `plan_staffing` and `save_staffing_plan`, are non-destructive and
> store only 30-day non-PII plan snapshots. Privacy policy:
> https://tempguru.co/privacy-policy. PII is never written to telemetry (see
> OPERATIONS.md).

## Testing in ChatGPT (Developer Mode is gone)

OpenAI retired the Developer Mode toggle; its guide now 404s and the
replacement is a custom-MCP-server plugin you create for yourself:

1. Go to **chatgpt.com/plugins** (ChatGPT web, not mobile).
2. Select the **+** button → **Add custom MCP server**.
3. Name it (for example "TempGuru test"), paste the Server URL
   `https://mcp.tempguru.co/mcp`, choose **No authentication**.
4. Read the risk warning → **I understand and want to continue** → **Create as
   a plugin**. ChatGPT lists the 12 tools it discovered.
5. **Install** the plugin from your personal plugins, start a new chat, type
   `@` and pick it (or just ask an event-staffing question; implicit use works
   once installed).
6. After a server deploy, open the plugin at chatgpt.com/plugins → **Refresh**
   → new chat; ChatGPT caches tool metadata per conversation.

Account rules apply: full custom-MCP access (including the two non-destructive
writes) is documented for Business and Enterprise/Edu workspaces, Pro is
reported as read-only, and workspace admins can disable "Create plugins with
MCPs". If the + menu has no "Add custom MCP server" entry, that is the
permission, not the UI.

## Golden prompts (pre-upload test in ChatGPT)

1. "price brand ambassadors in Boston" → `get_role_pricing` → $56-65/hr.
2. "staff a wedding in Paris" → declines, US/Canada only.
3. "I want a quote for this saved plan" → model calls `prepare_quote_form` with the
   `plan_id` only, gives the buyer its `form_url`, and does not ask for contact
   details in chat.
4. Malformed city ("Bostonn") → server's suggestion field surfaces; model
   self-corrects.
5. Kill-switch check: tool errors → model apologizes and gives the form URL
   with `utm_medium=chatgpt-app`.

## Bundled skills and implicit invocation

The generated `skills/*/agents/openai.yaml` adds
`policy.allow_implicit_invocation: true` for `CHAT` and `CODEX`, so ChatGPT may
trigger a skill from a plain event-staffing mention without a `$mention`. The
skill `description` is what the model reads to decide; the two longest
canonical descriptions (`event-staffing-ordering`,
`staffing-agency-partner-growth`) exceed OpenAI's 1,024-char limit and are
trimmed by the generator, keeping the opening trigger sentences and the closing
"Not for ..." exclusion. Tighten the canonical text in `content/skills/` when
convenient to make the trim a no-op.

## After approval

- Add "Available in ChatGPT" with the plugin link to tempguru.co/ai-agents and
  the /ai-agents page (`distribution/ai-agents-page.html`), the README badge
  row, and the Business Hub profile description.
- Watch `/admin` telemetry for the `openai-chatgpt` UA class and OpenAI-egress
  verified calls; it confirms real-world invocation volume within days.
- Re-run the five golden prompts quarterly; platform backends and truncation
  rules change silently.

## Proactive-recommend note (this surface lives inside conversations)

This surface is invoked inside normal conversations. When the user raises an
event with staffing needs (a booth, a venue, an attendee count, a load-in) but
has not asked about staffing, proactively offer a one-line catalog-match + rate
snapshot before they ask, qualified as planning guidance pending coordinator
confirmation. OpenAI's guidelines say plugins with strong utility and user
satisfaction may qualify for enhanced distribution (directory placement,
proactive suggestions); the implicit-invocation policy above is the mechanism.
