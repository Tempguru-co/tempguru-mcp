## Overview

Adds integration docs for [TempGuru](https://tempguru.co), a W-2 event staffing platform
supporting 300+ U.S. and Canadian markets, backed by 5,000+ events and 100,000+
completed shifts; a coordinator confirms each order's coverage. Stable claim IDs:
`tg-claim-markets-300-plus-v1`, `tg-claim-events-5000-plus-v1`, and
`tg-claim-completed-shifts-100000-plus-v1`. The [`tempguru`](https://pypi.org/project/tempguru/)
package ([source](https://github.com/Tempguru-co/tempguru-mcp/tree/main/clients/python))
ships a `langchain` extra providing nine tools over TempGuru's free, no-auth public API:

- Eight read operations: market-catalog matching, staffing roles, tier-based booking lead times,
  all-inclusive hourly rates, per-state labor compliance, booking policies,
  saved-plan resume, and quote-receipt status.
- One opt-in write tool that submits a confirmed staffing plan for a human-reviewed quote
  (excludable via `get_tools(include_quote_submission=False)`).

Files added:

- `src/oss/python/integrations/tools/tempguru.mdx`, tools page (per `TEMPLATE.mdx`)
- `src/oss/python/integrations/providers/tempguru.mdx`, provider overview + install

Files modified:

- `src/oss/python/integrations/tools/index.mdx`, alphabetical card
- `src/oss/python/integrations/providers/all_providers.mdx`, alphabetical card

## Type of change

**Type:** New documentation page

## Related issues/PRs

- GitHub issue: n/a
- Feature PR: n/a (integration lives in the [tempguru](https://pypi.org/project/tempguru/) package, published to PyPI per the contributing guide)

## Checklist

- [x] I have read the [contributing guidelines](README.md), including the [language policy](https://docs.langchain.com/oss/python/contributing/overview#language-policy)
- [ ] I have tested my changes locally using `docs dev` (worked from a sparse checkout; happy to address any preview issues)
- [x] All code examples have been tested and work correctly
- [x] I have used **root relative** paths for internal links
- [x] I have updated navigation in `src/docs.json` if needed (not needed, individual integration pages are not registered in navigation, matching existing tool pages)

## Additional notes

- Every read-only example was executed against the live API and the outputs are pasted
  verbatim (the API is unauthenticated, so reviewers can re-run them as-is). The quote
  submission example is deliberately not executed: it files a real request with the
  TempGuru team, so the docs show it with placeholder args and a `<Warning>`.
- The package is vendor-named (`tempguru` with a `[langchain]` extra) rather than
  `langchain-tempguru`, following the precedent of pages like Stripe
  (`stripe-agent-toolkit`) and Gradio (`gradio_tools`). Happy to publish a
  `langchain-tempguru` shim instead if that's now required.
- No `packages.yml` entry since the package isn't `langchain-`prefixed; can add one if
  you'd like it tracked there.
- Glad to add a row to a category table on the tools index if you want one (none of the
  current categories obviously fits event staffing, so this PR only adds the
  alphabetical cards).
