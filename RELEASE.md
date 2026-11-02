# TempGuru MCP 1.7.3 release runbook

Use this runbook for release `1.7.3`. `tempguru-mcp@1.7.2` and
`tempguru-pi@1.7.2` are already released and immutable; do not try to
overwrite or republish them. This branch releases `1.7.3` for the server/CLI,
the Pi package, and the canonical quote skills (`skill_version: 1.7.3`).

What `1.7.3` ships (merged in #49; this release versions and publishes it):

- **Security:** `@modelcontextprotocol/server` 2.4.0, Next.js 16.4.3, and zod
  4.6.7 (`npm audit` reports 0 vulnerabilities). `/mcp` refuses bodies over
  64 KiB (413) and JSON-RPC batches over 10 messages (400) before any tool runs.
- **Telemetry:** each MCP/REST call is labeled `anthropic` or `openai` when the
  client IP is in that company's published egress ranges (refresh with
  `npm run sync:ai-egress`); new `origin:{date}` and `guard:{date}` cross-tabs.
- **AGENT5 removed** from every model-readable surface (server instructions,
  `plan_staffing`/`get_plan` notes, `get_policies` and its REST/OpenAPI mirrors,
  OKF/llms knowledge). The only remaining use is the editable prefill on the
  human quote form, which the model never sees.
- **Booking policies published** (policies data `1.3.1`, operator-confirmed
  2026-11-01): 4-hour minimum per worker per shift; 48 hours' notice to cancel
  or reschedule, otherwise the 4-hour minimum applies to each booked worker; a
  2-hour no-show replacement target (not a guarantee); COIs need at least a
  week; a deposit after quote approval (a percentage set on each quote, no
  standard rate); net 30; a $150 rush fee per order under 72 hours; background
  checks need at least 2 weeks, with client-set scope and request-based cost.
- **Skills and prompts aligned:** five skills, both system prompts (en,
  zh-CN), the Hermes catalog copy (`1.0.6`), and GEMINI.md describe the 2-hour
  replacement as a target. The Pi package also catches up on skill wording
  changed since its `1.7.2` artifact (scale facts and canonical company facts)
  and one native tool description.

The buyer-safety boundary introduced in `1.7.0` remains unchanged:

- Authless MCP `request_quote` is a strict, read-only, idempotent handoff.
- It accepts a saved non-PII `plan_id` and optional bounded attribution only.
- It returns a prefilled form on `https://mcp.tempguru.co`.
- It does not accept contact fields, create a CRM lead, or return a TG quote
  reference.
- The buyer personally opens the form, reviews the plan, enters their own
  contact details, and submits it. Only that website/REST submission creates a
  lead and TG reference.

The connector is still classified `read_write` because `plan_staffing` may
best-effort save a non-contact plan and `save_staffing_plan` explicitly saves
one. Those are the only two non-read-only tools.

This runbook covers Vercel, npm, the official MCP Registry, the shared Pi /
Prime Agent npm package, Cloudflare discovery, GHCR, the Anthropic Connectors
Directory, Hermes, ClawHub, and the assistant platforms. It does not cover or
authorize TempGuru city-page changes.

## Release surfaces

| Surface | Trigger | Expected result |
|---|---|---|
| Vercel production | Merge/push to `main` | Deploys `mcp.tempguru.co`, including `/request-quote` |
| GHCR `latest` and `sha-*` | Merge/push to `main` | Publishes `ghcr.io/tempguru-co/event-staffing` |
| MCP Registry initial check | `server.json` version change on `main` | Defers until the matching npm CLI exists |
| npm CLI | Manual `publish-npm.yml` with `1.7.3` | Publishes `tempguru-mcp`, then re-dispatches the Registry workflow |
| Pi / Prime Agent npm package | Manual `publish-pi.yml` with `1.7.3` | Publishes `tempguru-pi@1.7.3`, the current immutable package |
| GHCR semver tags | Push `v1.7.3` | Publishes image tags `1.7.3` and `1.7` |
| Apex Cloudflare discovery | Manual | Deploys the committed discovery Worker artifact |
| Anthropic directory | Verification only | Keep the approved community listing aligned with the live server; optionally send the AGENT5 removal note |
| Hermes | Re-sync PR #39150 | Both submission files match the repository `1.0.6` copies |
| ClawHub | Operator account | Changed skills published at `1.7.3`; no repository workflow covers ClawHub |
| Assistant platforms, Hugging Face | Operator accounts | Updated system prompts, knowledge files, Copilot manifest, and dataset |

