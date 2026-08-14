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
const canonicalPolicyRows = JSON.parse(
  readFileSync(join(here, "..", "content", "mcp-data", "policies.json"), "utf-8"),
).policies;
const canonicalPolicyTopics = canonicalPolicyRows
  .filter((policy) =>
    policy.topic !== "offers" || Date.now() < Date.parse("2027-01-01T05:00:00.000Z"))
  .map((policy) => policy.topic);

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
  const initialized = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "tempguru-evals", version: "1.0" },
  });
  notify("notifications/initialized");
  check(
    "server instructions advertise the exact published AGENT5 policy pointer",
    initialized.result?.instructions?.includes(
      "A published first-order offer (code AGENT5) exists; get_policies returns its exact terms.",
    ) === true,
    initialized.result?.instructions ?? "missing instructions",
  );

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
      name !== "save_staffing_plan",
  );
  check(
    "tool annotations distinguish ten reads from two non-destructive non-PII writes",
    pureReadTools.every((name) => toolByName.get(name)?.annotations?.readOnlyHint === true) &&
      toolByName.get("plan_staffing")?.annotations?.readOnlyHint === false &&
      toolByName.get("plan_staffing")?.annotations?.destructiveHint === false &&
      toolByName.get("save_staffing_plan")?.annotations?.readOnlyHint === false &&
      toolByName.get("save_staffing_plan")?.annotations?.destructiveHint === false &&
      toolByName.get("request_quote")?.annotations?.readOnlyHint === true &&
      toolByName.get("request_quote")?.annotations?.idempotentHint === true,
    JSON.stringify(
      Object.fromEntries(
        toolNames.map((name) => [name, toolByName.get(name)?.annotations]),
      ),
    ),
  );

  const canonicalEventTypes = [
    "trade-show",
    "conference",
    "festival",
    "concert",
    "sporting-event",
    "corporate",
    "brand-activation",
    "other",
  ];
  const planInput = toolByName.get("plan_staffing")?.inputSchema?.properties ?? {};
  const saveInput = toolByName.get("save_staffing_plan")?.inputSchema?.properties ?? {};
  const availabilityInput =
    toolByName.get("check_availability")?.inputSchema?.properties ?? {};
  const policiesInput = toolByName.get("get_policies")?.inputSchema?.properties ?? {};
  check(
    "planning tools advertise the canonical event_type enum",
    JSON.stringify(planInput.event_type?.enum) === JSON.stringify(canonicalEventTypes) &&
      JSON.stringify(saveInput.event_type?.enum) === JSON.stringify(canonicalEventTypes),
    JSON.stringify({
      plan: planInput.event_type,
      save: saveInput.event_type,
    }),
  );
  check(
    "event-date tool inputs advertise JSON Schema date format",
    planInput.event_date?.format === "date" &&
      saveInput.event_date?.format === "date" &&
      availabilityInput.date?.format === "date",
    JSON.stringify({
      plan: planInput.event_date,
      save: saveInput.event_date,
      availability: availabilityInput.date,
    }),
  );
  check(
    "get_policies advertises every canonical policy topic as an enum",
    JSON.stringify(policiesInput.topic?.enum) === JSON.stringify(canonicalPolicyTopics),
    JSON.stringify(policiesInput.topic),
  );
  const oversizedDescriptions = [...toolByName.values()]
    .filter((tool) => (tool.description?.length ?? 0) > 1000)
    .map((tool) => `${tool.name}:${tool.description.length}`);
  check(
    "tool descriptions stay within the 1,000-character client budget",
    oversizedDescriptions.length === 0,
    oversizedDescriptions.join(","),
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
            arguments: {
              plan_id: planId,
              source_platform: "openclaw",
              skill_id: "event-staffing-ordering",
              skill_version: "1.7.1",
            },
          })
        : null;
      const text = JSON.stringify({ plan, savedPlan, restored, quoted });
      const missing = c.expect.filter((marker) => !text.includes(marker));
      const expectedOfferNote =
        "First-order offer AGENT5 may apply (5% off, $500 cap, expires 2026-12-31); see get_policies. Not reflected in the totals above.";
      const restoredPlan = restored?.result?.structuredContent;
      if (plan?.offer_note !== expectedOfferNote) missing.push("exact plan_staffing offer_note");
      if (restoredPlan?.offer_note !== expectedOfferNote) missing.push("exact get_plan offer_note");
      if (
        JSON.stringify(restoredPlan?.snapshot?.estimated_total_range) !==
        JSON.stringify(plan?.estimated_total_range)
      ) {
        missing.push("unchanged restored totals");
      }
      const quotedFormUrl = quoted?.result?.structuredContent?.form_url;
      if (typeof quotedFormUrl === "string" && new URL(quotedFormUrl).searchParams.has("details")) {
        missing.push("quote URL without free-text details");
      }
      if (
        quoted?.result?.structuredContent?.handoff_ready !== true ||
        quoted?.result?.structuredContent?.buyer_submission_required !== true
      ) {
        missing.push("buyer handoff");
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
