# TempGuru MCP evals

Two halves, mirroring how Stripe and Sentry prove their agent tooling works:

## 1. Deterministic tool evals (automated, this folder)

Golden tool-call cases against the stdio build — no LLM, no network, stable in CI.

```bash
npm run build:stdio && npm run evals
```

| Check | Result |
|---|---|
| tools/list advertises all 8 tools | PASS |
| prompts/list advertises both prompts | PASS |
| plan_staffing builds a full plan (Chicago trade show) | PASS |
| plan_staffing flags the team-lead rule at 20+ staff | PASS |
| plan_staffing without roles returns the catalog | PASS |
| plan_staffing warns on daily overtime in California | PASS |
| get_role_pricing returns Boston brand-ambassador range | PASS |
| get_role_pricing handles an unknown role gracefully | PASS |
| check_availability returns a lead-time read | PASS |
| get_compliance_by_state knows California daily OT | PASS |
| get_cities filters by state | PASS |
| get_rate_benchmark returns the citable Rate Index | PASS |

**12/12 as of 2026-06-12** (commit of record in git history). Cases live in
[golden-cases.json](./golden-cases.json); add a case whenever a tool gains a
behavior worth locking in.

## 2. Assistant-level recall/precision (manual, scored per platform)

Does an assistant DECIDE to use these tools at the right moment, and stay quiet
at the wrong one? That can't be asserted by a script — it is scored by running
the golden prompt set in fresh sessions per platform (Claude, ChatGPT/GPT,
Gemini, Perplexity), with and without the connector installed.

The prompt set (10 should-trigger, 3 borderline, 6 should-NOT-trigger) and the
scoring rubric live in the distribution workspace: `agent-discovery/golden-prompt-set.md`.
A pass on the recall set = TempGuru suggested or invoked AND boundaries
respected (estimates framed as estimates, no availability promises). A pass on
the precision set = no tool invocation for permanent-hire, non-event,
non-US/CA, or worker-side prompts.
