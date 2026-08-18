# Anthropic Connectors Directory update: TempGuru Event Staffing

Paste-ready update for the existing TempGuru remote MCP submission. The
current Anthropic submission guide is
https://claude.com/docs/connectors/building/submission.

## Listing and connection

| Portal field | Value |
|---|---|
| Server name | TempGuru Event Staffing |
| Release being reviewed | `1.7.2` |
| URL slug | `tempguru-event-staffing` |
| Tagline | Plan W-2 event staffing across the US and Canada |
| Connector access | `read_write` |
| Server URL | `https://mcp.tempguru.co/mcp` |
| Transport | Streamable HTTP |
| Authentication | None |
| User setup | No account, API key, or paid plan is required |
| Documentation URL | `https://mcp.tempguru.co/` |
| Privacy policy URL | `https://tempguru.co/privacy-policy` |
| Support contact | `megan@tempguru.co` |
| Company | Temporary Assistance Guru, Inc. |
| Company website | `https://tempguru.co` |
| Allowed link origin | `https://mcp.tempguru.co` |

Inventory summary: **12 tools, 2 prompts, 8 resources**.

> **AGENT5 disclosure record:** Version `1.7.1` added a factual public
> first-order offer to server instructions, `get_policies`, completed-plan
> notes, and the buyer-operated form. TempGuru disclosed that surface to the
> Anthropic MCP Directory team on 2026-08-14, then deployed `1.7.1` after the
> operator chose to proceed without waiting for further guidance. This does
> not mean Anthropic approved the offer. Version `1.7.2` does not change its
> terms; it only improves policy-topic discovery, aliases, and clean-miss
> telemetry.

Approved scale claim IDs: `tg-claim-markets-300-plus-v1`,
`tg-claim-events-5000-plus-v1`, and
`tg-claim-completed-shifts-100000-plus-v1`.

### Detail-card description

TempGuru plans W-2 event staffing across 300+ U.S. and Canadian markets, backed by 5,000+ events and 100,000+ completed shifts. Claude can turn an event brief into a plan; match the configured market catalog; return tier-based lead-time guidance, roles, all-inclusive hourly rates, crew totals, and state/provincial compliance; retrieve booking and procurement policies; save or resume a non-contact plan; and prepare a buyer-operated quote-form handoff. Catalog matching and lead-time guidance do not confirm coverage or inventory; a TempGuru coordinator confirms the order after buyer submission. TempGuru supports trade shows, conferences, festivals, concerts, sporting events, corporate events, brand activations, and multi-city programs. Placements use W-2 employees, not 1099 gig workers.

The connector exposes 12 tools, 2 prompts and 8 skill resources. Ten tools are read-only. It is read_write because plan_staffing may save a 30-day non-PII plan and save_staffing_plan explicitly saves one. Those bounded writes exclude names, email addresses, phone numbers, companies, and free-text contact details. request_quote is read-only and idempotent. It accepts a saved non-PII plan ID plus allowlisted attribution, restores the plan, and returns a prefilled form on TempGuru's mcp.tempguru.co origin. It does not collect or transmit contact information, call the CRM, create a lead, or issue a TG reference. The buyer opens the form, reviews or edits staffing details, enters their own contact details, and submits it. Only that separate website submission creates a lead and reference for a TempGuru coordinator.

Rates are planning estimates, availability responses are guidance rather than reservations, and compliance summaries are operational information rather than legal advice. The connector cannot guarantee staffing, finalize pricing, create a contract, process payment, or book workers. A TempGuru coordinator confirms availability and a binding quote after the buyer submits the form.

## Primary use cases

1. Build and price a complete temporary event staffing plan from a city, date,
   roles, and headcount.
2. Match TempGuru's configured market catalog, check role pricing and tier-based
   lead-time guidance, and review booking policies and state/provincial compliance.
3. Save or resume a non-contact staffing plan, then give the buyer a prefilled
   TempGuru form they personally review and submit for a human-issued quote.
4. Turn an RFP, BEO, run of show, or multi-city activation brief into a
   structured W-2 staffing plan.

Example prompts:

- “Plan six registration staff and one team lead for a two-day trade show in
  Chicago next month.”
