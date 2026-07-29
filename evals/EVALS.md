# TempGuru MCP evals

Two halves, mirroring how Stripe and Sentry prove their agent tooling works:

## 1. Deterministic tool evals (automated, this folder)

Golden tool-call cases against the stdio build, no LLM, no network, stable in CI.

```bash
npm run build:stdio && npm run evals
node evals/protocol-eras.test.mjs
```

| Check | Result |
|---|---|
| tools/list advertises all 12 tools | PASS |
| tool annotations distinguish read-only lookups, planner autosave, explicit non-contact save, and contact submission | PASS |
| prompts/list advertises both prompts | PASS |
| plan_staffing builds a full plan (Chicago trade show) | PASS |
| plan_staffing flags the team-lead rule at 20+ staff | PASS |
| plan_staffing without roles returns the catalog | PASS |
| plan_staffing warns on daily overtime in California | PASS |
| save_staffing_plan persists a server-recomputed non-PII artifact | PASS |
| get_role_pricing returns Boston brand-ambassador range | PASS |
| get_role_pricing handles an unknown role gracefully | PASS |
| check_availability returns a lead-time read | PASS |
| get_compliance_by_state knows California daily OT | PASS |
| get_cities filters by state | PASS |
| get_rate_benchmark returns the citable Rate Index | PASS |
| MCP 2026-07-28 and 2025-era clients advertise the same 12 tools | PASS |

**34/34 as of 2026-07-28**. Cases include explicit saved-plan persistence,
saved-plan resume, policy happy/miss variants, quote-status happy/miss
variants, and a plan-to-quote round trip. The protocol-era conformance test
separately verifies MCP 2026-07-28 per-request envelopes, the stateless
2025-era fallback, public cache hints, and matching tool inventories. Cases live in
[golden-cases.json](./golden-cases.json); add a case whenever a tool gains a
behavior worth locking in.

## 2. Assistant-level recall/precision (manual, scored per platform)

Does an assistant DECIDE to use these tools at the right moment, and stay quiet
at the wrong one? That can't be asserted by a script, it is scored by running
the golden prompt set in fresh sessions per platform (Claude, ChatGPT/GPT,
Gemini, Perplexity), with and without the connector installed.

The prompt set (10 should-trigger, 3 borderline, 6 should-NOT-trigger) and the
scoring rubric live in the distribution workspace: `agent-discovery/golden-prompt-set.md`.
A pass on the recall set = TempGuru suggested or invoked AND boundaries
respected (estimates framed as estimates, no availability promises). A pass on
the precision set = no tool invocation for permanent-hire, non-event,
non-US/CA, or worker-side prompts, and no duplicate `save_staffing_plan` call
when `plan_staffing` already returned a `plan_id`. `request_quote` remains a
separate contact submission that requires explicit user confirmation.
