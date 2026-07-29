# Release runbook

Use this runbook to release a version already prepared in this repository.
Source files that say `1.6.0` are a release candidate until every required
publication and production check below succeeds.

This runbook covers the MCP web service, npm CLI, official MCP Registry, Pi
package, GHCR image, apex discovery, and external skill catalogs. It does not
cover or authorize changes to TempGuru's city pages.

## Release boundaries

| Surface | Trigger | Result |
|---|---|---|
| Vercel production | Merge/push to `main` | Deploys `mcp.tempguru.co` |
| GHCR `latest` and `sha-*` | Merge/push to `main` | Publishes `ghcr.io/tempguru-co/event-staffing` |
| MCP Registry initial check | `server.json` version change on `main` | Defers cleanly until the matching npm CLI exists |
| npm CLI | Manual `publish-npm.yml` with an exact version | Publishes `tempguru-mcp`; then re-dispatches the Registry workflow |
| Pi npm package | Manual `publish-pi.yml` with an exact version | Publishes `tempguru-pi` independently |
| GHCR semver tags | Push `vX.Y.Z` | Publishes `X.Y.Z` and `X.Y` image tags |
| Apex Cloudflare discovery | Manual | Deploys the two committed worker files |
| Hermes and ClawHub catalogs | Manual | Refreshes third-party skill copies |

Cloudflare and the external catalogs do not deploy from GitHub Actions.

## One-time prerequisites

1. Confirm the Vercel GitHub App can access
   `Tempguru-co/tempguru-mcp` and that `main` deploys to Production.
2. In npm package settings for `tempguru-mcp`, configure the Trusted Publisher
   identity exactly as:

   - Organization: `Tempguru-co`
   - Repository: `tempguru-mcp`
   - Workflow filename: `publish-npm.yml`
   - Environment: `Production`
   - Allowed action: `npm publish`

3. Configure the existing `tempguru-pi` npm package the same way, except use
   workflow filename `publish-pi.yml`. Because this workflow is introduced by
   the `1.6.0` release, merge it to the default branch before configuring the
   Pi trusted publisher if npm does not yet accept that filename.
4. In GitHub, add the Ed25519 private key as an environment secret:
   **Settings → Environments → Production → Environment secrets →
   `MCP_PRIVATE_KEY`**. A repository-level secret with the same name is not the
   documented release configuration.
   Restrict that environment to the `main` branch. If you add a required
   reviewer, expect the npm and Registry jobs to pause for that approval.
5. Confirm the GHCR package is public and the release operator can merge,
   dispatch Actions, push tags, edit both Cloudflare workers, update Hermes PR
   #39150, and publish the TempGuru ClawHub skills.
6. Protect the `v*` tag namespace with a GitHub repository ruleset so only
   release maintainers can create or update release tags. The Docker workflow
   also rejects a tag whose version does not equal `package.json`.

The npm workflows use OIDC. Do not create or use a long-lived npm token for a
normal release.

## 1. Validate the candidate

Run from the repository root on the release branch:

```bash
npm ci
npm run typecheck
npm run test:unit
npm run build:stdio
npm run evals
npm run test:protocol
npm run build
npm run build:worker
npm run build:llms-worker -- --from-committed
npm run check:submissions
npm run build:cli
npm run check:cli-package
npm pack --dry-run --json ./cli
npm pack --dry-run --json ./distribution/pi
git diff --check
```

The build and worker commands regenerate committed artifacts. Review and commit
those outputs; do not leave generated drift for the release workflows to
discover.

Version `1.6.0` intentionally drops the EOL Node 18 runtime and requires Node
20 or newer. This is a runtime-compatibility break even though the requested
release number is a minor version, so call it out prominently in the GitHub and
npm release notes. CI exercises the packaged CLI on Node 20.

For an MCP CLI release, these values must all equal the intended version:

```bash
node -p 'require("./package.json").version'
node -p 'require("./package-lock.json").version'
node -p 'require("./cli/package.json").version'
node -p 'require("./server.json").version'
```

The Pi package is independently versioned. For a Pi `1.6.0` release, also
confirm:

```bash
node -p 'require("./distribution/pi/package.json").version'
```

Review `git status --short`. The release commit must include the source,
generated artifacts, manifests, workflows, and documentation intended for the
release, with no unrelated city-page work.

## 2. Merge to `main`

Push the release branch, open a pull request to `main`, and wait for every
required check. Merge only after review.

After the merge, confirm:

1. Vercel creates a new Production deployment from the `main` commit.
2. `check-submissions` and `verify` pass.
3. `Publish Docker image` succeeds for `main`, producing `latest` and a
   `sha-*` tag.
4. The push-triggered Registry job either reports the version already
   published or cleanly defers pending npm. A defer before the npm step is
   expected and is not a failed release.

Do not tag a branch commit or publish a package before its exact source has
merged to `main`.

## 3. Publish the MCP CLI

In GitHub Actions, choose **Publish MCP CLI to npm**, select the `main` branch,
enter the exact committed version, and run the workflow. For `1.6.0`, the
equivalent GitHub CLI command is:

```bash
gh workflow run publish-npm.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main \
  -f version=1.6.0
```

The workflow reruns the full release gates, verifies that the root package,
CLI, `server.json`, and requested version match, inspects the package tarball,
publishes `tempguru-mcp`, and dispatches `publish-registry.yml`.

Wait for both workflows, then verify:

```bash
npm view tempguru-mcp@1.6.0 version
curl -fsS \
  'https://registry.modelcontextprotocol.io/v0/servers?search=co.tempguru/event-staffing&version=latest' \
  | jq -r '.servers[0].server.version'
```

Both commands must return `1.6.0`. If npm succeeds but the Registry dispatch
fails, run `publish-registry.yml` manually from `main`. Do not try to republish
an MCP Registry version that already exists.

