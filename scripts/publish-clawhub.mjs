#!/usr/bin/env node
// Publishes the 8 canonical TempGuru skills to ClawHub (the OpenClaw skill
// registry) at the repository version, under the existing @kissmyabs32 slugs
// and display names. No repository workflow can do this: it needs the
// operator's ClawHub login.
//
//   npx -y clawhub@latest login          # once per machine
//   npm run publish:clawhub -- --dry-run # preview every publish
//   npm run publish:clawhub              # publish
//
// Versions on ClawHub cannot be republished; a skill whose latest version
// already equals the repository version is skipped. Slugs and names match the
// listings created 2026-06-04 and updated through 2026-11-02, so republishing
// never creates a second listing.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const dryRun = process.argv.includes("--dry-run");
const CLAWHUB = ["-y", "clawhub@latest"];

// repository skill folder -> [ClawHub slug, ClawHub display name]
const SKILLS = {
  "event-staffing-ordering": ["tempguru-event-staffing-ordering", "Event Staffing Ordering"],
  "event-staffing-compliance": ["tempguru-event-staffing-compliance", "TempGuru Event Staffing Compliance"],
  "staffing-plan-from-event-brief": ["tempguru-staffing-plan-from-event-brief", "Staffing Plan From Event Brief"],
  "urgent-event-backfill": ["tempguru-urgent-event-backfill", "Urgent Event Backfill"],
  "staffing-agency-partner-growth": ["tempguru-staffing-agency-partner-growth", "Staffing Agency Partner Growth"],
  "multi-city-activation-planner": ["tempguru-multi-city-activation-planner", "Multi City Activation Planner"],
  "event-staffing-procurement": ["tempguru-event-staffing-procurement", "Event Staffing Procurement"],
  "tempguru-pro-operations": ["tempguru-pro-operations", "TempGuru Pro Operations"],
};

const CHANGELOG =
  `TempGuru MCP ${version}: MCP tool renames check_availability -> get_lead_time_guidance, ` +
  "request_quote -> prepare_quote_form, get_quote_status -> get_quote_request_status " +
  "(inputs and behavior unchanged); published booking policies; 300+ U.S. and Canadian markets wording.";

function clawhub(args, { capture = false } = {}) {
  const result = spawnSync("npx", [...CLAWHUB, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  return result;
}

const who = clawhub(["whoami"], { capture: true });
if (who.status !== 0) {
  console.error("Not logged in to ClawHub. Run: npx -y clawhub@latest login");
  process.exit(1);
}
console.log(`ClawHub account: ${who.stdout.trim()}`);

const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain", "--", "skills"], { cwd: repoRoot, encoding: "utf8" }).trim();
if (dirty && !dryRun) {
  console.error("skills/ has uncommitted changes; publish only committed skill text (git stash, then rerun).");
  process.exit(1);
}

const failures = [];
for (const [dir, [slug, name]] of Object.entries(SKILLS)) {
  const info = clawhub(["inspect", slug], { capture: true });
  const latest = /Latest\s+(\S+)/.exec(info.stdout ?? "")?.[1];
  if (latest === version) {
    console.log(`= ${slug}: already at ${version}, skipped`);
    continue;
  }
  console.log(`${dryRun ? "~" : "+"} ${slug}: ${latest ?? "(new)"} -> ${version}`);
  const run = clawhub([
    "skill", "publish", join("skills", dir),
    "--slug", slug,
    "--name", name,
    "--version", version,
    "--changelog", CHANGELOG,
    "--source-repo", "Tempguru-co/tempguru-mcp",
    "--source-commit", sha,
    "--source-path", `skills/${dir}`,
    ...(dryRun ? ["--dry-run"] : []),
  ]);
  if (run.status !== 0) failures.push(slug);
}

if (failures.length) {
  console.error(`Failed: ${failures.join(", ")}. Rerun to retry; published skills are skipped.`);
  process.exit(1);
}
console.log(dryRun ? "Dry run complete; rerun without --dry-run to publish." : `Published ${version} to ClawHub.`);
