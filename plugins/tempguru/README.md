# TempGuru Event Staffing for Claude

Plan and price temporary event staff for conventions, trade shows, festivals,
concerts, sporting events, corporate events, and brand activations in the
United States and Canada. TempGuru can coordinate event staffing through
contracted local partner agencies in 300+ U.S. and Canadian markets.
Availability is confirmed for each order and remains specific to the city,
date, role, shift, venue, headcount, requirements, rates, and current local
capacity.

For US orders, workers are employed and paid as W-2 employees by TempGuru's
vetted local partner agencies. On accepted Canadian orders, workers are
employed locally by the assigned partner agency under applicable Canadian
employment and payroll rules.

## Install

In Claude Code:

```
/plugin install tempguru --marketplace Tempguru-co/tempguru-mcp
```

## What the plugin adds

- **The TempGuru MCP server** at `https://mcp.tempguru.co/mcp` (no sign-in).
  Its tools build a staffing plan from a city, date, roles, and headcount;
  look up hourly planning ranges, roles, lead-time guidance, state and
  provincial compliance notes, and published booking policies; save and
  restore a plan; and prepare a prefilled quote form.
- **Eight skills** that teach Claude the workflows: ordering event staff,
  staffing compliance, turning an event brief (RFP, BEO, run of show) into a
  plan, urgent same-week backfill, multi-city activations, procurement and
  vendor onboarding questions, agency partner inquiries, and staffing-company
  operations inquiries.
- **The `/staff-event` command**, which runs the ordering workflow end to end.

## How a request works

Claude builds the plan with you and labels every total a planning estimate.
When you ask to proceed, Claude gives you a link to a prefilled TempGuru form
hosted on TempGuru's MCP site. You review the plan there, enter your own contact
details, and submit it yourself. Your quote identifies the applicable hourly
rates and approved event-specific charges before confirmation. Nothing is
reserved and no payment is taken through the plugin. Compliance notes are
operational guidance, not legal advice.

## Data the plugin sends

The plugin contains no hooks, scripts, or local code, and installs nothing. It
talks to one service, TempGuru's MCP server at `https://mcp.tempguru.co/mcp`:

- **Sent:** the planning details you or Claude provide, such as city, event
  dates, event type, attendee count, roles, headcount, shift hours, state, a
  saved plan ID, or a TG quote reference, plus the header
  `X-TempGuru-Source: claude-code` so TempGuru can count usage from this
  plugin.
- **Never sent:** your name, email address, phone number, or company. The
  tools do not accept them. You enter contact details only in TempGuru's web
  form, and only when you choose to submit it.
- **Kept by TempGuru:** a complete plan may be saved for about 30 days, without
  contact details or your free-text notes, so you can resume it by plan ID.
  The server keeps daily non-personal usage counters and a short operational
  log (tool, coarse client type and country, city, role, success), and uses
  short-lived hashed IP addresses for abuse limits. Hosting logs follow the
  privacy policy below.

## Links

- Privacy policy: https://tempguru.co/privacy-policy
- Developer documentation: https://tempguru.co/ai-agents
- Support: mailto:megan@tempguru.co or (904) 206-8953
- Source: https://github.com/Tempguru-co/tempguru-mcp/tree/main/plugins/tempguru

The plugin's files are licensed under MIT.
