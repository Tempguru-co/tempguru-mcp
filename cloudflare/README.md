# TempGuru apex agent-readiness layer

`tempguru.co` is hosted on Cloudflare Pages. Two narrowly scoped Workers sit in
front of the Pages origin for machine-readable routes that must stay synchronized
with the MCP repository:

- `worker.js`: `robots.txt`, `.well-known/*`, Agent Skills, schemas, and the A2A card.
- `llms-worker.js`: `llms.txt` and `llms-full.txt`.

Both files are generated. Never edit them directly:

```sh
npm run build:okf
npm run build:worker
npm run build:llms-worker -- --from-committed
npm run check:agent-readiness
```

Unmatched requests use `fetch(request)` and continue to the Cloudflare Pages
origin. The discovery Worker must not implement, redirect, or catch unmatched
Pages routes.

## Deployment

Production deployment is manual and review-gated through
`.github/workflows/deploy-apex-agent-readiness.yml`; it is no longer a dashboard
copy/paste procedure. Configure these GitHub Production environment values:

- Secret `CLOUDFLARE_API_TOKEN`, scoped to Workers Scripts: Edit for this account.
- Secret `CLOUDFLARE_ACCOUNT_ID`.
- Variable `CLOUDFLARE_DISCOVERY_WORKER_NAME`, the existing discovery Worker name.
- Variable `CLOUDFLARE_LLMS_WORKER_NAME`, the existing llms Worker name.

The workflow rebuilds and verifies both committed artifacts before deploying.
It does not deploy the Pages application or change either Worker's routes.

Before approving a production deployment, confirm the existing route bindings
match the complete set below. A successful Worker upload does not create or
verify these bindings:

- Discovery Worker: `tempguru.co/robots.txt`, `tempguru.co/.well-known/*`,
  `tempguru.co/auth.md`, and `tempguru.co/schemas/*`.
- llms Worker: `tempguru.co/llms.txt` and `tempguru.co/llms-full.txt`.

The workflow runs the live discovery canary after both uploads. That canary
checks the schema and auth routes, both distinct llms exports, the discovery
documents, and the MCP/A2A protocols; a missing or stale binding fails the job.
