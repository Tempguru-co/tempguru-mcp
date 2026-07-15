# Staffing plan handoff contract

`plan_staffing` returns a `continuation.form_url` for every complete plan. When
Redis persistence succeeds it also returns a 12-character `plan_id`; saved
plans expire after 30 days and contain planning data only, never contact data.

The website handoff target is `https://tempguru.co/get-staffing` with these
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
| `utm_medium` | Originating channel (`mcp` or `rest`). |

Only the `<plan>.<exp>` pair is signed. `city`, `dates`, and `roles` are convenience hints
and must be treated as untrusted input. When `plan`, `sig`, and `exp` are
present, the website should verify the signature and expiry, fetch the saved
snapshot from `GET https://mcp.tempguru.co/api/v1/plans/{plan}`, and prefer the
snapshot over modified query-prefill values. A missing/invalid/expired plan
must fall back to an ordinary editable form; it must never block submission.

The form should retain the attribution parameters and submit `plan_id` with
the quote request. It should not place contact information in the handoff URL
or in the saved plan.
