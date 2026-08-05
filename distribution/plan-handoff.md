# Staffing plan handoff contract

`plan_staffing` returns a `continuation.form_url` for every complete plan. When
Redis persistence succeeds it also returns a 12-character `plan_id`; saved
plans expire after 30 days and contain planning data only, never contact data.

The buyer handoff target is `https://mcp.tempguru.co/request-quote` with these
query parameters:

| Parameter | Meaning |
|---|---|
| `plan` | Saved 12-character plan ID. Optional when persistence failed open. |
| `sig` | Lowercase HMAC-SHA256 hex signature of `<plan>.<exp>` using `PLAN_LINK_SECRET`. Omitted when the secret is unset. |
| `exp` | Unix expiry in seconds, capped at the saved plan's original 30-day expiry. Omitted when the secret is unset. |
| `city` | Human-readable city prefill. |
| `dates` | Canonical `YYYY-MM-DD` event-date prefill, when the supplied date was safely parseable. |
| `roles` | Compact comma-separated `role-slug:headcount` pairs. |
| `utm_source` | Always `ai-agent`. |
| `utm_medium` | Normalized agent runtime/platform when known; otherwise the originating channel (`mcp` or `rest`). |
| `utm_content` | Underlying channel when `utm_medium` carries a controlled runtime source. |
| `utm_campaign` | `quote-handoff` when the URL was resolved through MCP `request_quote`. |
| `source_platform` | Optional normalized runtime attribution inferred from the interactive MCP request or added by `request_quote`. |
| `skill_id` | Optional allowlisted canonical TempGuru skill ID added by `request_quote`. |
| `skill_version` | Optional bounded skill version added by `request_quote`. |

Only the `<plan>.<exp>` pair is signed. `city`, `dates`, and `roles` are convenience hints
and must be treated as untrusted input. When `plan`, `sig`, and `exp` are
present, the website should verify the signature and expiry, fetch the saved
snapshot from `GET https://mcp.tempguru.co/api/v1/plans/{plan}`, and prefer the
snapshot over modified query-prefill values. A missing/invalid/expired plan
must fall back to an ordinary editable form; it must never block the buyer
from entering the plan themselves.

MCP `request_quote` accepts only a saved `plan_id` plus the three optional
allowlisted attribution fields above. It restores the plan and returns this
URL; it never accepts contact details, calls the CRM, creates a lead, or
returns a TG reference. If plan persistence failed and there is no `plan_id`,
the agent must give the buyer the completed plan's `continuation.form_url`
directly instead of calling `request_quote`.

The buyer must open the form, review and edit the plan, enter their own contact
details, and press submit personally. The form retains the allowlisted
`source_platform`, skill fields, and four UTM parameters and submits them with
`plan_id` in its separate website REST request. Unknown, duplicate, overlong,
or free-text attribution values are discarded. Only that buyer-operated REST
submission creates a lead and TG reference. Contact information must never
appear in the handoff URL or saved plan.
