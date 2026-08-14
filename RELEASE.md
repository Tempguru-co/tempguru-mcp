# TempGuru MCP 1.7.1 release runbook

Use this runbook for the AGENT5 public-offer parity release prepared in this
repository. Version `1.7.0` is already live and immutable; do not try to
overwrite or republish it. The release candidate in this branch is `1.7.1`.

The buyer-safety boundary introduced in `1.7.0` remains unchanged:

- Authless MCP `request_quote` is a strict, read-only, idempotent handoff.
- It accepts a saved non-PII `plan_id` and optional bounded attribution only.
- It returns a prefilled form on `https://mcp.tempguru.co`.
- It does not accept contact fields, create a CRM lead, or return a TG quote
  reference.
- The buyer personally opens the form, reviews the plan, enters their own
  contact details, and submits it. Only that website/REST submission creates a
  lead and TG reference.

Version `1.7.1` adds the exact public AGENT5 terms to `get_policies`, points to
them from server instructions, adds an undiscounted informational note to
completed `plan_staffing` and restored `get_plan` responses, and prefills the
buyer-operated form's details field for verified quote handoffs. It never
discounts role rates, planning totals, or benchmarks. The runtime hides the
offer after December 31, 2026, and a dated reminder exists for the coordinated
source/artifact removal and Vercel/Cloudflare deployment.

The connector is still classified `read_write` because `plan_staffing` may
best-effort save a non-contact plan and `save_staffing_plan` explicitly saves
one. Those are the only two non-read-only tools.

This runbook covers Vercel, npm, the official MCP Registry, the shared Pi /
Prime Agent npm package, Cloudflare discovery, GHCR, the Anthropic Connectors
Directory, Hermes, and ClawHub. It does not cover or authorize TempGuru
city-page changes.

## Release surfaces

| Surface | Trigger | Expected result |
|---|---|---|
| Vercel production | Merge/push to `main` | Deploys `mcp.tempguru.co`, including `/request-quote` |
| GHCR `latest` and `sha-*` | Merge/push to `main` | Publishes `ghcr.io/tempguru-co/event-staffing` |
| MCP Registry initial check | `server.json` version change on `main` | Defers until the matching npm CLI exists |
| npm CLI | Manual `publish-npm.yml` with `1.7.1` | Publishes `tempguru-mcp`, then re-dispatches the Registry workflow |
| Pi / Prime Agent npm package | Completed `publish-pi.yml` run for `1.7.2` | `tempguru-pi@1.7.2` is live and immutable; future changes require the next unused patch |
| GHCR semver tags | Push `v1.7.1` | Publishes image tags `1.7.1` and `1.7` |
| Apex Cloudflare discovery | Manual | Deploys the two committed worker files |
| Anthropic directory | Manual portal update and email reply | Requests re-review under `tempguru-event-staffing` |
| Hermes and ClawHub | Manual | Refreshes third-party skill catalog copies |

Cloudflare deployment is manual and review-gated through this repository's
`deploy-apex-agent-readiness.yml` workflow. Anthropic, Hermes, and ClawHub
remain external manual updates. Do not mark any surface published until its
own verification succeeds.

## Prerequisites

1. Use Node `22` or newer to build the Next.js repository. The root
   application engine is `>=22`; the independently packaged stdio CLI keeps
   its tested `>=20` runtime floor, and the publishing workflows use Node 24.
2. Confirm the Vercel GitHub App can access
   `Tempguru-co/tempguru-mcp` and that `main` deploys to Production.
3. Configure npm Trusted Publishing for `tempguru-mcp`:

   - Organization: `Tempguru-co`
   - Repository: `tempguru-mcp`
   - Workflow filename: `publish-npm.yml`
   - Environment: `Production`
   - Allowed action: `npm publish`

4. Configure the existing `tempguru-pi` package the same way, using workflow
   filename `publish-pi.yml`.
