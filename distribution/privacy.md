# TempGuru event-staffing tools — privacy

_Last updated: 2026-07-15. Canonical source: this repository. Deploy this text
to the public privacy surface (website `/privacy`, the agent-skills repo, and
any marketplace listing that links a privacy policy)._

TempGuru (Temporary Assistance Guru, Inc.) publishes an MCP server
(`https://mcp.tempguru.co/mcp`) and a REST mirror that let AI agents plan,
price, and request event staffing across US and Canadian markets. This notice
describes what those tools collect and what happens to it. It is not legal
advice; compliance data the tools return is operational guidance, not legal
advice.

## Read-only tools collect no personal data

`plan_staffing`, `get_plan`, `get_cities`, `get_roles`, `check_availability`,
`get_role_pricing`, `get_compliance_by_state`, `get_policies`,
`get_rate_benchmark`, and `get_quote_status` are read-only. Their inputs — a
city, dates, roles, headcount, a state code, a plan or quote reference — are
not personal information, and nothing a caller sends to them is stored against
an identity.

## `request_quote` **does** collect personal data and writes a CRM record

`request_quote` is the one write tool. It is opt-in and is only called after
the user explicitly confirms they want to send their details to TempGuru. When
called, it collects and transmits to TempGuru's CRM:

- **contact name, email address, and (optionally) phone number;**
- **company / organization name;**
- event name, event type, city, and dates;
- roles, headcount, and any shift, attire, budget, or special-requirement notes
  the user provides.

This information is written to TempGuru's customer-relationship system (Notion)
so a human coordinator can respond with a quote, and it may be sent to an
internal TempGuru notification endpoint so staff are alerted to the new
request. It is used to prepare and deliver the quote and to coordinate the
event. It is **not sold**, and it is not shared beyond TempGuru and the local
staffing partners needed to fulfill an event. Submitting a request is not a
reservation, contract, or payment; **no payment information is collected by
these tools.**

## Aggregate telemetry contains no personal data

TempGuru records aggregate, non-identifying usage counts (which tool was
called, a coarse client class, country, and canonical city/role/state
dimensions). It **never** stores a raw user-agent string, name, email, phone
number, or any free-text a caller supplies; unrecognized values collapse into
fixed diagnostic buckets. Telemetry cannot be tied back to an individual.

## Saved plans (`plan_id`) contain no personal data

`plan_staffing` may return a `plan_id` that restores a saved plan for about 30
days. That snapshot holds only the non-personal shape of the plan — city,
dates, roles, headcount, and computed rate ranges. It contains **no** contact
information, so a `plan_id` alone can never expose who created it.

## Retention

- CRM lead records: retained as long as needed to serve the customer
  relationship; deletion available on request.
- Saved plan snapshots: ~30 days, then automatically expire.
- Aggregate telemetry: ~90 days; non-personal throughout.

## Your choices and contact

To request access to, correction of, or deletion of a quote request you
submitted, contact **megan@tempguru.co** or **(904) 206-8953**. Because the
read-only tools store nothing about you, requests concern only `request_quote`
submissions.