Cloudflare deployment is manual and review-gated through this repository's
`deploy-apex-agent-readiness.yml` workflow. Anthropic, Hermes, ClawHub, the
assistant platforms, and Hugging Face remain external manual updates. Do not
mark any surface published until its own verification succeeds.

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
   dispatch Actions, push tags, deploy the Cloudflare discovery Worker, and
   edit the Anthropic directory submission if its live declaration needs
   correction.
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

The repository build Node major must be at least 22. The root, CLI, Registry,
Gemini, and plugin release versions printed above must be `1.7.3`. The
independently versioned Pi package also prints `1.7.3`; step 5 publishes it.
The canonical quote skills carry `skill_version: 1.7.3`, and the Hermes catalog
copy carries `version: 1.0.6`. Publishing workflows fail closed when the
requested version already exists; every forward fix must use a new unused
package version.

Install from the lockfile and regenerate every committed release artifact:

```bash
npm ci
npm run sync:postman
npm run build:okf
npm run build:worker
npm run build:cli
node distribution/assistants/build-knowledge.mjs
node distribution/assistants/build-manifests.mjs
node distribution/toolbox/build-hf-dataset.mjs
git diff --check
git status --short
```

Review all generated changes before committing them. The release commit must
contain the source, OKF bundle, discovery documents, OpenAPI/schema artifacts,
the Cloudflare discovery Worker, CLI source and manifests, skill copies and
digests (`skill_version: 1.7.3`), assistant knowledge and manifests, the
Hugging Face dataset, tests, and documentation intended for `1.7.3`. The
ignored CLI bundle is built and package-checked dynamically by the publisher;
it is not committed. Do not include unrelated city-page work or duplicate local
files.

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
- Server instructions, `tools/list`, plan results, and `get_policies` carry no
  promotional offer copy, and `get_policies` has no open TODO items.
- `/mcp` refuses an oversized body (413) and an 11-message batch (400).

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

Do not update the Anthropic listing or reply to the review thread until the
production deployment and live canary both pass.

## 4. Publish `tempguru-mcp@1.7.3`

In GitHub Actions, choose **Publish MCP CLI to npm**, select `main`, enter
`1.7.3`, and run the workflow. The equivalent command is:

```bash
gh workflow run publish-npm.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main \
  -f version=1.7.3
```

The workflow reruns the release gates, verifies the root, CLI, and Registry
versions, inspects the tarball, publishes `tempguru-mcp`, and dispatches
`publish-registry.yml`.

Wait for both workflows. Then verify npm and the Registry:

```bash
npm --cache /tmp/tempguru-release-cache view tempguru-mcp@1.7.3 version
curl -fsS \
  'https://registry.modelcontextprotocol.io/v0/servers?search=co.tempguru/event-staffing&version=latest' \
  | jq -r '.servers[0].server.version'
```

Both commands must return `1.7.3`. Registry propagation can lag npm briefly.
If npm succeeds but the Registry dispatch fails, run
`publish-registry.yml` manually from `main`:

```bash
gh workflow run publish-registry.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main
```

Never attempt to overwrite an existing npm or MCP Registry version. Use a new
patch version for a forward fix.

## 5. Publish and verify the Pi / Prime Agent package, `tempguru-pi@1.7.3`

`tempguru-pi@1.7.2` remains published and immutable; do not republish it. In
GitHub Actions, choose the Pi publisher, select `main`, enter `1.7.3`, and run
the workflow. The equivalent command is:

```bash
gh workflow run publish-pi.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main \
  -f version=1.7.3
```

After the workflow succeeds, `tempguru-pi@1.7.3` is the published, current,
immutable package, and unpinned installs resolve to it. Verify:

```bash
npm --cache /tmp/tempguru-release-cache view tempguru-pi@1.7.3 version
```

Install `npm:tempguru-pi@1.7.3` in an isolated Pi configuration and confirm:

- Pi's RPC `get_commands` response lists all eight TempGuru skills from the
  published package.