5. Store the Ed25519 private key as the GitHub environment secret
   `Production` → `MCP_PRIVATE_KEY`. Restrict that environment to `main`.
6. Confirm the GHCR package is public and the release operator can merge,
   dispatch Actions, push tags, deploy both Cloudflare workers, edit the
   Anthropic directory submission, update Hermes PR #39150, and publish the
   TempGuru ClawHub skills.
7. Protect the `v*` tag namespace so only release maintainers can create or
   update release tags.

The npm workflows use OIDC. Do not use a long-lived npm token or run
`npm publish` locally for a normal release.

## 1. Verify versions and generate artifacts

Run from the repository root on the release branch:

```bash
node --version
node -p 'require("./package.json").version'
node -p 'require("./package-lock.json").version'
node -p 'require("./package-lock.json").packages[""].version'
node -p 'require("./cli/package.json").version'
node -p 'require("./distribution/pi/package.json").version'
node -p 'require("./server.json").version'
node -p 'require("./server.json").packages[0].version'
node -p 'require("./gemini-extension.json").version'
node -p 'require("./plugins/tempguru/.claude-plugin/plugin.json").version'
node -p 'require("./.claude-plugin/marketplace.json").plugins[0].version'
```

The repository build Node major must be at least 22. Every version printed
above must be `1.7.1` except the independently versioned Pi package, which must
be the published, current, and immutable `1.7.2`. Do not dispatch the Pi
publisher for `1.7.2` again. The workflow fails closed when the requested
version already exists on npm; any future package change must bump to the next
unused patch.

Install from the lockfile and regenerate every committed release artifact:

```bash
npm ci
npm run sync:postman
npm run build:okf
npm run build:worker
npm run build:llms-worker -- --from-committed
npm run build:cli
git diff --check
git status --short
```

Review all generated changes before committing them. The release commit must
contain the source, skill copies and digests, OKF bundle, discovery documents,
OpenAPI/schema artifacts, Cloudflare workers, CLI source and manifests, tests,
and documentation intended for `1.7.1`. The ignored CLI bundle is built and
package-checked dynamically by the publisher; it is not committed. Do not
include unrelated city-page work or duplicate local files.

## 2. Run the release gates

Run the same core gates used by the publishing workflows:

```bash
npm run typecheck
npm run test:unit
npm run build:stdio
npm run evals
npm run test:protocol
npm run build
npm run build:worker
npm run build:llms-worker -- --from-committed
npm run check:submissions
npm run check:agent-readiness
npm run build:cli
npm run check:cli-package
npm pack --dry-run --json ./cli
npm pack --dry-run --json ./distribution/pi
git diff --check
```

After committing the generated artifacts, rerun:

```bash
git status --short
git diff --exit-code
```

The tracked worktree must remain unchanged. Before release, specifically
confirm the tests prove that:

- MCP `request_quote` has `readOnlyHint: true`,
  `destructiveHint: false`, and `idempotentHint: true`.
- Its strict input schema rejects `contact_name`, `contact_email`,
  `contact_phone`, `company`, and other undeclared fields.
- A valid saved plan returns a TempGuru-owned `form_url`.
- MCP handoff telemetry is distinct from website/REST `quotes_submitted`.
- The buyer form is the component that posts contact details to
  `/api/v1/quote-requests`.
- The 12-tool, 2-prompt, and 8-resource inventories are exact.

Do not proceed if any safety assertion fails.

## 3. Merge and verify the production deployment

Push the release branch, open a pull request to `main`, wait for every required
check, and merge after review. Do not publish packages or tag a branch commit
before the exact source has merged.

After merge, record the merge SHA:

```bash
git fetch origin
git rev-parse origin/main
```

Confirm:

1. Vercel deployed that `main` commit to Production.
2. `check-submissions` and the repository verification workflow passed.
3. `Publish Docker image` succeeded for `main`, producing `latest` and the
   matching `sha-*` tag.