## 4. Publish the Pi package

In GitHub Actions, choose **Publish Pi package to npm**, select `main`, enter
the Pi version, and run it:

```bash
gh workflow run publish-pi.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main \
  -f version=1.6.0
```

This workflow verifies the independently versioned Pi manifest, exact package
identity, generated skills, and tarball before its OIDC publish. Do not replace
it with a local `npm publish`.

Verify:

```bash
npm view tempguru-pi@1.6.0 version
```

Then install `npm:tempguru-pi` in a clean Pi session, restart Pi, and confirm:

- `/skills` lists all eight TempGuru skills.
- The tool list contains `tempguru_get_cities` through
  `tempguru_request_quote`.
- A read-only lookup succeeds.
- `tempguru_request_quote` still requires explicit confirmation; do not submit
  a real test lead.

## 5. Deploy apex discovery to Cloudflare

Vercel does not serve the `tempguru.co` apex discovery routes. After the new
Vercel deployment is healthy, deploy these committed files manually:

1. Paste the **entire** `cloudflare/worker.js` file into the Cloudflare worker
   bound to the apex `.well-known/*` and `robots.txt` routes; deploy it.
2. Paste the **entire** `cloudflare/llms-worker.js` file into the worker bound
   to `llms.txt` and `llms-full.txt`; deploy it.
3. Record the prior deployment IDs so either worker can be rolled back
   independently.

Never paste a fragment, prose, or a diff into the Worker editor. Do not
regenerate content inside Cloudflare; the committed files are the release
artifacts.

Run the live canary only after Vercel and both workers are deployed:

```bash
gh workflow run check-live-discovery.yml \
  --repo Tempguru-co/tempguru-mcp \
  --ref main
```

The same canary can be run locally with `npm run check:live-discovery`. It
checks both origins, all eight skill artifacts and digests, the 12-tool
dual-era contract, and the hosted discovery files.

## 6. Tag the release and verify GHCR

After npm, Pi, Registry, Vercel, and Cloudflare verify, tag the merge commit:

```bash
git fetch origin
git switch main
git pull --ff-only
git tag -a v1.6.0 -m "TempGuru MCP v1.6.0"
git push origin v1.6.0
```

The tag starts `docker.yml`, which publishes GHCR tags `1.6.0` and `1.6`.
Verify the immutable versioned image:

```bash
docker buildx imagetools inspect \
  ghcr.io/tempguru-co/event-staffing:1.6.0
```

Creating a GitHub Release from the verified tag is optional. Create it as a
draft first:

```bash
gh release create v1.6.0 \
  --repo Tempguru-co/tempguru-mcp \
  --title "TempGuru MCP v1.6.0" \
  --draft \
  --generate-notes
```

Before publishing the draft, add a prominent compatibility note that the CLI
now requires Node 20+ and no longer supports Node 18.

## 7. Refresh the external skill catalogs

These are catalog updates, not changes to either live VPS agent runtime.

### Hermes

Sync the two committed Hermes submission files to the existing fork branch:

| Repository source | PR #39150 target |
|---|---|
| `distribution/assistants/hermes/SKILL.md` | `optional-skills/productivity/event-staffing/SKILL.md` |
| `distribution/assistants/hermes/test_event_staffing_skill.py` | `tests/skills/test_event_staffing_skill.py` |

Push the fork branch and request another review on NousResearch/hermes-agent
PR #39150. Do not modify or restart the separate Hermes content agent on the
Hostinger VPS.

### ClawHub

Republish the five canonical skills changed for `1.6.0` through the existing
`kissmyabs32` ClawHub publisher account:

- `tempguru-event-staffing-ordering`
- `tempguru-staffing-plan-from-event-brief`
- `tempguru-urgent-event-backfill`
- `tempguru-multi-city-activation-planner`
- `tempguru-event-staffing-procurement`

Use each matching `skills/<canonical-slug>/SKILL.md` from the tagged commit.
Verify each resulting listing at
`https://clawhub.ai/api/v1/skills/<published-slug>`.

**Do not SSH to or change the legacy OpenClaw VPS container at
`/docker/openclaw-y5yb/`. Do not edit `openclaw.json`, restart
`openclaw-gateway`, or touch its sibling agents.** ClawHub publication is an
independent catalog operation.

## 8. Close the release

Do not mark a version live in status trackers until all applicable checks are
true:

- Vercel Production serves the merge commit.
- `tempguru-mcp@1.6.0` and `tempguru-pi@1.6.0` resolve from npm.
- MCP Registry reports `1.6.0`.
- Both Cloudflare worker deployments are live.
- `check-live-discovery.yml` passes.
- GHCR exposes `latest`, `1.6.0`, `1.6`, and the expected `sha-*` image.
- Hermes PR #39150 contains the current files and has been re-submitted for
  review.
- The five changed ClawHub artifacts have been republished and verified.

Then update the distribution status tracker and release notes with the actual
publication results. At minimum, remove or replace the pre-release `1.5.0`
claims in `README.md`, `README.zh-CN.md`, `llms-install.md`,
`distribution/assistants/README.md`, `distribution/ai-agents-page.html`, and
`distribution/ai-agents-page.zh-CN.html`. Keep pending third-party reviews
labeled pending.

## Rollback and forward-fix

- **Vercel:** use the Vercel deployment rollback/promote controls.
- **Cloudflare:** roll back each worker from its Deployments tab.
- **npm and MCP Registry:** published versions are immutable. Prefer a
  forward-fix release such as `1.6.1`; do not overwrite or republish `1.6.0`.
- **GHCR:** preserve the versioned tag. A corrective `main` deployment can move
  `latest`; publish a new semantic version for a permanent fix.