- The native extension loads without conflicts, and an allowlisted
  `tempguru_get_cities` smoke succeeds.
- A read-only configured-market, lead-time, or pricing lookup succeeds without implying confirmed coverage.
- `tempguru_request_quote` accepts a saved plan reference and bounded
  attribution, exposes no contact fields, and returns a buyer form link.
- Calling the handoff does not create a lead or TG reference. Do not submit the
  returned form with fake personal information.

The last published-artifact Pi smoke ran on 2026-08-10 against `1.7.2`: it
installed one isolated copy, enumerated all eight skills, and made exactly one
Austin call, which returned HTTP 200 with `catalog_match=true` and
`coverage_confirmation_required=true`. Version `1.7.3` changes only text
(skill wording, one native tool description, and `skill_version`); record its
own smoke result here before closing the release.

Run the same published artifact through Prime Agent's persistent package
loader. Do not combine this installed copy with the ephemeral `-e` loader:

```bash
prime-agent package install npm:tempguru-pi@1.7.3
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

Cloudflare Pages serves the `tempguru.co` site, while one route-scoped Worker
owns the apex discovery files. The website deployment, not this repository,
owns the apex `llms.txt` and `llms-full.txt` files. After the Vercel MCP
deployment is healthy, deploy the committed discovery Worker artifact:

1. Record the current discovery Worker deployment ID.
2. Dispatch `deploy-apex-agent-readiness.yml` from `main` and approve the
   GitHub `Production` environment gate.
3. Confirm the existing discovery Worker routes are
   `tempguru.co/robots.txt`, `tempguru.co/.well-known/*`,
   `tempguru.co/auth.md`, and `tempguru.co/schemas/*`.
4. Confirm the Wrangler deployment step and the post-deploy live canary
   succeeded. The workflow rebuilds the artifact, requires it to match the
   reviewed commit, and leaves the Pages deployment and Worker route bindings
   unchanged.
5. Confirm no legacy MCP-repository Worker route is bound to
   `tempguru.co/llms.txt` or `tempguru.co/llms-full.txt`. Removing the old
   builder and deploy step does not remove a route already configured in
   Cloudflare.

The live canary checks that the apex is internally consistent, not that it
matches this repository. After the deploy, also confirm
`https://tempguru.co/.well-known/skills/urgent-event-backfill/SKILL.md` carries
the 2-hour target wording, so a skipped deploy cannot pass silently.

Do not deploy by pasting source into the Cloudflare editor. The committed files
and GitHub workflow are the production path.

After Vercel and the discovery Worker are deployed, run the live canary:

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
12-tool modern/legacy MCP contract, OKF, server cards, and llms inventories,
and that no deployed instruction, tool list, llms file, or `get_policies`
response carries AGENT5.

Also verify the deployed version and buyer-form origin:

```bash
curl -fsS https://mcp.tempguru.co/api/v1/health | jq
curl -fsS https://mcp.tempguru.co/.well-known/mcp/server-card.json \
  | jq '{version: .serverInfo.version, tools: [.tools[].name]}'
curl -fsS https://mcp.tempguru.co/.well-known/agent-card.json \
  | jq '{version, supportedInterfaces, skills: [.skills[].id]}'
curl -fsSI https://mcp.tempguru.co/request-quote
```

The health and server card must report `1.7.3`; the server card must list 12
tools; and the form must resolve on `mcp.tempguru.co`.

## 7. Tag `v1.7.3` and verify GHCR

After npm, Pi, Registry, Vercel, Cloudflare, and the live canary verify, tag
the exact merge commit:

```bash
git fetch origin
git switch main
git pull --ff-only
git tag -a v1.7.3 -m "TempGuru MCP v1.7.3"
git push origin v1.7.3
```

The tag starts `docker.yml`, which publishes GHCR tags `1.7.3` and `1.7`.
Verify the immutable image:

```bash
docker buildx imagetools inspect \
  ghcr.io/tempguru-co/event-staffing:1.7.3
```

Create a draft GitHub Release:

```bash
gh release create v1.7.3 \
  --repo Tempguru-co/tempguru-mcp \
  --title "TempGuru MCP v1.7.3" \
  --draft \
  --generate-notes
```

The release notes must call out:

- Node 22+ is required to build/deploy the repository; the packaged
  `tempguru-mcp` stdio CLI remains tested on Node 20+.
- Patched dependencies (MCP SDK 2.4.0, Next.js 16.4.3, zod 4.6.7) and the
  `/mcp` body and batch limits.
- Telemetry labels verified Anthropic and OpenAI traffic by published egress
  ranges; raw IPs are never stored.
- AGENT5 no longer appears in any model-readable surface; only the human
  quote-form prefill remains.
- `get_policies` publishes all eight booking topics with no open items, and the
  2-hour no-show replacement is a target, not a guarantee.
- MCP `request_quote` remains a read-only, non-PII buyer-form handoff; only a
  buyer's website/REST form submission creates a lead and TG reference.
- The connector inventory is 12 tools, 2 prompts, and 8 resources.

Publish the draft only after the closeout checklist is complete.

## 8. Update the Anthropic Connectors Directory

Use
`distribution/anthropic-directory-update.md` as the paste-ready source. Make
the portal listing match the deployed `1.7.3` server exactly.

The factual public-offer surface was disclosed to the Anthropic MCP Directory
team before `1.7.1` was deployed, and the operator chose to deploy without
waiting for guidance. That history is not Anthropic approval of AGENT5.
Release `1.7.3` removes the offer from every model-readable surface; once it
is live, optionally send the removal note in
`distribution/anthropic-directory-update.md` on the original disclosure thread.

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

### Anthropic status

The connector is already approved as a community connector. Verify that the
live directory declaration still says `read_write`, 12 tools, 2 prompts, 8
resources, and allowed origin `https://mcp.tempguru.co`. Release `1.7.3` does
not require a new directory submission. If the Directory team replies to the
existing AGENT5 disclosure, follow its guidance and record the response; do not
claim Anthropic approved the offer.

## 9. Re-sync external skill catalogs and assistant copies

Release `1.7.3` changes skill instructions (the 2-hour no-show replacement is a
target, not a guarantee, and the best-effort wording is gone) and moves the
canonical quote skills to `skill_version: 1.7.3`.

- **Hermes:** re-sync PR #39150. Copy `distribution/assistants/hermes/SKILL.md`
  (`version: 1.0.6`) to `optional-skills/productivity/event-staffing/SKILL.md`
  and the test to `tests/skills/test_event_staffing_skill.py` on the PR branch
  in the `kissmyabs32/hermes-agent` fork, then push. Do not modify or restart
  the separate Hermes content agent runtime.
- **ClawHub:** publish the canonical skills that changed since the `1.7.0`
  ClawHub copies (source commit `125ee8a`) at version `1.7.3` from the
  operator's ClawHub account. All eight changed; on 2026-11-02 ClawHub served
  seven at `1.7.0` and compliance at `1.0.0`. No repository workflow covers
  ClawHub. Publish each folder with
  `npx --yes clawhub@0.25.0 skill publish skills/<folder> --slug tempguru-<slug> --name "<listed display name>" --version 1.7.3 --changelog "<text>"`
  after a `--dry-run`. Always pass `--slug`: without it the CLI derives an
  unprefixed slug from the folder name and creates a duplicate listing. The
  CLI needs Node `^22.13.0 || >=24`; log in with
  `npx --yes clawhub@0.25.0 login` as `kissmyabs32`, and verify with
  `GET https://clawhub.ai/api/v1/skills/<slug>`. ClawHub is
  an independent catalog; do not SSH to or change the legacy OpenClaw VPS
  container at `/docker/openclaw-y5yb/`, edit `openclaw.json`, restart
  `openclaw-gateway`, or touch sibling agents.
- **Pi:** step 5 publishes `tempguru-pi@1.7.3`; never republish `1.7.2`.

Historical record: seven ClawHub buyer-handoff safety copies were published as
immutable `1.7.0` on 2026-08-14 from source commit `125ee8a`. Hermes PR #39150
contains its catalog-specific submission files and remains governed by the
upstream repository's review status.

### Live assistant copies

Repository changes do not automatically update assistants that imported a
prompt, knowledge file, or REST/OpenAPI Action. For `1.7.3`:

- Re-paste `distribution/assistants/system-prompt.md` (and the zh-CN prompt
  where used) on each live assistant platform.
- Re-upload `distribution/assistants/knowledge/` where a platform holds
  knowledge files.
- Re-import `distribution/assistants/microsoft/declarativeAgent.json` (its
  instructions are 7,993 of Microsoft's 8,000 characters).
- Re-import REST/OpenAPI Actions where a live surface consumes the schema;
  the `getPolicies.topic` enum no longer includes `offers`. For the ChatGPT
  GPT, paste the output of
  `node distribution/assistants/build-gpt-actions-schema.mjs` instead of
  importing the URL, because GPT Actions cap endpoint descriptions at 300
  characters.
- Republish the Hugging Face dataset from `distribution/toolbox/huggingface`.
- Remove AGENT5 from the website-owned `tempguru.co/llms.txt` and
  `llms-full.txt` (separate repository).

Do not create or configure platforms still marked unbuilt merely to close this
release; keep those rows as future work.

## 10. Close the release

Do not mark `1.7.3` complete until every applicable item is verified:

- Vercel Production serves the merge commit and `/request-quote`.
- `tempguru-mcp@1.7.3` resolves from npm.
- `tempguru-pi@1.7.3` resolves from npm.
- `tempguru-pi@1.7.2` was not republished or overwritten.
- The official MCP Registry reports `1.7.3`.
- The Cloudflare discovery Worker deployment is live and serves the `1.7.3`
  skill bodies.
- The documented discovery route bindings resolve to the expected Worker
  content, including `/auth.md` and the request schema; no legacy MCP-repository
  Worker shadows the website-owned apex llms files.
- `check-live-discovery.yml` passes.
- GHCR exposes `latest`, `1.7.3`, `1.7`, and the expected `sha-*` image.
- Live MCP, REST, OpenAPI, llms, and OKF surfaces carry no AGENT5 copy;
  `get_policies` returns all eight topics with no open items; and `/mcp`
  refuses an 11-message batch.
- The Anthropic portal says `read_write` and lists all 12 tools, 2 prompts, 8
  resources, and allowed origin `https://mcp.tempguru.co`.
- The AGENT5 disclosure record does not claim Anthropic approval where no such
  approval has been received.
- Hermes PR #39150 carries the `1.0.6` copies, and ClawHub serves the `1.7.3`
  skills.
- Every live assistant platform has the updated prompt and knowledge files,
  the Hugging Face dataset is republished, and the website llms files carry no
  AGENT5; unbuilt platforms remain tracker-only.
- The GitHub Release notes accurately distinguish the repository's Node 22+
  build floor from the CLI's Node 20+ runtime floor and describe the non-PII
  handoff.

Update the distribution status tracker with observed results and dates. Keep
pending third-party reviews labeled pending.

## Rollback and forward-fix

- **Anthropic directory:** if the live handoff or form fails, stop and keep the
  directory declaration aligned with the server actually deployed.
- **Vercel:** use Vercel rollback/promote controls. Be aware that rolling back
  to the `1.6.0` server also restores the old direct MCP lead-submission
  behavior; keep the Anthropic listing pending or disabled until the approved
  `1.7.x` safety boundary is live again. Rolling back below `1.7.3` also
  restores AGENT5 in model-readable text and the unpatched dependencies.
- **Cloudflare:** roll back the discovery Worker from its Deployments tab. The
  website deployment owns the apex llms files; do not restore the retired MCP
  llms Worker as a rollback path.
- **Anthropic:** keep the portal declaration aligned with the server actually
  deployed. If the safe handoff is unavailable, tell the reviewer and pause
  re-review rather than leaving an inaccurate listing.
- **`tempguru-mcp` npm and MCP Registry:** versions are immutable. After
  `1.7.3`, publish the next unused patch; never overwrite `1.7.3`, `1.7.2`,
  `1.7.1`, `1.7.0`, or `1.6.0`.
- **`tempguru-pi` npm:** `1.7.3` is published and immutable once this release
  ships. Publish any forward fix as a new unused patch such as `1.7.4`; never
  overwrite `1.7.3`, `1.7.2`, or any earlier artifact.
- **GHCR:** preserve versioned tags. A corrective `main` deployment may move
  `latest`; use a new semantic version for a permanent fix.
- **Hermes and ClawHub:** correct catalog content with a new commit/version and
  record the actual upstream state. Do not change live VPS runtimes as a
  catalog rollback.