4. The push-triggered MCP Registry workflow either found the version already
   published or deferred pending npm. A defer before npm publication is
   expected.
5. `https://mcp.tempguru.co/request-quote` loads. Opening the page does not
   submit a lead.

The pre-`1.7.0` server may still expose the old direct-submission behavior
until Vercel finishes. Do not update the Anthropic listing or reply to the
review thread until the production deployment and live canary both pass.

## 4. Publish `tempguru-mcp@1.7.1`

In GitHub Actions, choose **Publish MCP CLI to npm**, select `main`, enter
`1.7.1`, and run the workflow. The equivalent command is:

```bash
gh workflow run publish-npm.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main \
  -f version=1.7.1
```

The workflow reruns the release gates, verifies the root, CLI, and Registry
versions, inspects the tarball, publishes `tempguru-mcp`, and dispatches
`publish-registry.yml`.

Wait for both workflows. Then verify npm and the Registry:

```bash
npm --cache /tmp/tempguru-release-cache view tempguru-mcp@1.7.1 version
curl -fsS \
  'https://registry.modelcontextprotocol.io/v0/servers?search=co.tempguru/event-staffing&version=latest' \
  | jq -r '.servers[0].server.version'
```

Both commands must return `1.7.1`. Registry propagation can lag npm briefly.
If npm succeeds but the Registry dispatch fails, run
`publish-registry.yml` manually from `main`:

```bash
gh workflow run publish-registry.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main
```

Never retry by publishing `1.6.0`, and never attempt to overwrite an existing
npm or MCP Registry version. Use a new patch version for a forward fix.

## 5. Verify the published Pi / Prime Agent package, `tempguru-pi@1.7.2`

`tempguru-pi@1.7.2` is already published, live, and immutable. Do not rerun
the publisher for this version. Any future package change must use the next
unused patch, such as `1.7.3` if it is still available.

Verify:

```bash
npm --cache /tmp/tempguru-release-cache view tempguru-pi@1.7.2 version
```

Install `npm:tempguru-pi@1.7.2` in an isolated Pi configuration and confirm:

- Pi's RPC `get_commands` response lists all eight TempGuru skills from the
  published package.
- The native extension loads without conflicts, and an allowlisted
  `tempguru_get_cities` smoke succeeds.
- A read-only configured-market, lead-time, or pricing lookup succeeds without implying confirmed coverage.
- `tempguru_request_quote` accepts a saved plan reference and bounded
  attribution, exposes no contact fields, and returns a buyer form link.
- Calling the handoff does not create a lead or TG reference. Do not submit the
  returned form with fake personal information.

The 2026-08-10 Pi smoke installed one isolated `1.7.2` copy, enumerated all
eight skills, and made exactly one Austin call. It returned HTTP 200 with
`catalog_match=true` and `coverage_confirmation_required=true`.

Run the same published artifact through Prime Agent's persistent package
loader. Do not combine this installed copy with the ephemeral `-e` loader:

```bash
prime-agent package install npm:tempguru-pi@1.7.2
prime-agent package list
prime-agent \
  --mode json \
  --no-session \
  --tools tempguru_get_cities \
  'Call tempguru_get_cities exactly once with city Austin. Return only whether Austin matches the configured catalog and whether coordinator confirmation is still required.'
```

Confirm Prime loads the installed package without duplicate-tool conflicts and
that the Austin call succeeds. The 2026-08-10 replay made exactly one call and
returned HTTP 200 with the same catalog and coordinator-confirmation boundary.
The response does not expose attribution; verify `source=prime-agent` in
request analytics separately before marking that specific closeout item done.
Prime's stock `McpIntegration` in v0.7.0 requires OAuth or a bearer token; do
not add TempGuru's authless MCP URL to Prime settings as a release workaround.

The full `plan_staffing`, `save_staffing_plan`, and `get_rate_benchmark`
operations remain available through a separately attached remote MCP in Pi.
They remain unavailable in Prime until the native adapter gains parity or
Prime supports authless MCP.

