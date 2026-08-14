// Local/CI contract gate for TempGuru's public agent-readiness surfaces.
// Run after the generators so the committed apex artifacts are checked too.

import { build } from "esbuild";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const facts = JSON.parse(read("content/public-facts.json"));
const cities = JSON.parse(read("content/mcp-data/cities.json"));
const roles = JSON.parse(read("content/mcp-data/roles.json"));
const errors = [];

function walk(relativePath) {
  const absolutePath = join(root, relativePath);
  if (statSync(absolutePath).isFile()) return [relativePath];
  return readdirSync(absolutePath).flatMap((name) =>
    walk(join(relativePath, name)),
  );
}

async function loadRoute(relativePath) {
  const result = await build({
    entryPoints: [join(root, relativePath)],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
    tsconfig: join(root, "tsconfig.json"),
  });
  const dir = mkdtempSync(join(tmpdir(), "tempguru-agent-route-"));
  const output = join(dir, "route.mjs");
  writeFileSync(output, result.outputFiles[0].text);
  try {
    return await import(pathToFileURL(output).href);
  } finally {
    // The imported module is resident; its temporary source is no longer needed.
    rmSync(dir, { recursive: true, force: true });
  }
}

if (facts.catalog.markets.value !== cities.cities.length) {
  errors.push(
    `public facts market count ${facts.catalog.markets.value} != ${cities.cities.length} city rows`,
  );
}
if (facts.catalog.roles.value !== roles.roles.length) {
  errors.push(
    `public facts role count ${facts.catalog.roles.value} != ${roles.roles.length} role rows`,
  );
}
if (
  facts.agentInterfaces.a2a.protocolBinding !== "JSONRPC" ||
  facts.agentInterfaces.a2a.protocolVersion !== "1.0" ||
  facts.agentInterfaces.a2a.url === facts.agentInterfaces.mcp.url
) {
  errors.push("public facts must declare a distinct A2A JSON-RPC 1.0 endpoint");
}

const cardRoute = await loadRoute(
  "src/app/.well-known/agent-card.json/route.ts",
);
const cardResponse = await cardRoute.GET();
const card = await cardResponse.json();
const preferred = card.supportedInterfaces?.[0];
if (
  cardResponse.status !== 200 ||
  preferred?.url !== facts.agentInterfaces.a2a.url ||
  preferred?.protocolBinding !== "JSONRPC" ||
  preferred?.protocolVersion !== "1.0"
) {
  errors.push("agent card does not advertise the canonical A2A JSON-RPC 1.0 interface");
}
for (const legacyField of ["url", "protocolVersion", "preferredTransport", "additionalInterfaces", "authentication"]) {
  if (Object.hasOwn(card, legacyField)) {
    errors.push(`A2A v1.0 agent card contains removed legacy field ${legacyField}`);
  }
}
if (
  card.capabilities?.streaming !== false ||
  card.capabilities?.pushNotifications !== false ||
  !Array.isArray(card.skills) ||
  card.skills.length < 2
) {
  errors.push("agent card overstates capabilities or omits executable skills");
}

const factsRoute = await loadRoute(
  "src/app/.well-known/tempguru-facts.json/route.ts",
);
const servedFacts = await (await factsRoute.GET()).json();
if (JSON.stringify(servedFacts) !== JSON.stringify(facts)) {
  errors.push("served public facts route drifted from content/public-facts.json");
}

const a2aRoute = await loadRoute("src/app/a2a/route.ts");
const a2aResponse = await a2aRoute.POST(
  new Request("https://mcp.tempguru.co/a2a", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "a2a-version": "1.0",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "agent-readiness-check",
      method: "SendMessage",
      params: {
        message: {
          messageId: "agent-readiness-check-message",
          role: "ROLE_USER",
          parts: [
            {
              data: {
                skillId: "event-staffing-lookup",
                action: "catalog",
                input: { city: "Chicago" },
              },
              mediaType: "application/json",
            },
          ],
        },
      },
    }),
  }),
);
const a2aBody = await a2aResponse.json();
const a2aDataPart = a2aBody.result?.message?.parts?.find((part) =>
  Object.hasOwn(part, "data"),
);
if (
  a2aResponse.status !== 200 ||
  a2aBody.jsonrpc !== "2.0" ||
  a2aBody.id !== "agent-readiness-check" ||
  a2aBody.result?.message?.role !== "ROLE_AGENT" ||
  a2aDataPart?.data?.result?.data?.catalog_match !== true ||
  a2aDataPart?.data?.result?.data?.coverage_confirmation_required !== true ||
  Object.hasOwn(a2aDataPart?.data?.result?.data ?? {}, "covered")
) {
  errors.push("A2A SendMessage catalog lookup did not return a qualified agent message");
}

