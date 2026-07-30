# Anthropic Connectors Directory update: TempGuru Event Staffing

Paste-ready update for the existing TempGuru remote MCP submission. The
current Anthropic submission guide is
https://claude.com/docs/connectors/building/submission.

## Listing and connection

| Portal field | Value |
|---|---|
| Server name | TempGuru Event Staffing |
| Release being reviewed | `1.7.0` |
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

### Detail-card description

TempGuru helps buyers plan W-2 temporary event staffing across 345 US and
Canadian markets. Claude can build a complete staffing plan, confirm market
coverage, estimate all-inclusive role rates, assess lead-time guidance, surface
state and provincial compliance considerations, retrieve booking and
procurement policies, save or resume a non-contact plan, and prepare a
buyer-operated quote-form handoff.

The connector exposes 12 tools: 10 read-only tools and 2 non-destructive,
non-contact plan-persistence writes. It is correctly classified `read_write`
because `plan_staffing` may best-effort save a 30-day non-PII plan and
`save_staffing_plan` explicitly saves one. `request_quote` is itself read-only
and idempotent. It requires a saved non-PII `plan_id`, accepts only optional
allowlisted platform/skill attribution, and returns a prefilled TempGuru-owned
form link. It never collects or transmits contact details and never creates a
CRM lead or quote reference. The buyer opens the form, reviews the plan, enters
their own contact details, and submits it personally. Only that website/REST
submission creates the lead and TG reference.

Rates are planning estimates, availability results are lead-time guidance, and
compliance summaries are general operational information rather than legal
advice. The connector does not reserve staff, create a contract, process
payment, or guarantee pricing or availability.

## Primary use cases

1. Build and price a complete temporary event staffing plan from a city, date,
   roles, and headcount.
2. Check live TempGuru market coverage, role pricing, lead-time guidance,
   booking policies, and state/provincial compliance context.
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

## Concise reply email

**To:** `mcp-review@anthropic.com`
**Subject:** TempGuru Event Staffing connector — updated non-PII handoff contract

Hello Anthropic MCP Review,

We updated the existing TempGuru Event Staffing submission
(`tempguru-event-staffing`) to remove agent-side contact collection and CRM
submission from MCP. `request_quote` is now a strict read-only, idempotent
handoff: it accepts only a saved non-PII `plan_id` plus optional allowlisted
attribution and returns a TempGuru-owned buyer form URL. The buyer must enter
their own contact details and submit the form personally; only the website REST
flow creates a lead or TG reference.

The connector remains `read_write` because `plan_staffing` and
`save_staffing_plan` may persist non-contact plans. The live inventory is 12
tools (10 read-only, 2 non-destructive non-contact writes), 2 prompts, and 8
resources. Allowed link origin: `https://mcp.tempguru.co`.

Please use the updated submission details and re-review the live endpoint at
`https://mcp.tempguru.co/mcp`. No account or credentials are required.

Thank you,

Megan Hayward

Temporary Assistance Guru, Inc.

megan@tempguru.co