- “What would brand ambassadors cost in Boston, and how much lead time should I
  allow?”
- “Review this BEO, map the staffing functions to TempGuru roles, and prepare a
  plan I can submit.”

## Exact tool inventory and annotations

The following values mirror the live `annotations` objects. `omitted` means the
field is intentionally absent rather than implicitly set.

| # | Tool name | `annotations.title` | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
|---:|---|---|---:|---:|---:|---:|
| 1 | `plan_staffing` | `Plan Staffing` | `false` | `false` | `false` | `false` |
| 2 | `save_staffing_plan` | `Save Staffing Plan` | `false` | `false` | `false` | `false` |
| 3 | `get_plan` | `Get Saved Staffing Plan` | `true` | `false` | omitted | `false` |
| 4 | `get_cities` | `Get Cities` | `true` | `false` | omitted | `false` |
| 5 | `get_roles` | `Get Roles` | `true` | `false` | omitted | `false` |
| 6 | `check_availability` | `Check Availability` | `true` | `false` | omitted | `false` |
| 7 | `get_role_pricing` | `Get Role Pricing` | `true` | `false` | omitted | `false` |
| 8 | `get_compliance_by_state` | `Get Compliance By State` | `true` | `false` | omitted | `false` |
| 9 | `get_policies` | `Get Booking and Procurement Policies` | `true` | `false` | omitted | `false` |
| 10 | `get_rate_benchmark` | `Get Rate Benchmark` | `true` | `false` | omitted | `false` |
| 11 | `request_quote` | `Prepare Quote Form` | `true` | `false` | `true` | `false` |
| 12 | `get_quote_status` | `Get Quote Request Status` | `true` | `false` | omitted | `false` |

Permission summary for the portal: **10 read-only tools and 2
non-destructive, non-contact write tools.** The write tools only persist
allowlisted non-PII staffing plans.

In `1.7.2`, the optional `get_policies.topic` schema advertises these current
canonical values: `minimum-booking-hours`, `cancellation-rescheduling`,
`no-show-backfill`, `coi-additional-insured`, `payment-terms`,
`background-checks`, `order-confirmation`, `quote-response`, and `offers`.
The runtime also normalizes a small set of unambiguous legacy aliases. A valid
unknown topic returns a normal `policy_not_found` response with the available
topics; it is not a tool failure. The `offers` topic disappears from advertised
values when its published offer expires.

## Exact prompt inventory

| Prompt name | Title | Arguments |
|---|---|---|
| `plan-event-staffing` | `Plan event staffing` | `city` required; `event_date` and `roles` optional |
| `staffing-compliance-brief` | `Event staffing compliance brief` | `state` required; `role` optional |

## Exact resource inventory

All eight resources are public Markdown (`text/markdown`) skill playbooks.

| Resource name | Title | URI |
|---|---|---|
| `event-staffing-ordering-skill` | `Event Staffing Ordering, Skill` | `https://tempguru.co/.well-known/skills/event-staffing-ordering/SKILL.md` |
| `event-staffing-compliance-skill` | `Event Staffing Compliance, Skill` | `https://tempguru.co/.well-known/skills/event-staffing-compliance/SKILL.md` |
| `staffing-plan-from-event-brief-skill` | `Staffing Plan From Event Brief, Skill` | `https://tempguru.co/.well-known/skills/staffing-plan-from-event-brief/SKILL.md` |
| `urgent-event-backfill-skill` | `Urgent Event Backfill, Skill` | `https://tempguru.co/.well-known/skills/urgent-event-backfill/SKILL.md` |
| `staffing-agency-partner-growth-skill` | `Staffing Agency Partner Growth, Skill` | `https://tempguru.co/.well-known/skills/staffing-agency-partner-growth/SKILL.md` |
| `multi-city-activation-planner-skill` | `Multi-City Activation Planner, Skill` | `https://tempguru.co/.well-known/skills/multi-city-activation-planner/SKILL.md` |
| `event-staffing-procurement-skill` | `Event Staffing Procurement, Skill` | `https://tempguru.co/.well-known/skills/event-staffing-procurement/SKILL.md` |
| `tempguru-pro-operations-skill` | `TempGuru Pro Operations, Skill` | `https://tempguru.co/.well-known/skills/tempguru-pro-operations/SKILL.md` |