const planResponse = await a2aRoute.POST(
  new Request("https://mcp.tempguru.co/a2a", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "a2a-version": "1.0",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "agent-readiness-plan-check",
      method: "SendMessage",
      params: {
        message: {
          messageId: "agent-readiness-plan-check-message",
          role: "ROLE_USER",
          parts: [
            {
              data: {
                skillId: "event-staffing-plan",
                input: {
                  city: "Chicago",
                  event_date: "2026-10-15",
                  roles: [{ role: "brand-ambassadors", headcount: 4 }],
                },
              },
              mediaType: "application/json",
            },
          ],
        },
      },
    }),
  }),
);
const planBody = await planResponse.json();
const planDataPart = planBody.result?.message?.parts?.find((part) =>
  Object.hasOwn(part, "data"),
);
const plan = planDataPart?.data?.result;
if (
  planResponse.status !== 200 ||
  planBody.jsonrpc !== "2.0" ||
  planBody.id !== "agent-readiness-plan-check" ||
  planBody.result?.message?.role !== "ROLE_AGENT" ||
  plan?.status !== "plan" ||
  plan?.plan_complete !== true ||
  plan?.event?.catalog_match !== true ||
  plan?.event?.coverage_confirmation_required !== true ||
  plan?.plan_lines?.[0]?.headcount !== 4
) {
  errors.push("A2A SendMessage staffing plan did not return a complete repository-backed plan");
}

const noVersionResponse = await a2aRoute.POST(
  new Request("https://mcp.tempguru.co/a2a", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "version-check",
      method: "SendMessage",
      params: {
        message: {
          messageId: "version-check-message",
          role: "ROLE_USER",
          parts: [{ text: "help", mediaType: "text/plain" }],
        },
      },
    }),
  }),
);
const noVersionBody = await noVersionResponse.json();
if (noVersionBody.error?.code !== -32009) {
  errors.push("A2A endpoint must reject the implicit v0.3 protocol with VersionNotSupportedError");
}

const queryVersionResponse = await a2aRoute.POST(
  new Request("https://mcp.tempguru.co/a2a?A2A-Version=1.0", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "query-version-check",
      method: "SendMessage",
      params: {
        message: {
          messageId: "query-version-check-message",
          role: "ROLE_USER",
          parts: [{ text: "help", mediaType: "text/plain" }],
        },
      },
    }),
  }),
);
const queryVersionBody = await queryVersionResponse.json();
if (
  queryVersionResponse.status !== 200 ||
  queryVersionBody.result?.message?.role !== "ROLE_AGENT"
) {
  errors.push("A2A endpoint must accept the A2A-Version=1.0 query parameter");
}

