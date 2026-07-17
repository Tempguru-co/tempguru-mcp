# CRM attribution, receipts, and notification SLA — contract

_What the MCP repository emits today, what remains best-effort, and the ops/CRM
automation that must be built around it. Email, Slack/SMS, CRM-stage, and
revenue workflows run outside this repository._

## 1. Outcomes the repository emits

`request_quote` can finish in three persistence states:

- `captured: "notion"`: the Notion CRM lead was written during the request;
- `captured: "queued"`: the full lead was accepted into the 90-day durable
  Redis retry queue and Notion will be written by the drain; or
- `captured: "unpersisted"`: neither Notion nor the fallback queue accepted the
  lead. This is a failure and must never produce a success receipt.

For Notion-captured leads, and for queued leads after a successful drain, the
CRM record contains buyer contact fields, event details, roles/headcount, and a
Call Notes block with:

- `reference`, the crypto-random `TG-XXXXXX` code returned to the buyer;
- a `LEAD TRUST` block (`high`/`medium`/`low` plus reason flags);
- `source_platform`, `skill_id` (closed to the 8 canonical skills),
  `skill_version`, and `plan_id` when supplied; and
- `SOURCE: AI Agent (MCP)` or `AI Agent (REST)`.

The repository also emits non-PII funnel counters (`plans_created`,
`plans_resumed`, `quotes_submitted`, `quotes_linked`) plus allowlisted
source-platform/source-skill dimensions. Telemetry is best-effort and can drop
after its time cap, so it is a directional product signal, not a financial or
CRM ledger.

## 2. Webhook reliability boundary

When `LEAD_WEBHOOK_URL` is set, the repository attempts a time-capped webhook
with the lead, `reference`, and `captured` state. Today that hook is
best-effort: errors/timeouts are swallowed, non-2xx status is not a durable
retry contract, and the payload is not versioned or signed. It must not be the
sole trigger for a receipt or a 15-minute alert SLA.

Before treating the webhook as a reliable automation bus, add a typed/versioned
payload, HMAC signature, non-2xx handling, durable outbox/retry, idempotency key,
and tests. Until then, ops should use Notion polling/automation as the reliable
path and treat the webhook as an acceleration hint. A queued lead must reach
Notion through the repository drain before a Notion-only automation can see it.

## 3. Transactional buyer receipt (ops-side)

- **Reliable trigger:** a Notion lead creation, or a future durable webhook event
  with `captured: notion|queued`; never `unpersisted`.
- **Send target:** buyer `contact_email`, ideally within two minutes.
- **Content:** `reference`, a human-readable event/roles recap, and any estimate
  labeled as a planning estimate rather than a binding quote. Preserve the
  one-business-day coordinator response, 48-hours-after-approval confirmation,
  and no-payment-until-approval language.
- **Queued wording:** if a durable webhook triggers before CRM delivery, say the
  request was safely queued for coordinator intake, not already present in the
  CRM.
- **Idempotency:** deduplicate by `reference`.

## 4. Staff-alert SLA (ops-side)

- Notify the coordinator channel within a target 15 minutes with `reference`,
  capture state, trust level, city/dates, and source platform/skill.
- Route low-trust leads through verification before outreach.
- Escalate if the Notion Deal Stage remains `Lead` for one business day; `Lead`
  is the stage created by the current integration (not `New`).
- Expose received/queued status consistently with `get_quote_status`.

## 5. Plan → won → revenue attribution (ops-side)

- Carry `reference` and optional `plan_id` as join keys.
- Promote `source_platform`, `skill_id`, `skill_version`, `plan_id`, and trust
  level from Call Notes to verified first-class CRM properties before writing
  them from code.
- Extend the repository funnel with CRM-owned `quote_sent → won/lost → revenue`
  transitions.
- Report platform × skill × {leads, quoted, won, revenue}, using the CRM as the
  authoritative ledger. Compare telemetry directionally; do not assert it must
  be greater than or equal to CRM totals.

## 6. Configuration and ownership

- `LEAD_WEBHOOK_URL`: optional best-effort notification target today; do not
  advertise SLA delivery until the durable contract above ships.
- `CRON_SECRET`: protects the bounded pending-lead drain that advances queued
  records to Notion.
- Notion first-class properties must be created and their names/types verified
  before the repository integration writes attribution into them.
- Email/Slack/SMS provider configuration, receipts, escalations, stage changes,
  and revenue automation remain external ops work.
