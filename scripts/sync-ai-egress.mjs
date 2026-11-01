// Refresh the published AI-platform egress ranges used to label telemetry by
// source network (src/lib/telemetry/source-network.ts).
//
// User agents cannot separate real Claude or ChatGPT traffic from scripts:
// claude.ai has been observed calling MCP servers as `python-httpx/...`, and a
// ChatGPT MCP validation request as `curl/...`. Both companies publish the
// ranges their connectors call from, so the source IP is the dependable signal.
//
//   anthropic  Documented stable outbound block (no machine-readable feed):
//              https://platform.claude.com/docs/en/api/ip-addresses
//              "the stable IP addresses that Anthropic uses for outbound
//              requests (for example, when making MCP tool calls to external
//              servers)". Update ANTHROPIC_OUTBOUND below if that page changes.
//   openai     https://openai.com/chatgpt-connectors.json, the published list
//              for ChatGPT plugins, connectors, and GPT Actions. Changes over
//              time; rerun this script to refresh the committed snapshot.
//
// Usage: npm run sync:ai-egress

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "src", "lib", "telemetry", "ai-egress-ranges.json");

const ANTHROPIC_SOURCE = "https://platform.claude.com/docs/en/api/ip-addresses";
const ANTHROPIC_OUTBOUND = ["160.79.104.0/21"];
const OPENAI_SOURCE = "https://openai.com/chatgpt-connectors.json";

const CIDR = /^(\d{1,3}\.){3}\d{1,3}\/(\d|[12]\d|3[0-2])$|^[0-9a-f:]+\/(\d{1,3})$/i;

const response = await fetch(OPENAI_SOURCE, {
  headers: { "User-Agent": "TempGuru-Internal/sync-ai-egress" },
});
if (!response.ok) {
  throw new Error(`${OPENAI_SOURCE} returned HTTP ${response.status}`);
}
const feed = await response.json();
const openaiPrefixes = (feed.prefixes ?? [])
  .map((entry) => entry.ipv4Prefix ?? entry.ipv6Prefix)
  .filter(Boolean);
if (openaiPrefixes.length === 0 || !openaiPrefixes.every((prefix) => CIDR.test(prefix))) {
  throw new Error(`${OPENAI_SOURCE} returned no prefixes or an unexpected shape`);
}

const snapshot = {
  generated_by: "scripts/sync-ai-egress.mjs",
  generated_at: new Date().toISOString().slice(0, 10),
  networks: {
    anthropic: {
      source: ANTHROPIC_SOURCE,
      prefixes: ANTHROPIC_OUTBOUND,
    },
    openai: {
      source: OPENAI_SOURCE,
      source_created: feed.creationTime ?? null,
      prefixes: [...new Set(openaiPrefixes)].sort(),
    },
  },
};

writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n");
console.log(
  `Wrote ${outPath}: anthropic ${ANTHROPIC_OUTBOUND.length} prefix, openai ${snapshot.networks.openai.prefixes.length} prefixes (feed ${snapshot.networks.openai.source_created}).`,
);