async function expectA2aError(label, body, code, url = "https://mcp.tempguru.co/a2a") {
  const response = await a2aRoute.POST(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "a2a-version": "1.0",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  const responseBody = await response.json();
  if (responseBody.error?.code !== code) {
    errors.push(`${label}: expected A2A error ${code}, got ${responseBody.error?.code}`);
  }
  if (
    code <= -32001 &&
    code >= -32009 &&
    !responseBody.error?.data?.some(
      (detail) =>
        detail?.["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" &&
        detail?.domain === "a2a-protocol.org",
    )
  ) {
    errors.push(`${label}: A2A-specific error omitted google.rpc.ErrorInfo details`);
  }
}

const baseA2aMessage = {
  messageId: "negative-conformance-message",
  role: "ROLE_USER",
  parts: [{ text: "help", mediaType: "text/plain" }],
};
for (const method of [
  "SendStreamingMessage",
  "SubscribeToTask",
  "GetExtendedAgentCard",
]) {
  await expectA2aError(
    `A2A unsupported operation ${method}`,
    {
      jsonrpc: "2.0",
      id: `unsupported-${method}`,
      method,
      params: { message: baseA2aMessage },
    },
    -32004,
  );
}
for (const method of [
  "CreateTaskPushNotificationConfig",
  "GetTaskPushNotificationConfig",
  "ListTaskPushNotificationConfigs",
  "DeleteTaskPushNotificationConfig",
]) {
  await expectA2aError(
    `A2A push notification operation ${method}`,
    {
      jsonrpc: "2.0",
      id: `push-${method}`,
      method,
      params: {},
    },
    -32003,
  );
}
await expectA2aError(
  "A2A nonexistent task",
  {
    jsonrpc: "2.0",
    id: "task-check",
    method: "SendMessage",
    params: { message: { ...baseA2aMessage, taskId: "missing-task" } },
  },
  -32001,
);
await expectA2aError(
  "A2A unsupported data content type",
  {
    jsonrpc: "2.0",
    id: "media-type-check",
    method: "SendMessage",
    params: {
      message: {
        ...baseA2aMessage,
        parts: [{ data: { skillId: "event-staffing-plan" }, mediaType: "application/xml" }],
      },
    },
  },
  -32005,
);
await expectA2aError(
  "A2A unsupported text content type",
  {
    jsonrpc: "2.0",
    id: "text-media-type-check",
    method: "SendMessage",
    params: {
      message: {
        ...baseA2aMessage,
        parts: [{ text: "help", mediaType: "application/xml" }],
      },
    },
  },
  -32005,
);
await expectA2aError(
  "A2A unsupported content type in a later data part",
  {
    jsonrpc: "2.0",
    id: "later-media-type-check",
    method: "SendMessage",
    params: {
      message: {
        ...baseA2aMessage,
        parts: [
          {
            data: { skillId: "event-staffing-lookup", action: "roles" },
            mediaType: "application/json",
          },
          { data: { ignored: true }, mediaType: "application/xml" },
        ],
      },
    },
  },
  -32005,
);
await expectA2aError(
  "A2A invalid context ID",
  {
    jsonrpc: "2.0",
    id: "context-id-check",
    method: "SendMessage",
    params: { message: { ...baseA2aMessage, contextId: 42 } },
  },
  -32602,
);
await expectA2aError(
  "A2A invalid part shape",
  {
    jsonrpc: "2.0",
    id: "part-shape-check",
    method: "SendMessage",
    params: { message: { ...baseA2aMessage, parts: [42] } },
  },
  -32602,
);
await expectA2aError(
  "A2A non-string method",
  {
    jsonrpc: "2.0",
    id: "method-type-check",
    method: 42,
    params: { message: baseA2aMessage },
  },
  -32600,
);
await expectA2aError(
  "A2A invalid JSON-RPC id",
  {
    jsonrpc: "2.0",
    id: { invalid: true },
    method: "SendMessage",
    params: { message: baseA2aMessage },
  },
  -32600,
);
await expectA2aError("A2A malformed JSON", "{", -32700);
await expectA2aError(
  "A2A unknown method",
  {
    jsonrpc: "2.0",
    id: "method-check",
    method: "UnknownMethod",
    params: { message: baseA2aMessage },
  },
  -32601,
);

const notificationResponse = await a2aRoute.POST(
  new Request("https://mcp.tempguru.co/a2a", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "a2a-version": "1.0",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "SendMessage",
      params: { message: baseA2aMessage },
    }),
  }),
);
if (notificationResponse.status !== 204 || (await notificationResponse.text()) !== "") {
  errors.push("A2A JSON-RPC notifications must receive no response body");
}

const optionsResponse = await a2aRoute.OPTIONS();
if (
  optionsResponse.status !== 204 ||
  optionsResponse.headers.get("access-control-allow-origin") !== "*" ||
  !optionsResponse.headers.get("access-control-allow-headers")?.includes("A2A-Version")
) {
  errors.push("A2A OPTIONS response must advertise public cross-origin versioned access");
}

const auth = read("content/auth.md");
const authLower = auth.toLowerCase().replace(/\s+/g, " ");
for (const fragment of [
  "do not require account registration",
  facts.agentInterfaces.mcp.url,
  facts.agentInterfaces.a2a.url,
  "buyer must open that form",
  "does not currently publish OAuth",
]) {
  if (!authLower.includes(fragment.toLowerCase())) errors.push(`auth.md missing: ${fragment}`);
}