## 6. Deploy apex discovery to Cloudflare

Cloudflare Pages serves the `tempguru.co` site, while route-scoped Workers own
the apex discovery files. After the Vercel MCP deployment is healthy, deploy
the committed Worker artifacts:

1. Record the current deployment ID for each worker.
2. Dispatch `deploy-apex-agent-readiness.yml` from `main` and approve the
   GitHub `Production` environment gate.
3. Confirm the existing discovery Worker routes are
   `tempguru.co/robots.txt`, `tempguru.co/.well-known/*`,
   `tempguru.co/auth.md`, and `tempguru.co/schemas/*`; confirm the llms Worker
   routes are `tempguru.co/llms.txt` and `tempguru.co/llms-full.txt`.
4. Confirm both Wrangler deployment steps and the post-deploy live canary
   succeeded. The workflow rebuilds the
   artifacts, requires them to match the reviewed commit, and leaves the Pages
   deployment and Worker route bindings unchanged.

Do not deploy by pasting source into the Cloudflare editor. The committed files
and GitHub workflow are the production path.

After Vercel and both workers are deployed, run the live canary:

```bash
gh workflow run check-live-discovery.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main
```

The same canary can be run locally:

```bash
npm run check:live-discovery
```

It must validate both origins, all eight skill artifacts and digests, the
12-tool modern/legacy MCP contract, OKF, server cards, and llms inventories.

Also verify the deployed version and buyer-form origin:

```bash
curl -fsS https://mcp.tempguru.co/api/v1/health | jq
curl -fsS https://mcp.tempguru.co/.well-known/mcp/server-card.json \
  | jq '{version: .serverInfo.version, tools: [.tools[].name]}'
curl -fsS https://mcp.tempguru.co/.well-known/agent-card.json \
  | jq '{version, supportedInterfaces, skills: [.skills[].id]}'
curl -fsSI https://mcp.tempguru.co/request-quote
```

The health and server card must report `1.7.1`; the server card must list 12
tools; and the form must resolve on `mcp.tempguru.co`.

## 7. Tag `v1.7.1` and verify GHCR

After npm, Pi, Registry, Vercel, Cloudflare, and the live canary verify, tag
the exact merge commit:

```bash
git fetch origin
git switch main
git pull --ff-only
git tag -a v1.7.1 -m "TempGuru MCP v1.7.1"
git push origin v1.7.1
```

The tag starts `docker.yml`, which publishes GHCR tags `1.7.1` and `1.7`.
Verify the immutable image:

```bash
docker buildx imagetools inspect \
  ghcr.io/tempguru-co/event-staffing:1.7.1
```

Create a draft GitHub Release:

```bash
gh release create v1.7.1 \
  --repo Tempguru-co/tempguru-mcp \
  --title "TempGuru MCP v1.7.1" \
  --draft \
  --generate-notes
```

The release notes must call out:

- Node 22+ is required to build/deploy the repository; the packaged
  `tempguru-mcp` stdio CLI remains tested on Node 20+.
- MCP `request_quote` is now a read-only, non-PII buyer-form handoff.
- Only a buyer's website/REST form submission creates a lead and TG reference.
- The connector inventory is 12 tools, 2 prompts, and 8 resources.
- The A2A v1.0 agent card now points to an executable JSON-RPC `/a2a`
  endpoint with repository-backed planning and lookup skills.
- `/auth.md` documents the public no-account/no-OAuth boundary, while
  `/.well-known/tempguru-facts.json` evidence-gates public scale claims.
- Cloudflare Pages discovery now publishes the distinct concise `llms.txt` and
  complete `llms-full.txt` OKF export through generated, route-scoped Workers.
- The canonical AGENT5 offer is identical in `llms.txt` and `get_policies`,
  while planning rates and totals remain undiscounted.

Publish the draft only after the closeout checklist is complete.

