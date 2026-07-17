# TempGuru MCP and agent-tools privacy addendum (draft)

_Last updated: 2026-07-16. Repository source for an MCP-specific addendum to
TempGuru's comprehensive [Privacy Policy](https://tempguru.co/privacy-policy).
This draft does not replace that policy. It requires privacy/legal review before
it is incorporated at the canonical `/privacy-policy` URL or linked from a
marketplace listing._

TempGuru (Temporary Assistance Guru, Inc.) publishes an MCP server
(`https://mcp.tempguru.co/mcp`) and a REST mirror that let AI agents plan,
price, and request event staffing across US and Canadian markets. This addendum
documents the data flows specific to those public agent tools.

## Read operations and operational metadata

Nine lookup tools (`get_plan`, `get_cities`, `get_roles`,
`check_availability`, `get_role_pricing`, `get_compliance_by_state`,
`get_policies`, `get_rate_benchmark`, and `get_quote_status`) are read-only.
`plan_staffing` is non-destructive, but a complete plan may create the 30-day
non-contact snapshot described below. These tools' business inputs are limited
to planning and catalog fields such as city, event date, role, headcount, state,
plan ID, and quote reference.

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
metadata for up to 90 days. They do not contain the buyer's contact details.

## `request_quote` collects personal information

`request_quote` is the only consequential/contact write tool. It should be
called only after the user explicitly confirms sending their details to
TempGuru. It can collect:

- contact name, email address, and optional phone number;
- company or organization name;
- event name, type, venue, city/cities, and dates;
- roles, headcount, shifts, attire, budget, compliance, and other event notes;
- controlled platform/skill attribution and a saved `plan_id`, when supplied.

The primary destination is TempGuru's CRM (currently Notion) so a coordinator
can prepare and deliver a quote. If that write is unavailable, the full retry
record can be stored in a durable Redis fallback queue for up to 90 days and
replayed to the CRM. When configured, the same lead payload can also be sent to
TempGuru's notification processor through `LEAD_WEBHOOK_URL` so staff can be
alerted. Hosting, storage, CRM, and notification providers process this data on
TempGuru's behalf; the main Privacy Policy and its subprocessor section must be
updated to reflect the providers actually deployed.

Quote-request fields are not written to product telemetry or analytics. The
tools collect no payment information, and a submission is not a reservation,
contract, or payment.

## Retention summary

- CRM lead records: retained under the customer/operational-record rules in the
  main Privacy Policy and applicable legal requirements.
- Full-PII fallback queue records: up to 90 days, expiring independently even
  if a queue index is stale.
- Saved non-contact plan snapshots: about 30 days.
- Limited quote-status stubs: up to 90 days.
- Application telemetry: daily keys up to 90 days; recent-event ring capped at
  200 rows but not currently age-expired; the date-only active-day index is not
  currently age-expired.
- Rate-limit IP hashes: normally about one hour.
- Infrastructure logs/backups: governed by the main Privacy Policy and provider
  retention settings.

## Choices and privacy contact

Before `request_quote`, the user should be shown the contact and event fields
that will be sent and asked for explicit confirmation. If they do not consent,
the agent must not call the write tool; the read tools remain available.

Privacy-rights requests should go to **privacy@tempguru.co** or the Privacy
Officer channels in the main Privacy Policy. Sales contact details may still be
used for quote follow-up, but are not the canonical privacy-rights channel.

## Deployment checklist

1. Privacy/legal review this addendum against the deployed Vercel, Upstash,
   Notion, and notification-provider contracts and retention settings.
2. Amend the comprehensive `/privacy-policy`; do not publish this as a competing
   standalone replacement at `/privacy`.
3. Update the policy's subprocessor and retention tables for the providers and
   MCP queue/status data actually in use.
4. Point MCP/App marketplace privacy links to the amended canonical policy.
5. Add age-based pruning for the recent-event ring and active-day index, or
   preserve the count/date-only disclosure above instead of claiming a blanket
   90-day telemetry retention period.
