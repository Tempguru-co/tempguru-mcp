// Deterministic eval harness for the TempGuru MCP server.
//
// Spawns the stdio build (dist/mcp-stdio.mjs), runs the golden tool-call cases
// in evals/golden-cases.json, and greps each result for required markers.
// No LLM, no network beyond the bundled data: stable in CI.
//
//   npm run build:stdio && node evals/run-evals.mjs
//
// The companion platform-level recall/precision set (does an ASSISTANT decide
// to invoke these tools at the right moments?) lives in EVALS.md, that half
// needs a live assistant and human scoring.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, "golden-cases.json"), "utf-8"));

const server = spawn("node", [join(here, "..", "dist", "mcp-stdio.mjs")], {
  stdio: ["pipe", "pipe", "inherit"],
  env: {
    ...process.env,
    NODE_ENV: "test",
    TEMPGURU_EVAL_MEMORY_REDIS: "1",
  },
});

let buf = "";
const pending = new Map();
server.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      // non-JSON line, ignore
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }
    }, 10000);
  });
}

function notify(method, params) {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name + (detail ? ` (${detail})` : ""));
    console.log(`  FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  }
}

try {
  await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "tempguru-evals", version: "1.0" },
  });
  notify("notifications/initialized");

  // Surface checks: the full tool + prompt inventory must be advertised.
  const tools = await rpc("tools/list", {});
  const toolNames = (tools.result?.tools ?? []).map((t) => t.name).sort();
  check(
    "tools/list advertises all 12 tools",
    JSON.stringify(toolNames) ===
      JSON.stringify([
        "check_availability",
        "get_cities",
        "get_compliance_by_state",
        "get_plan",
        "get_policies",
        "get_quote_status",
        "get_rate_benchmark",
        "get_role_pricing",
        "get_roles",
        "plan_staffing",
        "request_quote",
        "save_staffing_plan",
      ]),
    toolNames.join(","),
  );
  const toolByName = new Map((tools.result?.tools ?? []).map((tool) => [tool.name, tool]));
  const pureReadTools = toolNames.filter(
    (name) =>
      name !== "plan_staffing" &&
      name !== "save_staffing_plan" &&
      name !== "request_quote",
  );
  check(
    "tool annotations distinguish lookups, compatibility persistence, explicit save, and quote submission",
    pureReadTools.every((name) => toolByName.get(name)?.annotations?.readOnlyHint === true) &&
      toolByName.get("plan_staffing")?.annotations?.readOnlyHint === false &&
      toolByName.get("plan_staffing")?.annotations?.destructiveHint === false &&
      toolByName.get("save_staffing_plan")?.annotations?.readOnlyHint === false &&
      toolByName.get("save_staffing_plan")?.annotations?.destructiveHint === false &&
      toolByName.get("request_quote")?.annotations?.readOnlyHint === false,
    JSON.stringify(
      Object.fromEntries(
        toolNames.map((name) => [name, toolByName.get(name)?.annotations]),
      ),
    ),
  );

  const prompts = await rpc("prompts/list", {});
  const promptNames = (prompts.result?.prompts ?? []).map((p) => p.name).sort();
  check(
    "prompts/list advertises both prompts",
    JSON.stringify(promptNames) === JSON.stringify(["plan-event-staffing", "staffing-compliance-brief"]),
    promptNames.join(","),
  );

  // Golden tool-call cases.
  for (const c of cases) {
    if (c.workflow === "plan_quote_roundtrip") {
      const planned = await rpc("tools/call", {
        name: "plan_staffing",
        arguments: c.arguments.plan,
      });
      const plan = planned.result?.structuredContent;
      const saved = plan?.plan_id
        ? null
        : await rpc("tools/call", {
            name: "save_staffing_plan",
            arguments: c.arguments.plan,
          });
      const savedPlan = saved?.result?.structuredContent;
      const planId = plan?.plan_id ?? savedPlan?.plan_id;
      const restored = planId
        ? await rpc("tools/call", { name: "get_plan", arguments: { plan_id: planId } })
        : null;
      const quoted = planId
        ? await rpc("tools/call", {
            name: "request_quote",
            arguments: { ...c.arguments.quote, plan_id: planId },
          })
        : null;
      const reference = quoted?.result?.structuredContent?.reference;
      const status = reference
        ? await rpc("tools/call", {
            name: "get_quote_status",
            arguments: { reference },
          })
        : null;
      const text = JSON.stringify({ plan, savedPlan, restored, quoted, status });
      const missing = c.expect.filter((marker) => !text.includes(marker));
      if (quoted?.result?.structuredContent?.plan_linked !== true) {
        missing.push("plan_linked:true");
      }
      check(c.name, missing.length === 0, missing.length ? `missing: ${missing.join(" | ")}` : "");
      continue;
    }
    const res = await rpc("tools/call", { name: c.tool, arguments: c.arguments });
    const text = JSON.stringify(res.result ?? res.error ?? {});
    const missing = c.expect.filter((marker) => !text.includes(marker));
    check(c.name, missing.length === 0, missing.length ? `missing: ${missing.join(" | ")}` : "");
  }
} catch (err) {
  console.error("eval run crashed:", err);
  fail++;
} finally {
  server.kill();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("failures:\n - " + failures.join("\n - "));
  process.exit(1);
}