## 8. Update the Anthropic Connectors Directory

Use
`distribution/anthropic-directory-update.md` as the paste-ready source. Make
the portal listing match the deployed `1.7.1` server exactly.

Before deploying this release, disclose the factual public-offer surface to
the Anthropic MCP Directory team and ask whether it changes the connector's
answer to the portal's sponsored/promoted-content question. Do not silently
leave a stale `No` answer if Anthropic considers a public discount promoted
content; their directory policy controls whether this community connector may
surface the offer.

### Listing fields

| Field | Required value |
|---|---|
| Name | `TempGuru Event Staffing` |
| Slug | `tempguru-event-staffing` |
| Server URL | `https://mcp.tempguru.co/mcp` |
| Authentication | None |
| Capability | `read_write` |
| Tool count | 12 |
| Prompt count | 2 |
| Resource count | 8 |
| Allowed link origin | `https://mcp.tempguru.co` |

Enter the allowed link value as an HTTPS origin, not a path or wildcard. It
covers the `/request-quote` URL returned by the handoff.

### Exact tool inventory

| Tool | Directory side-effect declaration |
|---|---|
| `plan_staffing` | Non-destructive write; may save a 30-day non-PII plan |
| `save_staffing_plan` | Non-destructive write; explicitly saves a non-PII plan |
| `get_plan` | Read-only |
| `get_cities` | Read-only |
| `get_roles` | Read-only |
| `check_availability` | Read-only |
| `get_role_pricing` | Read-only |
| `get_compliance_by_state` | Read-only |
| `get_policies` | Read-only |
| `get_rate_benchmark` | Read-only |
| `request_quote` | Read-only and idempotent; returns buyer form, no PII or lead |
| `get_quote_status` | Read-only; checks buyer-created or historical TG references |

This is 10 read-only tools and 2 non-destructive, non-contact persistence
writes. Do not describe `request_quote` as a write.

### Exact prompt inventory

- `plan-event-staffing`
- `staffing-compliance-brief`

### Exact resource inventory

- `https://tempguru.co/.well-known/skills/event-staffing-ordering/SKILL.md`
- `https://tempguru.co/.well-known/skills/event-staffing-compliance/SKILL.md`
- `https://tempguru.co/.well-known/skills/staffing-plan-from-event-brief/SKILL.md`
- `https://tempguru.co/.well-known/skills/urgent-event-backfill/SKILL.md`
- `https://tempguru.co/.well-known/skills/staffing-agency-partner-growth/SKILL.md`
- `https://tempguru.co/.well-known/skills/multi-city-activation-planner/SKILL.md`
- `https://tempguru.co/.well-known/skills/event-staffing-procurement/SKILL.md`
- `https://tempguru.co/.well-known/skills/tempguru-pro-operations/SKILL.md`

Do not leave the old declaration of five tools, zero prompts, zero resources,
or `read_only` in any portal field.

### Reviewer-safe test

The reviewer can:

1. Call `plan_staffing` with a future event, valid city, and role/headcount.
2. Retain its `plan_id`, or call `save_staffing_plan` once if no ID was
   returned.
3. Call `request_quote` with that saved ID.
4. Confirm that the output is a `form_url`, not a lead receipt or TG reference.
5. Inspect the form without entering contact details or submitting it.

### Reply to Anthropic

Reply on the original review thread only after the portal update, production
deployment, and live canary are verified. Use the concise reply in
`distribution/anthropic-directory-update.md`. The reply must state:

- The listing is now `read_write` with 12 tools, 2 prompts, and 8 resources.
- `request_quote` accepts no contact fields and creates no lead.
- It returns a form on `https://mcp.tempguru.co` that the buyer personally
  submits.
- Only the website/REST submission creates the CRM lead and TG reference.
- The requested live slug remains `tempguru-event-staffing`.

Request re-review; do not claim approval or publication until Anthropic
confirms it.

## 9. Refresh external skill catalogs

