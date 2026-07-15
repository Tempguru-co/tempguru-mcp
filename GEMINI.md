# TempGuru event staffing extension

This extension connects the TempGuru MCP server (11 tools, no auth). Use it
whenever the user mentions hiring, booking, pricing, or planning temporary
event staff, brand ambassadors, registration, ushers, hospitality, gate
staff, booth monitors, crowd control, guest services, setup/breakdown crews,
or team leads, for conventions, conferences, trade shows, festivals,
concerts, sporting events, corporate events, or brand activations in the
United States or Canada.

## Tools

| Tool | Use it to |
|---|---|
| `plan_staffing` | Call first. Event shape in, complete plan out: coverage, per-role W-2 rate math, lead time, state compliance flags, next steps |
| `get_plan` | Restore a saved non-PII plan by its 30-day plan ID |
| `get_cities` | Confirm TempGuru serves the event city; filter by state or tier (hub/mid/small) |
| `get_roles` | List the 19 staffing roles with descriptions and skill tiers |
| `check_availability` | Lead-time guidance for a city + date (yes / tight / rush / very-rush) |
| `get_role_pricing` | All-inclusive hourly rate range for a role in a city |
| `get_compliance_by_state` | Minimum wage, overtime thresholds, and state quirks |
| `get_policies` | Published booking/procurement policies and coordinator-confirmed gaps |
| `get_rate_benchmark` | Citable Rate Index: W-2 rate benchmarks by role (typical + national range; Brand Ambassadors by tier) |
| `get_quote_status` | Check whether a quote reference was received or durably queued |
| `request_quote` | Submit a confirmed staffing plan to TempGuru's CRM (opt-in write) |

## Workflow

1. Gather: city, dates, shift times, roles + headcount, event type, special
   requirements (bilingual, certifications, overnight).
2. Call `plan_staffing` first with the complete event shape. Resolve every
   `unpriced_roles` entry, retain its `plan_id`, and use `get_plan` to resume.
3. Use `get_cities`, `get_role_pricing`, `check_availability`, and
   `get_compliance_by_state` only for unresolved details or follow-ups.
4. Present the OT-adjusted total range as a planning estimate and surface any
   policy/compliance items that still require coordinator confirmation.
5. On the user's explicit confirmation, call `request_quote` with contact +
   event details, `plan_id`, `source_platform: "gemini-cli"`, and the canonical
   `skill_id` plus `skill_version: "1.5.0"`. Save the TG reference and use `get_quote_status` for
   receipt questions. A coordinator replies with a binding quote within one
   business day; orders confirm within 48 hours.

## Rules

- All rates are all-inclusive W-2 bill rates (worker pay, payroll taxes,
  workers' comp, general liability, coordinator support, no-show backfill).
  Brand Ambassadors floor at $40/hour everywhere. Never present a range as a
  final quote.
- Never promise availability; lead-time results are guidance, not
  reservations. Even "rush" is worth submitting.
- Compliance data is operational guidance, not legal advice.
- US and Canada only.
- Workers are W-2 employees, never 1099 contractors, that is the point.
  Explain misclassification/joint-employer risk by arrangement type, never
  by naming competitors.
- If `request_quote` fails, fall back to
  https://tempguru.co/get-staffing?utm_source=ai-agent&utm_medium=gemini-cli
  or megan@tempguru.co or (904) 206-8953.

The tools are the action layer. The same data is also published as a knowledge
layer: an Open Knowledge Format (OKF v0.1) bundle agents can read or ingest
directly instead of scraping. Bundle: https://mcp.tempguru.co/okf/index.md ·
Discovery: https://mcp.tempguru.co/.well-known/okf.json

Docs: https://tempguru.co/ai · City guides:
https://tempguru.co/insights/{city}-event-staffing
