// Exercise the built npm CLI from its packaged directory layout. The stdio
// build used by normal evals can fall back to content/skills; this check proves
// the files shipped under cli/skills/<slug>/SKILL.md are actually discovered
// and exposed as MCP resources before npm publishing.
//
// Stdio connections pin their protocol era from the opening request, so the
// modern and legacy checks deliberately use separate child processes. This is
// the generic MCP CLI, which exposes the full remote-MCP contract; Pi's native
// fallback remains a separate, smaller REST-backed tool set.

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS } from "./gen-skill-digests.mjs";

const MODERN_VERSION = "2026-07-28";
const LEGACY_VERSION = "2025-11-25";
const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
const CLIENT_CAPABILITIES_META_KEY =
  "io.modelcontextprotocol/clientCapabilities";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Publishing uses the committed cli/ directory. A temporary override lets
// maintainers smoke-test a freshly bundled candidate without modifying that
// generated package directory.
const packageSource = process.env.TEMPGURU_CLI_PACKAGE_DIR
  ? resolve(process.env.TEMPGURU_CLI_PACKAGE_DIR)
  : join(root, "cli");
const registrySource = readFileSync(
  join(root, "src", "lib", "mcp", "register-tools.ts"),
  "utf8",
);
const expectedToolNames = [
  ...new Set(
    [
      ...registrySource.matchAll(
        /\bserver\.registerTool\(\s*["'`]([^"'`]+)["'`]/g,
      ),
    ].map((match) => match[1]),
  ),
].sort();
if (
  expectedToolNames.length !== 12 ||
  !expectedToolNames.includes("save_staffing_plan")
) {
  throw new Error(
    `Canonical registry must contain the 12-tool Phase A contract; found [${expectedToolNames.join(", ")}]`,
  );
}

const isolatedRoot = mkdtempSync(join(tmpdir(), "tempguru-cli-package-"));
const isolatedCli = join(isolatedRoot, "package");
cpSync(packageSource, isolatedCli, { recursive: true });

function modernMeta(clientName) {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_VERSION,
    [CLIENT_INFO_META_KEY]: { name: clientName, version: "1.0.0" },
    [CLIENT_CAPABILITIES_META_KEY]: {},
  };
}

function assertRpcResult(message, label) {
  if (message?.error || !message?.result) {
    throw new Error(
      `${label}: ${JSON.stringify(message?.error ?? message ?? null)}`,
    );
  }
  return message.result;
}

function assertExactToolSet(label, tools) {
  const names = tools.map((tool) => tool.name).sort();
  if (
    names.length !== expectedToolNames.length ||
    new Set(names).size !== names.length ||
    names.some((name, index) => name !== expectedToolNames[index])
  ) {
    throw new Error(
      `${label}: [${names.join(", ")}] != [${expectedToolNames.join(", ")}]`,
    );
  }

  const save = tools.find((tool) => tool.name === "save_staffing_plan");
  if (
    save?.annotations?.readOnlyHint !== false ||
    save?.annotations?.destructiveHint !== false
  ) {
    throw new Error(
      `${label}: save_staffing_plan must be a non-read-only, non-destructive artifact write`,
    );
  }

  const requestQuote = tools.find((tool) => tool.name === "request_quote");
  if (
    requestQuote?.annotations?.readOnlyHint !== true ||
    requestQuote?.annotations?.destructiveHint !== false ||
    requestQuote?.annotations?.idempotentHint !== true
  ) {
    throw new Error(
      `${label}: request_quote must be a read-only, idempotent buyer-form handoff`,
    );
  }
  const requestQuoteInput = JSON.stringify(requestQuote?.inputSchema ?? {});
  for (const forbidden of ["contact_name", "contact_email", "contact_phone", "company"]) {
    if (requestQuoteInput.includes(forbidden)) {
      throw new Error(
        `${label}: request_quote input still exposes forbidden contact field ${forbidden}`,
      );
    }
  }

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
  const planInput = tools.find((tool) => tool.name === "plan_staffing")
    ?.inputSchema?.properties;
  const saveInput = save?.inputSchema?.properties;
  const availabilityInput = tools.find(
    (tool) => tool.name === "check_availability",
  )?.inputSchema?.properties;
  if (
    JSON.stringify(planInput?.event_type?.enum) !==
      JSON.stringify(canonicalEventTypes) ||
    JSON.stringify(saveInput?.event_type?.enum) !==
      JSON.stringify(canonicalEventTypes)
  ) {
    throw new Error(`${label}: planning event_type schemas must use the canonical enum`);
  }
  if (
    planInput?.event_date?.format !== "date" ||
    saveInput?.event_date?.format !== "date" ||
    availabilityInput?.date?.format !== "date"
  ) {
    throw new Error(`${label}: MCP event-date inputs must advertise format:date`);
  }
  const oversizedDescriptions = tools.filter(
    (tool) => (tool.description?.length ?? 0) > 1000,
  );
  if (oversizedDescriptions.length) {
    throw new Error(
      `${label}: tool descriptions exceed 1,000 characters: ${oversizedDescriptions
        .map((tool) => `${tool.name}:${tool.description.length}`)
        .join(", ")}`,
    );
  }
}

function startSession(label) {
  const server = spawn("node", [join(isolatedCli, "index.mjs")], {
    cwd: isolatedCli,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test" },
  });

  let stdout = "";
  let stderr = "";
  let nextId = 1;
  const pending = new Map();

  const rejectPending = (error) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  };

  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    let newline;
    while ((newline = stdout.indexOf("\n")) >= 0) {
      const line = stdout.slice(0, newline).trim();
      stdout = stdout.slice(newline + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        rejectPending(
          new Error(
            `${label}: invalid JSON on MCP stdout (${error.message}): ${line}`,
          ),
        );
        continue;
      }

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
  server.on("error", (error) => {
    rejectPending(new Error(`${label}: child process error: ${error.message}`));
  });
  server.on("exit", (code, signal) => {
    if (pending.size) {
      rejectPending(
        new Error(
          `${label}: CLI exited before replying (code=${code}, signal=${signal}). stderr: ${stderr}`,
        ),
      );
    }
  });

  function rpc(method, params) {
    const id = `${label}-${nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}. stderr: ${stderr}`));
      }, 10_000);
      pending.set(id, { resolve, reject, timer });
      server.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
      );
    });
  }

  function notify(method, params) {
    server.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`,
    );
  }

  function close() {
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
    pending.clear();
    server.kill();
  }

  return {
    rpc,
    notify,
    close,
    stderr: () => stderr,
  };
}

async function assertPackagedResources(session, label, withMeta) {
  const params = (value = {}) =>
    withMeta
      ? {
          ...value,
          _meta: modernMeta(`tempguru-cli-package-${label}`),
        }
      : value;
  const listed = assertRpcResult(
    await session.rpc("resources/list", params()),
    `${label} resources/list`,
  );
  if (withMeta && listed.resultType !== "complete") {
    throw new Error(
      `${label} resources/list: expected modern resultType:complete`,
    );
  }

  const resources = listed.resources ?? [];
  const byUri = new Map(
    resources.map((resource) => [resource.uri, resource]),
  );
  if (resources.length !== SKILLS.length) {
    throw new Error(
      `${label}: expected ${SKILLS.length} skill resources, received ${resources.length}. stderr: ${session.stderr()}`,
    );
  }

  for (const slug of SKILLS) {
    const uri = `https://tempguru.co/.well-known/skills/${slug}/SKILL.md`;
    if (!byUri.has(uri)) {
      throw new Error(`${label}: missing packaged skill resource: ${uri}`);
    }
    const read = assertRpcResult(
      await session.rpc("resources/read", params({ uri })),
      `${label} resources/read ${slug}`,
    );
    const served = read.contents?.[0]?.text;
    const packaged = readFileSync(
      join(isolatedCli, "skills", slug, "SKILL.md"),
      "utf8",
    );
    if (served !== packaged) {
      throw new Error(`${label}: packaged skill bytes drifted for ${slug}`);
    }
  }
}

async function assertTools(session, label, withMeta) {
  const params = withMeta
    ? { _meta: modernMeta(`tempguru-cli-package-${label}`) }
    : {};
  const listed = assertRpcResult(
    await session.rpc("tools/list", params),
    `${label} tools/list`,
  );
  if (withMeta && listed.resultType !== "complete") {
    throw new Error(`${label} tools/list: expected modern resultType:complete`);
  }
  assertExactToolSet(`${label} tools/list`, listed.tools ?? []);
}

try {
  const legacy = startSession("legacy");
  try {
    const initialized = assertRpcResult(
      await legacy.rpc("initialize", {
        protocolVersion: LEGACY_VERSION,
        capabilities: {},
        clientInfo: {
          name: "tempguru-cli-package-legacy",
          version: "1.0.0",
        },
      }),
      "legacy initialize",
    );
    if (initialized.protocolVersion !== LEGACY_VERSION) {
      throw new Error(
        `legacy initialize negotiated ${initialized.protocolVersion}, expected ${LEGACY_VERSION}`,
      );
    }
    legacy.notify("notifications/initialized", {});
    await assertTools(legacy, "legacy", false);
    await assertPackagedResources(legacy, "legacy", false);
    if (legacy.stderr().includes("Skill resources not found")) {
      throw new Error(
        `legacy CLI reported missing skill resources: ${legacy.stderr()}`,
      );
    }
  } finally {
    legacy.close();
  }

  const modern = startSession("modern");
  try {
    const discovered = assertRpcResult(
      await modern.rpc("server/discover", {
        _meta: modernMeta("tempguru-cli-package-modern"),
      }),
      "modern server/discover",
    );
    if (
      !Array.isArray(discovered.supportedVersions) ||
      !discovered.supportedVersions.includes(MODERN_VERSION)
    ) {
      throw new Error(
        `modern server/discover omitted ${MODERN_VERSION}: ${JSON.stringify(discovered.supportedVersions)}`,
      );
    }
    await assertTools(modern, "modern", true);
    await assertPackagedResources(modern, "modern", true);
    if (modern.stderr().includes("Skill resources not found")) {
      throw new Error(
        `modern CLI reported missing skill resources: ${modern.stderr()}`,
      );
    }
  } finally {
    modern.close();
  }

  console.log(
    `CLI package OK: ${expectedToolNames.length} tools and ${SKILLS.length} packaged skill resources served over legacy ${LEGACY_VERSION} and modern ${MODERN_VERSION} stdio.`,
  );
} finally {
  rmSync(isolatedRoot, { recursive: true, force: true });
}
