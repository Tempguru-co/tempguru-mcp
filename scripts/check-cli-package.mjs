// Exercise the built npm CLI from its packaged directory layout. The stdio
// build used by normal evals can fall back to content/skills; this check proves
// the files shipped under cli/skills/<slug>/SKILL.md are actually discovered
// and exposed as MCP resources before npm publishing.

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS } from "./gen-skill-digests.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isolatedRoot = mkdtempSync(join(tmpdir(), "tempguru-cli-package-"));
const isolatedCli = join(isolatedRoot, "package");
cpSync(join(root, "cli"), isolatedCli, { recursive: true });
const server = spawn("node", [join(isolatedCli, "index.mjs")], {
  cwd: isolatedCli,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "test" },
});

let stdout = "";
let stderr = "";
let nextId = 1;
const pending = new Map();

server.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
  let newline;
  while ((newline = stdout.indexOf("\n")) >= 0) {
    const line = stdout.slice(0, newline).trim();
    stdout = stdout.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) continue;
    clearTimeout(waiter.timer);
    pending.delete(message.id);
    waiter.resolve(message);
  }
});
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}. stderr: ${stderr}`));
    }, 10_000);
    pending.set(id, { resolve, reject, timer });
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function notify(method, params) {
  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

try {
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "tempguru-cli-package-check", version: "1.0.0" },
  });
  notify("notifications/initialized", {});

  const listed = await rpc("resources/list", {});
  const resources = listed.result?.resources ?? [];
  const byUri = new Map(resources.map((resource) => [resource.uri, resource]));
  if (resources.length !== SKILLS.length) {
    throw new Error(`Expected ${SKILLS.length} skill resources, received ${resources.length}. stderr: ${stderr}`);
  }

  for (const slug of SKILLS) {
    const uri = `https://tempguru.co/.well-known/skills/${slug}/SKILL.md`;
    if (!byUri.has(uri)) throw new Error(`Missing packaged skill resource: ${uri}`);
    const read = await rpc("resources/read", { uri });
    const served = read.result?.contents?.[0]?.text;
    const packaged = readFileSync(join(isolatedCli, "skills", slug, "SKILL.md"), "utf8");
    if (served !== packaged) throw new Error(`Packaged skill bytes drifted for ${slug}`);
  }

  if (stderr.includes("Skill resources not found")) {
    throw new Error(`CLI reported missing skill resources: ${stderr}`);
  }
  console.log(`CLI package OK: ${SKILLS.length} canonical MCP skill resources loaded from cli/skills/.`);
} finally {
  server.kill();
  for (const waiter of pending.values()) clearTimeout(waiter.timer);
  rmSync(isolatedRoot, { recursive: true, force: true });
}