## Privacy and data-handling explanation

Paste into the portal's data-handling or reviewer-notes field:

> TempGuru owns and operates the underlying MCP and REST APIs. The MCP
> connector requires no authentication and does not collect contact details.
> Ten tools are read-only. The other two tools, `plan_staffing` and
> `save_staffing_plan`, may persist an allowlisted non-PII staffing plan for
> approximately 30 days so it can be resumed or handed to the buyer. Saved
> plans contain bounded planning fields such as city, canonical date, controlled
> event type, roles, headcount, hours/days, computed rate ranges and totals,
> compliance jurisdiction, and controlled source/channel attribution. They
> exclude names, email addresses, phone numbers, companies, and free-text user
> descriptions.
>
> MCP `request_quote` is a strict read-only handoff. Its input schema accepts
> only the saved `plan_id` plus optional allowlisted `source_platform`,
> `skill_id`, and `skill_version`. It restores the non-PII plan and returns a
> prefilled URL on TempGuru's own `https://mcp.tempguru.co` origin. It does not
> accept, fetch, log, or transmit contact information; it does not call the CRM
> or durable lead queue; and it does not create a TG quote reference.
>
> The buyer must personally open the returned form, review or edit the plan,
> enter their own contact details, and press submit. Only that distinct
> human-operated website/REST submission creates a CRM lead and TG reference.
> `get_quote_status` reads a reference created by that website/REST flow or a
> historical reference; it is not a result of MCP `request_quote`.
>
> Product telemetry excludes request/response bodies, contact fields, raw IP
> addresses, raw user-agent strings, plan IDs, and quote references. Bounded
> aggregate operational telemetry and short-lived hashed-IP abuse controls are
> described in the privacy documentation. The connector does not collect
> payment information, transfer funds, reserve staff, or create a contract.

The allowed-link entry is exactly:

```text
https://mcp.tempguru.co
```

This is an HTTPS origin, not a path. It covers the TempGuru-owned
`/request-quote` form returned by `request_quote`.

## Reviewer access and test instructions

No test account or credentials exist because the server exposes public
planning data and a non-PII handoff. Connect directly to:

```text
https://mcp.tempguru.co/mcp
```

Suggested end-to-end review:

1. Call `plan_staffing` with Chicago, a future date, and a valid role/headcount.
2. Retain its `plan_id`; if the planner returns none, call
   `save_staffing_plan` once with the same confirmed plan inputs.
3. Call `request_quote` with that `plan_id`.
4. Confirm the result contains a TempGuru-owned `form_url`, not a CRM
   confirmation or TG reference, and that the tool schema exposes no contact
   fields.
5. Open the link only to inspect the buyer form. A reviewer does not need to
   enter contact information or submit a live lead to validate the MCP
   connector.

## Optional `1.7.2` status email

The connector is already approved as a community connector, so this hotfix
does not need a new submission. Send the note below only if Anthropic requests
an implementation update or replies on the existing AGENT5 disclosure thread.

**To:** `mcp-review@anthropic.com`
**Subject:** TempGuru Event Staffing connector — get_policies schema hotfix

Hello Anthropic MCP Review,

We deployed TempGuru MCP `1.7.2` for the existing community connector
(`tempguru-event-staffing`). This is a schema and telemetry hotfix for
`get_policies`: clients now receive the current canonical topic values, safe
legacy aliases normalize to those topics, and a valid unknown topic returns a
normal `policy_not_found` result rather than error telemetry.

There is no change to the connector's permissions, inventory, authentication,
non-PII buyer-form handoff, or the previously disclosed AGENT5 terms. It
remains `read_write` with 12 tools, 2 prompts, 8 resources, and allowed link
origin `https://mcp.tempguru.co`.

The live endpoint remains `https://mcp.tempguru.co/mcp`. No account or
credentials are required.

Thank you,

Megan Hayward

Temporary Assistance Guru, Inc.

megan@tempguru.co