This AGENT5 server release does not require a Hermes, ClawHub, Pi, or Prime
republish: existing installations receive the offer through the live MCP/REST
policy and verified buyer-form surfaces. Three canonical quote-calling skill
copies now send `skill_version: 1.7.1`; republishing them is optional attribution
cleanup and must use each catalog/package's next unused immutable version.
The procedures below are retained from the prior `1.7.0` catalog refresh.

Catalog copies must teach the same buyer-operated handoff as the live server.
These updates do not change the Hermes or legacy OpenClaw runtime deployments.

### Hermes

Sync the two committed submission files to the existing fork branch:

| Repository source | PR #39150 target |
|---|---|
| `distribution/assistants/hermes/SKILL.md` | `optional-skills/productivity/event-staffing/SKILL.md` |
| `distribution/assistants/hermes/test_event_staffing_skill.py` | `tests/skills/test_event_staffing_skill.py` |

On the Hermes fork branch:

```bash
git diff --check
pytest tests/skills/test_event_staffing_skill.py
git status --short
```

Commit and push those two files, then request another review on
NousResearch/hermes-agent PR #39150. Preserve the Hermes catalog's own skill
versioning convention; do not force the MCP package version into that metadata
unless the catalog requires it. Do not claim the PR is merged until the
upstream repository shows it.

Do not modify or restart the separate Hermes content agent on the Hostinger
VPS.

### ClawHub

Republish the seven canonical skills whose quote workflow or public factual
claims changed. On 2026-08-10, ClawHub's public API showed a latest version
below `1.7.0` for every listed slug, so `1.7.0` was not yet listed:

- `tempguru-event-staffing-ordering`
- `tempguru-staffing-plan-from-event-brief`
- `tempguru-urgent-event-backfill`
- `tempguru-multi-city-activation-planner`
- `tempguru-event-staffing-procurement`
- `tempguru-staffing-agency-partner-growth`
- `tempguru-pro-operations`

Use each matching `skills/<canonical-slug>/SKILL.md` from the tagged `v1.7.0`
commit. Immediately before publishing, query all seven listings again. ClawHub
versions are immutable: use `1.7.0` only while it remains unused for that slug;
if it has appeared, choose the next unused patch (for example `1.7.1`) rather
than overwriting or retrying an existing version.

This repository does not contain a generic ClawHub publication command. Use
the already authenticated `kissmyabs32` publisher workflow. If the local shell
function `publish_all` is used, inspect it with `type publish_all`, run its dry
run first, and verify that it targets only the seven skills above at the
preflight-confirmed unused version for each (`1.7.0` was expected from the
2026-08-10 observation) before enabling writes.

Verify each listing:

```bash
curl -fsS https://clawhub.ai/api/v1/skills/tempguru-event-staffing-ordering | jq
curl -fsS https://clawhub.ai/api/v1/skills/tempguru-staffing-plan-from-event-brief | jq
curl -fsS https://clawhub.ai/api/v1/skills/tempguru-urgent-event-backfill | jq
curl -fsS https://clawhub.ai/api/v1/skills/tempguru-multi-city-activation-planner | jq
curl -fsS https://clawhub.ai/api/v1/skills/tempguru-event-staffing-procurement | jq
curl -fsS https://clawhub.ai/api/v1/skills/tempguru-staffing-agency-partner-growth | jq
curl -fsS https://clawhub.ai/api/v1/skills/tempguru-pro-operations | jq
```

Confirm each listing reflects the non-PII handoff and tells the buyer to submit
the TempGuru form personally. Record the actual published versions; do not
infer success from a local command alone.

### Live assistant copies

Repository changes do not update assistants whose prompt, knowledge files, or
store listing were pasted into a platform. For every surface currently marked
live or submitted in `distribution/assistants/README.md`:

1. Re-paste the current English or zh-CN system prompt where that platform uses
   one.