const agentDocsUrl = "https://tempguru.co/ai-agents";
const mcpDiscoveryRoute = await loadRoute("src/app/.well-known/mcp.json/route.ts");
const mcpDiscovery = await (await mcpDiscoveryRoute.GET()).json();
const mcpDescriptor = mcpDiscovery.servers?.[0];
for (const [field, expected] of Object.entries({
  documentation: agentDocsUrl,
  a2a: facts.agentInterfaces.a2a.url,
  agentCard: "https://mcp.tempguru.co/.well-known/agent-card.json",
  authenticationGuide: "https://mcp.tempguru.co/auth.md",
  publicFacts: "https://mcp.tempguru.co/.well-known/tempguru-facts.json",
})) {
  if (mcpDescriptor?.[field] !== expected) {
    errors.push(`MCP discovery ${field} must be ${expected}`);
  }
}

const serverCardRoute = await loadRoute(
  "src/app/.well-known/mcp/server-card.json/route.ts",
);
const serverCard = await (await serverCardRoute.GET()).json();
if (
  serverCard.documentationUrl !== agentDocsUrl ||
  serverCard.relatedResources?.a2aEndpoint !== facts.agentInterfaces.a2a.url ||
  !serverCard.relatedResources?.authenticationGuide?.endsWith("/auth.md") ||
  !serverCard.relatedResources?.publicFacts?.endsWith("/tempguru-facts.json")
) {
  errors.push("MCP server card must cross-link agent docs, A2A, auth, and public facts");
}

const apiCatalogRoute = await loadRoute("src/app/.well-known/api-catalog/route.ts");
const apiCatalog = await (await apiCatalogRoute.GET()).json();
if (apiCatalog.linkset?.[0]?.["service-doc"]?.[0]?.href !== agentDocsUrl) {
  errors.push(`API catalog service-doc must be ${agentDocsUrl}`);
}

const okfDiscovery = JSON.parse(read("public/.well-known/okf.json"));
if (
  okfDiscovery.action_layer?.a2a !== facts.agentInterfaces.a2a.url ||
  okfDiscovery.agent_card !== "https://tempguru.co/.well-known/agent-card.json" ||
  okfDiscovery.authentication_guide !== "https://tempguru.co/auth.md" ||
  okfDiscovery.public_facts !== "https://tempguru.co/.well-known/tempguru-facts.json" ||
  okfDiscovery.documentation !== agentDocsUrl
) {
  errors.push("OKF discovery must cross-link A2A, agent card, auth, public facts, and docs");
}

