// Label a request by verified AI-platform source network, from the published
// egress ranges in ai-egress-ranges.json (refresh: npm run sync:ai-egress).
//
// User agents cannot answer "is this real Claude or ChatGPT traffic?": claude.ai
// has been observed calling MCP servers as `python-httpx/...` (which
// classify-ua files under "scripted"), and a ChatGPT MCP validation request as
// `curl/...`, while any script can claim to be Claude-User. Anthropic and OpenAI
// both publish the ranges their connectors call from, so the source IP is the
// dependable signal. Only the resulting label is recorded; the raw IP is never
// stored (OPERATIONS.md: "No raw IPs").

import { BlockList, isIP } from "node:net";
import ranges from "./ai-egress-ranges.json";

export const SOURCE_NETWORKS = ["anthropic", "openai", "other", "unknown"] as const;
export type SourceNetwork = (typeof SOURCE_NETWORKS)[number];

function blockList(prefixes: readonly string[]): BlockList {
  const list = new BlockList();
  for (const prefix of prefixes) {
    const [address, bits] = prefix.split("/");
    const type = isIP(address) === 6 ? "ipv6" : "ipv4";
    list.addSubnet(address, Number(bits), type);
  }
  return list;
}

const VERIFIED: ReadonlyArray<readonly [SourceNetwork, BlockList]> = [
  ["anthropic", blockList(ranges.networks.anthropic.prefixes)],
  ["openai", blockList(ranges.networks.openai.prefixes)],
];

/**
 * "anthropic" / "openai" when the IP sits in that company's published egress
 * ranges, "other" for any other valid IP, "unknown" when there is no usable IP
 * (local dev, stdio, malformed header).
 */
export function classifySourceNetwork(ip: string | null | undefined): SourceNetwork {
  let address = (ip ?? "").trim();
  // An IPv4-mapped IPv6 address (::ffff:a.b.c.d) is the IPv4 client.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) address = mapped[1];
  const version = isIP(address);
  if (!version) return "unknown";
  const type = version === 6 ? "ipv6" : "ipv4";
  for (const [network, list] of VERIFIED) {
    if (list.check(address, type)) return network;
  }
  return "other";
}

/** Client IP as Vercel reports it (it overwrites these headers to prevent spoofing). */
export function clientIpFromHeaders(headers: Headers): string {
  return (
    (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    (headers.get("x-real-ip") ?? "")
  );
}