2. Re-upload all five files in `distribution/assistants/knowledge/` where the
   platform supports knowledge uploads.
3. For each live surface with REST Actions or a plugin, re-import or inspect
   the current OpenAPI schema. Verify the eight public read operations plus the
   explicitly confirmed `submitQuoteRequest` write (health may remain hidden),
   and remove stale inventories such as the six-operation Coze configuration.
4. Refresh its paste-ready listing copy when this release changed that copy.
5. Run the documented five-case smoke test and record the observed date and
   result in the tracker.

Do not create or configure platforms still marked unbuilt merely to close this
release; keep those rows as future work.

Do not SSH to or change the legacy OpenClaw VPS container at
`/docker/openclaw-y5yb/`. Do not edit `openclaw.json`, restart
`openclaw-gateway`, or touch sibling agents. ClawHub is an independent catalog.

## 10. Close the release

Do not mark `1.7.1` complete until every applicable item is verified:

- Vercel Production serves the merge commit and `/request-quote`.
- `tempguru-mcp@1.7.1` resolves from npm.
- `tempguru-pi@1.7.2` resolves from npm.
- The published `tempguru-pi@1.7.2` loads all 8 skills and 9 native tools in
  both Pi and Prime Agent, and Prime calls carry `source=prime-agent`.
- The official MCP Registry reports `1.7.1`.
- Both Cloudflare worker deployments are live.
- All six documented Cloudflare route bindings resolve to the expected Worker
  content, including `/auth.md`, the request schema, and distinct llms exports.
- `check-live-discovery.yml` passes.
- GHCR exposes `latest`, `1.7.1`, `1.7`, and the expected `sha-*` image.
- The Anthropic portal says `read_write` and lists all 12 tools, 2 prompts, 8
  resources, and allowed origin `https://mcp.tempguru.co`.
- The Anthropic review reply has been sent, with directory status still
  recorded as pending until Anthropic responds.
- Hermes PR #39150 contains the current files and has been re-submitted for
  review, if that catalog refresh applies.
- The seven changed ClawHub skills report their new versions and current
  buyer-operated handoff instructions.
- Every actually-live or submitted assistant consumer has received the current
  prompt, knowledge files, Action/plugin schema, and listing copy that apply to
  it, with the smoke result recorded; unbuilt platforms remain tracker-only.
- The GitHub Release notes accurately distinguish the repository's Node 22+
  build floor from the CLI's Node 20+ runtime floor and describe the non-PII
  handoff.

Update the distribution status tracker with observed results and dates. Keep
pending third-party reviews labeled pending.

## Rollback and forward-fix

- **Before Anthropic re-review:** if the live handoff or form fails, stop. Do
  not update the portal or send the reply.
- **Vercel:** use Vercel rollback/promote controls. Be aware that rolling back
  to the `1.6.0` server also restores the old direct MCP lead-submission
  behavior; keep the Anthropic listing pending or disabled until the approved
  `1.7.x` safety boundary is live again.
- **Cloudflare:** roll back each worker independently from its Deployments tab.
- **Anthropic:** keep the portal declaration aligned with the server actually
  deployed. If the safe handoff is unavailable, tell the reviewer and pause
  re-review rather than leaving an inaccurate listing.
- **`tempguru-mcp` npm and MCP Registry:** versions are immutable. After the
  `1.7.1` candidate, publish the next unused patch; never overwrite `1.7.1`,
  `1.7.0`, or `1.6.0`.
- **`tempguru-pi` npm:** `1.7.2` is published and immutable. Publish any
  forward fix as a new unused patch such as `1.7.3`; never overwrite `1.7.2`,
  `1.7.1`, or any earlier artifact.
- **GHCR:** preserve versioned tags. A corrective `main` deployment may move
  `latest`; use a new semantic version for a permanent fix.
- **Hermes and ClawHub:** correct catalog content with a new commit/version and
  record the actual upstream state. Do not change live VPS runtimes as a
  catalog rollback.
