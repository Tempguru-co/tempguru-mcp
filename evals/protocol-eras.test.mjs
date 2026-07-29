// Deterministic dual-era transport conformance for the official MCP v2 HTTP
// entry. This bundles the real TempGuru registry with esbuild, then drives the
// returned fetch handler using raw Web Requests (no sockets and no MCP client
// helpers hiding envelope/header mistakes).
//
// Run directly:
//   node evals/protocol-eras.test.mjs

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const MODERN_VERSION = "2026-07-28";
const LEGACY_VERSION = "2025-11-25";
const SERVER_INFO_META_KEY = "io.modelcontextprotocol/serverInfo";
const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
const CLIENT_CAPABILITIES_META_KEY = "io.modelcontextprotocol/clientCapabilities";
const HEADER_MISMATCH = -32020;

const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const registrySource = readFileSync(
  join(repoRoot, "src", "lib", "mcp", "register-tools.ts"),
  "utf8",
);

// Keep the expectation coupled to the canonical registry rather than a copied
// list. A newly registered tool (including save_staffing_plan) is picked up
// automatically as long as it uses the canonical server.registerTool(...) form.
const expectedToolNames = [
  ...new Set(
    [...registrySource.matchAll(/\bserver\.registerTool\(\s*["'`]([^"'`]+)["'`]/g)]
      .map((match) => match[1]),
  ),
].sort();
assert.ok(
  expectedToolNames.length > 0,
  "could not discover any server.registerTool(...) calls in register-tools.ts",
);
assert.ok(
  expectedToolNames.includes("save_staffing_plan"),
  "production registry must include save_staffing_plan",
);

async function loadHarness() {
  const result = await build({
    stdin: {
      contents: `
        export {
          createMcpHandler,
        } from "@modelcontextprotocol/server";
        export {
          createTempGuruMcpServer,
        } from "./src/lib/mcp/create-server.ts";
      `,
      resolveDir: repoRoot,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
    logLevel: "silent",
  });

  const buildDir = mkdtempSync(join(tmpdir(), "tempguru-protocol-eras-"));
  const modulePath = join(buildDir, "harness.mjs");
  writeFileSync(modulePath, result.outputFiles[0].text);
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(buildDir, { recursive: true, force: true }),
  };
}

function modernMeta() {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_VERSION,
    [CLIENT_INFO_META_KEY]: {
      name: "tempguru-protocol-conformance",
      version: "1.0.0",
    },
    [CLIENT_CAPABILITIES_META_KEY]: {},
  };
}

function rpcBody(id, method, params = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

function requestFor(body, headers = {}) {
  return new Request("https://test.local/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function readRpcResponse(response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return { response, body: JSON.parse(text), raw: text };
  }

  if (contentType.includes("text/event-stream")) {
    const messages = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const body = messages.findLast(
      (message) => message && typeof message === "object" && "id" in message,
    );
    assert.ok(body, `SSE response carried no JSON-RPC result: ${text}`);
    return { response, body, raw: text };
  }

  assert.fail(`unexpected response content-type ${contentType}: ${text}`);
}

function assertNoSessionHeader(response, label) {
  assert.equal(
    response.headers.get("mcp-session-id"),
    null,
    `${label} unexpectedly created a session`,
  );
}

function assertSuccessfulRpc(exchange, id, label) {
  assert.equal(exchange.response.status, 200, `${label}: ${exchange.raw}`);
  assert.equal(exchange.body.jsonrpc, "2.0", `${label}: missing JSON-RPC version`);
  assert.equal(exchange.body.id, id, `${label}: response id mismatch`);
  assert.ok(exchange.body.result, `${label}: ${exchange.raw}`);
  assert.equal(exchange.body.error, undefined, `${label}: ${exchange.raw}`);
  return exchange.body.result;
}

function assertHeaderMismatch(exchange, id, label) {
  assert.equal(exchange.response.status, 400, `${label}: ${exchange.raw}`);
  assert.equal(exchange.body.jsonrpc, "2.0", `${label}: missing JSON-RPC version`);
  assert.equal(exchange.body.id, id, `${label}: response id mismatch`);
  assert.equal(exchange.body.error?.code, HEADER_MISMATCH, `${label}: ${exchange.raw}`);
  assert.match(
    exchange.body.error?.message ?? "",
    /headers? and body disagree/i,
    `${label}: ${exchange.raw}`,
  );
  assertNoSessionHeader(exchange.response, label);
}

const { module: harness, cleanup } = await loadHarness();
const { createMcpHandler, createTempGuruMcpServer } = harness;
const expectedServerInfo = {
  name: "tempguru-mcp",
  version: packageJson.version,
};

const reportedErrors = [];
const handler = createMcpHandler(
  () => createTempGuruMcpServer(),
  {
    legacy: "stateless",
    responseMode: "json",
    onerror: (error) => reportedErrors.push(error),
  },
);

try {
  const legacyInitializeId = "legacy-initialize";
  const legacyInitialize = await readRpcResponse(
    await handler.fetch(
      requestFor(
        rpcBody(legacyInitializeId, "initialize", {
          protocolVersion: LEGACY_VERSION,
          capabilities: {},
          clientInfo: {
            name: "tempguru-legacy-conformance",
            version: "1.0.0",
          },
        }),
      ),
    ),
  );
  const legacyInitializeResult = assertSuccessfulRpc(
    legacyInitialize,
    legacyInitializeId,
    "legacy initialize",
  );
  assert.equal(legacyInitializeResult.protocolVersion, LEGACY_VERSION);
  assert.equal(legacyInitializeResult.serverInfo?.name, expectedServerInfo.name);
  assert.equal(
    legacyInitializeResult.serverInfo?.version,
    expectedServerInfo.version,
  );
  assertNoSessionHeader(legacyInitialize.response, "legacy initialize");

  const legacyToolsId = "legacy-tools-list";
  const legacyTools = await readRpcResponse(
    await handler.fetch(
      requestFor(rpcBody(legacyToolsId, "tools/list", {}), {
        "mcp-protocol-version": LEGACY_VERSION,
      }),
    ),
  );
  const legacyToolsResult = assertSuccessfulRpc(
    legacyTools,
    legacyToolsId,
    "legacy tools/list",
  );
  const legacyToolNames = legacyToolsResult.tools.map((tool) => tool.name).sort();
  assert.deepEqual(legacyToolNames, expectedToolNames);
  assertNoSessionHeader(legacyTools.response, "legacy tools/list");

  const discoverId = "modern-discover";
  const modernDiscover = await readRpcResponse(
    await handler.fetch(
      requestFor(
        rpcBody(discoverId, "server/discover", { _meta: modernMeta() }),
        {
          "mcp-protocol-version": MODERN_VERSION,
          "mcp-method": "server/discover",
        },
      ),
    ),
  );
  const discoverResult = assertSuccessfulRpc(
    modernDiscover,
    discoverId,
    "modern server/discover",
  );
  assert.equal(discoverResult.resultType, "complete");
  assert.deepEqual(discoverResult.supportedVersions, [MODERN_VERSION]);
  assert.equal(discoverResult.ttlMs, 300_000);
  assert.equal(discoverResult.cacheScope, "public");
  assert.ok(discoverResult.capabilities?.tools, "discover omitted tools capability");
  assert.equal(
    discoverResult._meta?.[SERVER_INFO_META_KEY]?.name,
    expectedServerInfo.name,
  );
  assert.equal(
    discoverResult._meta?.[SERVER_INFO_META_KEY]?.version,
    expectedServerInfo.version,
  );
  assertNoSessionHeader(modernDiscover.response, "modern server/discover");

  const modernToolsId = "modern-tools-list";
  const modernTools = await readRpcResponse(
    await handler.fetch(
      requestFor(
        rpcBody(modernToolsId, "tools/list", { _meta: modernMeta() }),
        {
          "mcp-protocol-version": MODERN_VERSION,
          "mcp-method": "tools/list",
        },
      ),
    ),
  );
  const modernToolsResult = assertSuccessfulRpc(
    modernTools,
    modernToolsId,
    "modern tools/list",
  );
  const modernToolNames = modernToolsResult.tools.map((tool) => tool.name).sort();
  assert.deepEqual(modernToolNames, expectedToolNames);
  assert.deepEqual(modernToolNames, legacyToolNames);
  assert.equal(modernToolsResult.resultType, "complete");
  assert.equal(modernToolsResult.ttlMs, 300_000);
  assert.equal(modernToolsResult.cacheScope, "public");
  assert.equal(
    modernToolsResult._meta?.[SERVER_INFO_META_KEY]?.name,
    expectedServerInfo.name,
  );
  assertNoSessionHeader(modernTools.response, "modern tools/list");

  // Dynamic tool results must not inherit the public catalog cache policy.
  // This is especially important for non-contact saved-plan writes now and
  // future contact-bearing transaction continuations.
  const modernSaveId = "modern-save-plan";
  const modernSave = await readRpcResponse(
    await handler.fetch(
      requestFor(
        rpcBody(modernSaveId, "tools/call", {
          _meta: modernMeta(),
          name: "save_staffing_plan",
          arguments: {
            city: "Chicago",
            event_date: "2027-05-14",
            event_type: "trade-show",
            roles: [
              {
                role: "registration-staff",
                headcount: 4,
                hours_per_shift: 8,
                days: 2,
              },
            ],
          },
        }),
        {
          "mcp-protocol-version": MODERN_VERSION,
          "mcp-method": "tools/call",
          "mcp-name": "save_staffing_plan",
        },
      ),
    ),
  );
  const modernSaveResult = assertSuccessfulRpc(
    modernSave,
    modernSaveId,
    "modern save_staffing_plan",
  );
  assert.equal(modernSaveResult.resultType, "complete");
  assert.ok(
    modernSaveResult.ttlMs === undefined || modernSaveResult.ttlMs === 0,
    `write result advertised a positive cache TTL: ${modernSave.raw}`,
  );
  assert.ok(
    modernSaveResult.cacheScope === undefined ||
      modernSaveResult.cacheScope === "private",
    `write result advertised a non-private cache scope: ${modernSave.raw}`,
  );
  assert.ok(
    ["saved", "storage_unavailable"].includes(
      modernSaveResult.structuredContent?.status,
    ),
    `unexpected save result: ${modernSave.raw}`,
  );
  assertNoSessionHeader(modernSave.response, "modern save_staffing_plan");

  const versionMismatchId = "version-header-body-mismatch";
  const versionMismatch = await readRpcResponse(
    await handler.fetch(
      requestFor(
        rpcBody(versionMismatchId, "tools/list", { _meta: modernMeta() }),
        {
          "mcp-protocol-version": LEGACY_VERSION,
          "mcp-method": "tools/list",
        },
      ),
    ),
  );
  assertHeaderMismatch(
    versionMismatch,
    versionMismatchId,
    "protocol-version header/body mismatch",
  );

  const methodMismatchId = "method-header-body-mismatch";
  const methodMismatch = await readRpcResponse(
    await handler.fetch(
      requestFor(
        rpcBody(methodMismatchId, "tools/list", { _meta: modernMeta() }),
        {
          "mcp-protocol-version": MODERN_VERSION,
          "mcp-method": "resources/list",
        },
      ),
    ),
  );
  assertHeaderMismatch(
    methodMismatch,
    methodMismatchId,
    "method header/body mismatch",
  );

  const nameMismatchId = "name-header-body-mismatch";
  const nameMismatch = await readRpcResponse(
    await handler.fetch(
      requestFor(
        rpcBody(nameMismatchId, "tools/call", {
          _meta: modernMeta(),
          name: "get_cities",
          arguments: {},
        }),
        {
          "mcp-protocol-version": MODERN_VERSION,
          "mcp-method": "tools/call",
          "mcp-name": "get_roles",
        },
      ),
    ),
  );
  assertHeaderMismatch(
    nameMismatch,
    nameMismatchId,
    "Mcp-Name header/body mismatch",
  );

  assert.ok(
    reportedErrors.length >= 3,
    "expected the handler to report each deliberate malformed request",
  );

  console.log(
    `PASS protocol eras: ${expectedToolNames.length} tools match across legacy and modern; discover, cache, identity, statelessness, and header mismatch gates conform`,
  );
} finally {
  await handler.close();
  cleanup();
}
