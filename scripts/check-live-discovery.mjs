// Live canary for the two public discovery origins and the dual-era MCP
// endpoint. This deliberately runs outside pull-request CI: Vercel and the
// apex Cloudflare worker must be deployed before their bytes can match the
// merged canonical sources.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { SKILLS } from "./gen-skill-digests.mjs";

const ORIGINS = ["https://mcp.tempguru.co", "https://tempguru.co"];
const MCP_ENDPOINT = "https://mcp.tempguru.co/mcp";
const MODERN_VERSION = "2026-07-28";
const LEGACY_VERSION = "2025-11-25";
const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";
const CLIENT_INFO_META_KEY = "io.modelcontextprotocol/clientInfo";
const CLIENT_CAPABILITIES_META_KEY =
  "io.modelcontextprotocol/clientCapabilities";
const registrySource = readFileSync(
  new URL("../src/lib/mcp/register-tools.ts", import.meta.url),
  "utf8",
);
const TOOLS = [
  ...new Set(
    [
      ...registrySource.matchAll(
        /\bserver\.registerTool\(\s*["'`]([^"'`]+)["'`]/g,
      ),
    ].map((match) => match[1]),
  ),
];
if (TOOLS.length !== 12 || !TOOLS.includes("save_staffing_plan")) {
  throw new Error(
    `canonical registry must contain the 12-tool Phase A contract; found [${TOOLS.join(", ")}]`,
  );
}

async function fetchOk(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

function assertExactSet(label, names, expectedNames) {
  const expected = new Set(expectedNames);
  if (
    names.length !== expected.size ||
    new Set(names).size !== names.length ||
    names.some((name) => !expected.has(name))
  ) {
    throw new Error(
      `${label}: [${names.join(", ")}] != [${expectedNames.join(", ")}]`,
    );
  }
}

function assertPhaseAContract(label, descriptor) {
  const description = String(descriptor?.description ?? "");
  if (!/\b(?:12|twelve) tools\b/i.test(description)) {
    throw new Error(`${label}: expected a 12-tool description, got ${description}`);
  }
  for (const fragment of [
    "ten read-only",
    "plan_staffing",
    "save_staffing_plan",
    "request_quote",
  ]) {
    if (!description.includes(fragment)) {
      throw new Error(`${label}: description missing ${fragment}: ${description}`);
    }
  }

  if (descriptor?.protocolVersion !== MODERN_VERSION) {
    throw new Error(
      `${label}: preferred protocol ${descriptor?.protocolVersion} != ${MODERN_VERSION}`,
    );
  }
  const versions = Array.isArray(descriptor?.supportedProtocolVersions)
    ? descriptor.supportedProtocolVersions
    : [];
  if (
    new Set(versions).size !== versions.length ||
    !versions.includes(MODERN_VERSION) ||
    !versions.includes(LEGACY_VERSION)
  ) {
    throw new Error(
      `${label}: expected modern ${MODERN_VERSION} and legacy ${LEGACY_VERSION} support, got [${versions.join(", ")}]`,
    );
  }
  const compatibility = JSON.stringify(
    descriptor?.protocolCompatibility ?? {},
  );
  if (
    !compatibility.includes(MODERN_VERSION) ||
    !/legacy|initialize/i.test(compatibility)
  ) {
    throw new Error(`${label}: dual-era compatibility metadata is incomplete`);
  }

  const workflow = descriptor?.workflow;
  const instructions = Array.isArray(workflow?.instructions)
    ? workflow.instructions.join(" ")
    : "";
  if (
    workflow?.phase !== "A" ||
    !instructions.includes("plan_staffing") ||
    !instructions.includes("save_staffing_plan") ||
    !instructions.includes("plan_id") ||
    !/do not call save_staffing_plan/i.test(instructions) ||
    !/no plan_id/i.test(instructions) ||
    !instructions.includes("request_quote") ||
    !/buyer|form_url/i.test(instructions)
  ) {
    throw new Error(`${label}: staged Phase A workflow metadata is incomplete`);
  }
}

function modernMeta(clientName) {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_VERSION,
    [CLIENT_INFO_META_KEY]: { name: clientName, version: "1.0.0" },
    [CLIENT_CAPABILITIES_META_KEY]: {},
  };
}

async function postRpc(body, headers = {}) {
  const response = await fetchOk(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let message;
  if (contentType.includes("application/json")) {
    message = JSON.parse(text);
  } else if (contentType.includes("text/event-stream")) {
    message = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .findLast((candidate) => candidate?.id === body.id);
  }
  if (!message || message.error || !message.result) {
    throw new Error(
      `${MCP_ENDPOINT} ${body.method}: invalid JSON-RPC response ${text}`,
    );
  }
  return message.result;
}

for (const origin of ORIGINS) {
  const indexUrl = `${origin}/.well-known/agent-skills/index.json`;
  const index = await (await fetchOk(indexUrl)).json();
  const entries = Array.isArray(index.skills) ? index.skills : [];
  assertExactSet(
    `${origin} agent-skills`,
    entries.map((entry) => entry.name),
    SKILLS,
  );

  for (const entry of entries) {
    const artifactUrl = new URL(entry.url, indexUrl).toString();
    const bytes = Buffer.from(await (await fetchOk(artifactUrl)).arrayBuffer());
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (digest !== entry.digest) {
      throw new Error(`${artifactUrl}: advertised ${entry.digest}, served ${digest}`);
    }
  }

}

const legacyOrigin = "https://tempguru.co";
const legacy = await (await fetchOk(`${legacyOrigin}/.well-known/skills/index.json`)).json();
const legacyEntries = Array.isArray(legacy.skills) ? legacy.skills : [];
assertExactSet(
  "apex legacy Hermes skills",
  legacyEntries.map((entry) => entry.name),
  SKILLS,
);
for (const skill of SKILLS) {
  await fetchOk(`${legacyOrigin}/.well-known/skills/${skill}/SKILL.md`);
}

for (const skill of SKILLS) {
  await fetchOk(`https://mcp.tempguru.co/okf/workflows/${skill}.md`);
}
await fetchOk("https://tempguru.co/.well-known/security.txt");

for (const origin of ORIGINS) {
  const card = await (
    await fetchOk(`${origin}/.well-known/mcp/server-card.json`)
  ).json();
  const description = String(card?.serverInfo?.description ?? "");
  if (!description.includes(`${SKILLS.length} skill resources`)) {
    throw new Error(`${origin} server card: expected ${SKILLS.length}-skill description, got ${description}`);
  }
  assertPhaseAContract(`${origin} server card`, {
    ...card,
    description,
  });
  assertExactSet(
    `${origin} server card tools`,
    Array.isArray(card.tools) ? card.tools.map((tool) => tool.name) : [],
    TOOLS,
  );

  const discovery = await (
    await fetchOk(`${origin}/.well-known/mcp.json`)
  ).json();
  const server = Array.isArray(discovery.servers)
    ? discovery.servers[0]
    : undefined;
  assertPhaseAContract(`${origin} mcp.json`, server);
  if (
    JSON.stringify(server?.supportedProtocolVersions) !==
    JSON.stringify(card.supportedProtocolVersions)
  ) {
    throw new Error(
      `${origin}: mcp.json and server card protocol-version lists drifted`,
    );
  }
}

for (const path of ["/llms.txt", "/llms-full.txt"]) {
  const body = await (await fetchOk(`https://tempguru.co${path}`)).text();
  const inventories = [...body.matchAll(/^- Canonical Agent Skills \((\d+)\):[^\n]*$/gm)];
  if (inventories.length !== 1 || Number(inventories[0][1]) !== SKILLS.length) {
    throw new Error(`${path}: expected exactly one ${SKILLS.length}-skill inventory`);
  }
  const mcpInventories =
    body.match(
      /^- MCP Server[^\n]*https:\/\/mcp\.tempguru\.co\/mcp[^\n]*$/gm,
    ) ?? [];
  if (
    mcpInventories.length !== 1 ||
    !mcpInventories[0].includes("12 tools") ||
    !mcpInventories[0].includes("save_staffing_plan") ||
    !mcpInventories[0].includes(MODERN_VERSION) ||
    !mcpInventories[0].includes("2025-era compatibility") ||
    !mcpInventories[0].includes("complete plan has no plan_id") ||
    !mcpInventories[0].includes("never duplicate")
  ) {
    throw new Error(`${path}: 12-tool dual-era Phase A MCP inventory is stale`);
  }
  for (const skill of SKILLS) {
    if (!inventories[0][0].includes(skill)) throw new Error(`${path}: inventory missing ${skill}`);
  }
}

const legacyInitialize = await postRpc({
  jsonrpc: "2.0",
  id: "live-legacy-initialize",
  method: "initialize",
  params: {
    protocolVersion: LEGACY_VERSION,
    capabilities: {},
    clientInfo: {
      name: "tempguru-live-discovery-legacy",
      version: "1.0.0",
    },
  },
});
if (legacyInitialize.protocolVersion !== LEGACY_VERSION) {
  throw new Error(
    `${MCP_ENDPOINT}: legacy initialize negotiated ${legacyInitialize.protocolVersion}, expected ${LEGACY_VERSION}`,
  );
}
const legacyTools = await postRpc(
  {
    jsonrpc: "2.0",
    id: "live-legacy-tools",
    method: "tools/list",
    params: {},
  },
  { "mcp-protocol-version": LEGACY_VERSION },
);
assertExactSet(
  "live legacy tools/list",
  Array.isArray(legacyTools.tools)
    ? legacyTools.tools.map((tool) => tool.name)
    : [],
  TOOLS,
);

const discoverMeta = modernMeta("tempguru-live-discovery-modern");
const modernDiscover = await postRpc(
  {
    jsonrpc: "2.0",
    id: "live-modern-discover",
    method: "server/discover",
    params: { _meta: discoverMeta },
  },
  {
    "mcp-protocol-version": MODERN_VERSION,
    "mcp-method": "server/discover",
  },
);
if (
  !Array.isArray(modernDiscover.supportedVersions) ||
  !modernDiscover.supportedVersions.includes(MODERN_VERSION)
) {
  throw new Error(`${MCP_ENDPOINT}: modern server/discover omitted ${MODERN_VERSION}`);
}
const modernTools = await postRpc(
  {
    jsonrpc: "2.0",
    id: "live-modern-tools",
    method: "tools/list",
    params: { _meta: discoverMeta },
  },
  {
    "mcp-protocol-version": MODERN_VERSION,
    "mcp-method": "tools/list",
  },
);
assertExactSet(
  "live modern tools/list",
  Array.isArray(modernTools.tools)
    ? modernTools.tools.map((tool) => tool.name)
    : [],
  TOOLS,
);

console.log(
  `Live discovery OK: ${SKILLS.length} skills, ${TOOLS.length} tools across modern + legacy MCP, both Agent Skills origins, apex Hermes tree, digests, OKF, server cards, and llms inventories.`,
);
