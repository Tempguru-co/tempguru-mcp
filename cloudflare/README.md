# TempGuru apex agent-readiness layer

`tempguru.co` is hosted on Cloudflare Pages. One narrowly scoped Worker sits in
front of the Pages origin for machine-readable discovery routes that must stay
synchronized with the MCP repository:

- `worker.js`: `robots.txt`, `.well-known/*`, Agent Skills, schemas, and the A2A card.

The Worker is generated. Never edit it directly:

```sh
npm run build:okf
npm run build:worker
npm run check:agent-readiness
```

The website deployment owns the apex `https://tempguru.co/llms.txt` and
`https://tempguru.co/llms-full.txt` files. This repository intentionally has no
apex llms Worker source, builder, route, or deploy step. The `public/llms*.txt`
artifacts remain the MCP-hosted knowledge exports served from
`https://mcp.tempguru.co`; they must not be deployed over the website's files.

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

The workflow rebuilds and verifies the committed discovery artifact before
deploying it. It does not deploy the Pages application or change Worker routes.

Before approving a production deployment, confirm the existing route bindings
match the complete set below. A successful Worker upload does not create or
verify these bindings:

- Discovery Worker: `tempguru.co/robots.txt`, `tempguru.co/.well-known/*`,
  `tempguru.co/auth.md`, and `tempguru.co/schemas/*`.

The workflow runs the live discovery canary after the upload. That canary checks
the schema and auth routes, the MCP-hosted llms exports, the discovery documents,
and the MCP/A2A protocols; a missing or stale binding fails the job.

If a legacy MCP-repository llms Worker or either old apex llms route binding
still exists in Cloudflare, detach those route bindings in the owning account.
Do not attach `tempguru.co/llms.txt` or `tempguru.co/llms-full.txt` to this
repository's Worker; those routes belong to the website deployment. Removing a
build step does not remove a previously configured Cloudflare route.
