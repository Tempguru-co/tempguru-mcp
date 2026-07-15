# CRM attribution, receipts, and notification SLA — spec

_What the MCP repo already emits, and the ops/CRM automation that must be built
on top of it. The automation itself runs in TempGuru's Notion + notification
stack, **not** in this repository — this doc is the data contract between the
two so they don't drift._

## 1. What this repo already emits (the integration surface)

Every successful `request_quote` (MCP or REST) produces, via
`src/lib/notion/create-lead.ts`:

**A Notion CRM lead record** containing the buyer PII (name/email/phone,
company), the event (name/type/city/dates), the roles+headcount, and a
**Call Notes** block that already includes:

- `reference` — the crypto-random `TG-XXXXXX` code returned to the buyer.
- a **LEAD TRUST** block (`high`/`medium`/`low` + reason flags) from
  `lead-trust.ts`, so ops can triage before outreach.
- an **ATTRIBUTION** line carrying, when supplied: `source_platform`
  (canonical allowlist — chatgpt-gpt, claude-desktop, coze, …), `skill_id`
  (one of the five canonical skills), `skill_version`, and `plan_id`.
- `SOURCE: AI Agent (MCP)` or `AI Agent (REST)`, derived from the channel.

**An outbound webhook** (best-effort, time-capped) to `LEAD_WEBHOOK_URL` when
set. The payload is the lead itself (contact + event + roles) plus `reference`.
**This webhook is the trigger the automations below should consume.**

**Aggregate funnel telemetry** (non-PII counts) keyed by day:
`plans_created`, `plans_resumed`, `quotes_submitted`, `quotes_linked`, plus
`source-platforms:{date}` and `source-skills:{date}` for successful quote
leads. See `src/lib/telemetry/track.ts`.

## 2. Transactional buyer receipt (to build in ops)

- **Trigger:** `LEAD_WEBHOOK_URL` fires with a new lead.
- **Send:** an email to the buyer's `contact_email` immediately (target < 2
  min), from a TempGuru sender, subject referencing `reference`.
- **Body:** confirmation that the request was received, the `reference`, a
  human-readable recap of the plan (city, dates, roles+headcount, estimated
  range if present — labeled a **planning estimate, not a binding quote**), and
  the "coordinator responds within one business day / orders confirmed within
  48h of approval / no payment until approval" language already in
  `quoteSubmittedPayload`.
- **Idempotency:** de-dupe on `reference` so a webhook retry can't double-send.

## 3. Staff-alert SLA (to build in ops)

- **Trigger:** same webhook.
- **Alert:** notify the coordinator channel (email/Slack/SMS) within a target
  **15 minutes**, including `reference`, trust level, city/dates, and
  `source_platform`/`skill_id`.
- **Escalation:** if the CRM record is not moved out of "New" within **1
  business day**, escalate. `low`-trust leads route to a verify step before
  outreach (the trust block already says so).
- **Status link:** expose a status the buyer can poll; the repo already ships
  `get_quote_status` (received vs durably queued) — surface the same states in
  the receipt/portal.

## 4. Plan → won → revenue attribution (to build in ops)

The repo tags the front of the funnel; ops must close the loop:

- **Key:** carry `reference` (and `plan_id` when present) as the join key on the
  CRM deal. `source_platform` + `skill_id` + `skill_version` are already on the
  record — copy them to CRM properties (not just Call Notes) so they're
  filterable.
- **Funnel to extend:** the repo emits up to `quotes_submitted`/`quotes_linked`.
  Ops owns the later stages — `quote_sent → won/lost → revenue` — as CRM status
  transitions, attributed by the copied `source_platform`/`skill_id`.
- **Revenue sync:** on `won`, record deal value against the originating
  `source_platform`/`skill_id`/`plan_id` so Hermes vs ChatGPT vs ClawHub vs Pi
  can be compared on booked revenue, not just lead volume.
- **Report:** platform × skill × {leads, quoted, won, revenue}, reconciled
  monthly against the aggregate `source-platforms`/`source-skills` telemetry as
  a sanity check (telemetry counts should be ≥ CRM leads, never fewer).

## 5. Env / config the ops side needs

- `LEAD_WEBHOOK_URL` — set to the automation's ingest endpoint.
- Notion CRM properties for `reference`, `source_platform`, `skill_id`,
  `skill_version`, `plan_id`, trust level (promote from Call Notes text to
  first-class properties so they're filterable and reportable).