const llmsShort = read("public/llms.txt");
const llmsFull = read("public/llms-full.txt");
const llmsFullMarkers = llmsFull.match(/^## Included document: \/okf\//gm) ?? [];
if (
  llmsFull === llmsShort ||
  llmsFull.length < llmsShort.length * 5 ||
  llmsFullMarkers.length !== okfDiscovery.bundle?.file_count ||
  !llmsShort.includes("https://mcp.tempguru.co/llms-full.txt") ||
  !llmsFull.includes("Compact index: https://mcp.tempguru.co/llms.txt")
) {
  errors.push("llms short/full files must cross-link, remain distinct, and export every OKF document");
}

const publicSurfaceFiles = [...new Set([
  ...walk("content/skills").filter((path) => path.endsWith(".md")),
  ...walk("skills").filter((path) => /\.(?:md|ya?ml)$/.test(path)),
  ...walk("plugins/tempguru").filter((path) => /\.(?:json|md|ya?ml)$/.test(path)),
  ...walk("distribution/pi/skills").filter((path) => path.endsWith(".md")),
  ...walk("distribution/assistants/knowledge").filter((path) => path.endsWith(".md")),
  ...walk("distribution").filter((path) => /\.(?:html|json|md|mjs|py|ts|txt|ya?ml)$/.test(path)),
  ...walk("public/okf").filter((path) => path.endsWith(".md")),
  ...walk("src").filter((path) => /\.(?:ts|tsx)$/.test(path)),
  ...walk("clients").filter((path) => /\.(?:md|py|toml)$/.test(path)),
  "README.md",
  "README.zh-CN.md",
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".claude-plugin/marketplace.json",
  "plugins/tempguru/.claude-plugin/plugin.json",
  "Dockerfile",
  "cli/README.md",
  "cli/package.json",
  "context7.json",
  "gemini-extension.json",
  "llms-install.md",
  "package.json",
  "server.json",
  "distribution/assistants/system-prompt.md",
  "distribution/assistants/microsoft/declarativeAgent.json",
  "distribution/event-staffing-rate-index.html",
  "public/llms.txt",
  "public/llms-full.txt",
])];
const blockedScalePatterns = [
  /99%\s+(?:fill|fulfillment)\s+rate/i,
  /(?:2,500|5,000)\+\s+events/i,
  /100,000\+/i,
  /200\+\s+(?:pre-vetted\s+|vetted\s+|local\s+)?(?:staffing\s+)?partners?/i,
  /200\+\s+pre-vetted\s+local\s+staffing\s+agenc(?:y|ies)/i,
  /10\s*万\+\s*名\s*W-2/i,
  /200\+\s*家[^。\n]*(?:人力|机构)/i,
  /serving\s+345\s+(?:US and Canadian\s+)?markets/i,
  /(?:staffs?\s+events?\s+in|across)\s+(?:all\s+)?345\s+(?:published\s+)?markets/i,
  /across\s+345\s+(?:(?:US(?:\/CA|\/Canada| and Canadian)?|US and Canada)\s+markets|cities)/i,
  /345\s+markets\s+across\s+the\s+US/i,
  /(?:for|in)\s+345\s+(?:US and Canadian\s+)?cities/i,
  /345[- ]market\s+footprint/i,
  /345\s+covered\s+markets/i,
  /345[- ]city\s+coverage/i,
  /coverage(?:\s+and\s+lead\s+time)?\s+(?:is|are)\s+checked\s+per\s+order/i,
  /per-order\s+coverage\s+checks?/i,
  /order-specific\s+coverage\s+and\s+lead[- ]time\s+check/i,
  /live\s+TempGuru\s+coverage/i,
  /live\s+rates,\s+availability/i,
  /coverage\s+and\s+rate\s+snapshot/i,
  /single-city\s+coverage\s+check/i,
  /list\s+cities\s+TempGuru\s+serves/i,
  /\bCityCoverageResponse\b/,
  /\bcoverage_check\b/,
  /["'`]covered["'`]?\s*:\s*(?:true|false|boolean)/i,
  /(?:live\s+)?coverage\s+(?:for|across)\s+345/i,
  /all\s+cities\s+TempGuru\s+serves/i,
  /confirm\s+(?:TempGuru\s+serves|coverage\s+with\s+`?get_cities`?)/i,
  /(?:cities|markets)\s+where\s+TempGuru\s+provides\s+(?:W-2\s+)?event\s+staffing/i,
  /event staff\s+anywhere\s+in\s+the\s+US\s+and\s+Canada/i,
  /345\s*个美加城市/i,
  /零用工风险/i,
  /覆盖(?:美加|美国和加拿大)\s*345\s*个(?:城市|市场)/i,
  /使用工具确认[^\n。]*(?:覆盖|提前期)/i,
];
for (const path of publicSurfaceFiles) {
  const body = read(path);
  for (const pattern of blockedScalePatterns) {
    if (pattern.test(body)) errors.push(`${path}: withheld scale claim matches ${pattern}`);
  }
  if (/https:\/\/tempguru\.co\/ai(?![-/A-Za-z0-9])/.test(body)) {
    errors.push(`${path}: obsolete agent documentation URL; use ${agentDocsUrl}`);
  }
  if (/(^|["'(=\s])\/ai(?=$|["')\s?#])/m.test(body)) {
    errors.push(`${path}: obsolete relative /ai documentation path; use /ai-agents`);
  }
}

const apexWorker = read("cloudflare/worker.js");
for (const path of [
  '"/.well-known/agent-card.json"',
  '"/.well-known/tempguru-facts.json"',
  '"/auth.md"',
]) {
  if (!apexWorker.includes(path)) errors.push(`cloudflare/worker.js missing ${path}`);
}
if (apexWorker.includes("Squarespace")) {
  errors.push("cloudflare/worker.js still identifies Squarespace as the apex origin");
}

if (errors.length) {
  console.error("Agent-readiness validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Agent readiness passed: ${cities.cities.length} markets, ${roles.roles.length} roles, ` +
    `A2A ${preferred.protocolVersion} SendMessage, auth.md, evidence-gated claims`,
);
