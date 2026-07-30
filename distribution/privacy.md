# TempGuru MCP and agent-tools privacy addendum (draft)

_Last updated: 2026-07-29. Repository source for an MCP-specific addendum to
TempGuru's comprehensive [Privacy Policy](https://tempguru.co/privacy-policy).
This draft does not replace that policy. It requires privacy/legal review before
it is incorporated at the canonical `/privacy-policy` URL or linked from a
marketplace listing._

TempGuru (Temporary Assistance Guru, Inc.) publishes an MCP server
(`https://mcp.tempguru.co/mcp`) and a REST surface that let AI agents plan and
price event staffing across US and Canadian markets, then hand a buyer to a
TempGuru-owned form. This addendum documents the data flows specific to those
public agent tools and distinguishes the MCP handoff from the buyer's later
website submission.

## Read operations and operational metadata

Ten tools (`get_plan`, `get_cities`, `get_roles`,
`check_availability`, `get_role_pricing`, `get_compliance_by_state`,
`get_policies`, `get_rate_benchmark`, `get_quote_status`, and `request_quote`)
are read-only. `request_quote` requires a saved non-PII `plan_id`, accepts only
optional allowlisted platform/skill attribution, and returns a prefilled
TempGuru-owned form link. `plan_staffing` and `save_staffing_plan` are
non-destructive non-contact writes because they may create the 30-day plan
snapshot described below. These tools' business inputs are limited to planning
and catalog fields such as city, event date, role, headcount, state, plan ID,
quote reference, and controlled attribution.

As with any hosted service, infrastructure receives network metadata such as
an IP address and user-agent while processing a request. The application does
not put raw IP addresses, raw user-agent strings, request bodies, response
bodies, or free-text user content into product telemetry. It does retain:

- daily non-PII counters with a 90-day application TTL;
- a bounded ring of the last 200 operational events (timestamp, tool, coarse
  client class/country, success status, and canonical city/role/state
  dimensions). It evicts by count but does not currently have a fixed age TTL;
  a separate date-only index also has no fixed application TTL;
- short-lived, truncated SHA-256 hashes of client IP addresses for public-tool
  abuse limits, normally for about one hour; and
- hosting/server logs under the retention and processor terms of the main
  Privacy Policy.

These controls reduce identifiability, but hashed IPs and event-level metadata
should be treated as pseudonymous operational data rather than described as
categorically anonymous.

## Saved plans and quote-status records

`plan_staffing` may return a `plan_id` that restores a plan for about 30 days.
The saved snapshot is deliberately allowlisted to city, dates, event type,
roles, headcount, computed rate ranges, channel, and controlled source tag. It
does not store contact details or the user's free-text description.

Quote-status stubs retain a TG reference and limited received/queued status
metadata for up to 90 days. Those references come from buyer-submitted
website/REST requests or historical REST requests, not from MCP
`request_quote`. The stubs do not contain the buyer's contact details.

## MCP `request_quote` does not collect personal information

`request_quote` is a read-only, idempotent handoff tool. After a buyer confirms
a saved plan, the agent may send:

- the saved 12-character non-PII `plan_id` (required); and
- optional allowlisted `source_platform`, `skill_id`, and `skill_version`
  attribution.

The tool restores the allowlisted saved plan and returns a `form_url` on
`https://mcp.tempguru.co`. It does not accept, fetch, log, or transmit a name,
email address, phone number, company, or other contact details. It does not
write to TempGuru's CRM or fallback queue, send a lead notification, or create
a TG quote reference. If plan storage was unavailable and no `plan_id` exists,
the agent uses the `continuation.form_url` returned with the completed plan
directly; the same no-contact boundary applies.

## Buyer-operated website and REST submission

The buyer must personally open the returned form, review and edit the plan,
enter their own contact details, and press submit. Only then does the website
call `POST /api/v1/quote-requests`. That separate browser/REST request may
collect contact and event fields needed for coordinator follow-up, create a CRM
lead or durable retry record, and return a TG reference. It is governed by the
main Privacy Policy and the website's disclosures and consent controls; it is
not performed by the MCP connector.

Buyer-submitted quote-request fields are not written to MCP product telemetry
or analytics. Neither the MCP handoff nor the website form collects payment
information, reserves staff, creates a contract, or guarantees pricing or
availability.

## Retention summary

- CRM lead records created by the buyer's website/REST submission: retained
  under the customer/operational-record rules in the main Privacy Policy and
  applicable legal requirements.
- Full-PII fallback queue records created by the buyer's website/REST
  submission: up to 90 days, expiring independently even if a queue index is
  stale.
- Saved non-contact plan snapshots: about 30 days.
- Limited quote-status stubs: up to 90 days.
- Application telemetry: daily keys up to 90 days; recent-event ring capped at
  200 rows but not currently age-expired; the date-only active-day index is not
  currently age-expired.
- Rate-limit IP hashes: normally about one hour.
- Infrastructure logs/backups: governed by the main Privacy Policy and provider
  retention settings.

## Choices and privacy contact

Before `request_quote`, the buyer should review and confirm the non-PII staffing
plan. The agent must not ask for contact details for the MCP call. After the
handoff, the buyer decides whether to open the form and must personally review,
enter contact details, and submit. Declining the form does not affect access to
the planning and lookup tools.

Privacy-rights requests should go to **privacy@tempguru.co** or the Privacy
Officer channels in the main Privacy Policy. Sales contact details may still be
used for quote follow-up, but are not the canonical privacy-rights channel.

## Deployment checklist

1. Privacy/legal review this addendum against the deployed Vercel, Upstash,
   Notion, and notification-provider contracts and retention settings.
2. Amend the comprehensive `/privacy-policy`; do not publish this as a competing
   standalone replacement at `/privacy`.
3. Update the policy's subprocessor and retention tables for the providers and
   website/REST queue/status data actually in use; do not describe MCP
   `request_quote` as sending contact data.
4. Point MCP/App marketplace privacy links to the amended canonical policy.
5. Add age-based pruning for the recent-event ring and active-day index, or
   preserve the count/date-only disclosure above instead of claiming a blanket
   90-day telemetry retention period.
