// TempGuru MCP server, streamable-HTTP transport (production, on Vercel).
//
// The 8 tools and 2 Skill resources are registered by the shared registerTools()
// in @/lib/mcp/register-tools, so this hosted endpoint and the stdio binary
// (src/mcp-stdio.ts) expose byte-identical tools, no behavior drift between the
// remote server and a local/Docker build. This file owns only what is
// HTTP-specific: per-request telemetry context, Accept-header normalization,
// CORS, and the streamable-HTTP handler wiring.
//
//   - get_cities                 list all cities TempGuru serves (with tier)
//   - get_roles                  list all staffing roles with descriptions
//   - check_availability         deterministic lead-time guidance for a city/date
//   - get_role_pricing           rate range for a role in a specific city
//   - get_compliance_by_state    state-level employment compliance summary
//   - request_quote              submit a staffing plan → Notion Inbound Deal Pipeline
//
// Transport: streamable HTTP (MCP spec rev 2025-03-26). SSE disabled.
// Public endpoint: https://mcp.tempguru.co/mcp

import { createMcpHandler } from "mcp-handler";
import pkg from "../../../package.json";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerTools } from "@/lib/mcp/register-tools";
import { runWithContext, currentContext } from "@/lib/telemetry/context";
import { track } from "@/lib/telemetry/track";

// ─── Skill resource content ───────────────────────────────────────────────
//
// Both SKILL.md files are loaded once at module-init time and served as MCP
// resources. Source-of-truth is /content/skills/*.md in this repo, kept in
// sync with the canonical files at tempguru.co/.well-known/skills/<name>/SKILL.md.
//
// Loading at module-init (not per-request) avoids filesystem reads on every
// resources/read call. Vercel's Fluid Compute reuses module state across
// requests, so the read happens once per cold start.
const SKILLS_DIR = join(process.cwd(), "content", "skills");
const ORDERING_SKILL = readFileSync(join(SKILLS_DIR, "event-staffing-ordering.md"), "utf-8");
const COMPLIANCE_SKILL = readFileSync(join(SKILLS_DIR, "event-staffing-compliance.md"), "utf-8");

// ─── Handler ──────────────────────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    // Tools + resources come from the shared module. The HTTP route's only
    // addition is telemetry: enrich each record with the request context bound
    // in withAcceptNormalization (User-Agent + Vercel IP-country), then write
    // to Redis. The stdio binary calls registerTools() with no onTrack at all.
    registerTools(server, {
      onTrack: async (record) => {
        const ctx = currentContext();
        await track({ ...record, userAgent: ctx.userAgent, ipCountry: ctx.ipCountry });
      },
      resources: { ordering: ORDERING_SKILL, compliance: COMPLIANCE_SKILL },
    });
  },
  {
    // mcp-handler v1.1.0's serverInfo type only exposes `name` and `version`,
    // but the value is passed verbatim into the MCP SDK's `new McpServer(...)`,
    // whose Implementation/BaseMetadata shape accepts the wider set defined by
    // MCP spec rev 2025-03-26: title, description, icons. Casting through
    // `as { name: string; version: string }` keeps the call type-correct from
    // mcp-handler's perspective while still passing the extra fields through
    // to the SDK at runtime. Surfaces these in registry scanners (Smithery,
    // ClawHub) and Claude.ai connector listings.
    serverInfo: {
      name: "tempguru-mcp",
      version: pkg.version,
      title: "TempGuru Event Staffing",
      description:
        "W-2 event staffing data for AI agents: 345 US/CA markets. Eight tools: the call-first plan_staffing planner, six read-only lookups including the get_rate_benchmark Rate Index, and an opt-in request_quote submission. Ships skill resources and guided prompts. No authentication required. ChatGPT users without MCP: the TempGuru Event Staffing Planner GPT covers the same workflow.",
      icons: [
        {
          src: "https://mcp.tempguru.co/logo.svg",
          mimeType: "image/svg+xml",
          // sizes must be an array per MCP spec rev 2025-03-26 (and Glama's
          // strict validator), single string "any" was rejected with:
          // { expected: 'array', code: 'invalid_type', path: ['serverInfo',
          //   'icons', 0, 'sizes'], message: 'Invalid input' }
          sizes: ["any"],
        },
      ],
    } as { name: string; version: string },
  },
  {
    // Endpoint at /mcp (default streamableHttpEndpoint with empty basePath)
    verboseLogs: process.env.NODE_ENV !== "production",
    disableSse: true, // SSE removed from MCP spec 2025-03-26
    maxDuration: 60,
  },
);

// ─── Accept header normalization wrapper ────────────────────────────────
//
// mcp-handler enforces the MCP spec rev 2025-03-26 requirement that
// clients MUST send `Accept: application/json, text/event-stream`. Real-
// world clients (Anthropic's claude.ai connectors among them) often send
// only `application/json` and get a 406, which surfaces as "This connector
// has no tools available" with no further diagnostic.
//
// We rewrite the incoming Accept header to include both content types when
// either is missing, so the downstream handler always sees a spec-compliant
// request. Responses are unchanged (SSE-framed), which any compliant MCP
// client handles correctly.
//
// Remove this wrapper when mcp-handler upgrades to the 2026-07-28 spec
// (stateless protocol, Accept enforcement is relaxed in that revision).

// ─── CORS headers ──────────────────────────────────────────────────────
//
// Glama's health checker, in-browser MCP clients (Claude.ai connector
// surface, future web-based MCP playgrounds), and any directory scanner
// that probes from a browser context all require CORS preflight to
// succeed before the actual request lands.
//
// Until 2026-06-04 ~04:30 UTC the route returned 204 to OPTIONS without
// Access-Control-* headers, mcp-handler's built-in OPTIONS handler does
// the bare minimum. That looked fine to server-to-server clients
// (Anthropic's connectors, Smithery's scanner, our own curl probes) but
// silently failed Glama's browser-context health probe, which surfaced
// as a generic "unhealthy" status with no diagnostic.
//
// Wide-open CORS is correct for this server: no auth, no sensitive
// data, no per-client config, no credentialed requests. Allow-list any
// origin, expose the MCP-Session-Id and Last-Event-ID headers used by
// streamable HTTP, and apply on every response, including OPTIONS
// preflights.

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers":
    "Content-Type, Accept, Mcp-Session-Id, Last-Event-ID, Authorization",
  "access-control-expose-headers": "Mcp-Session-Id, WWW-Authenticate",
  "access-control-max-age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function withAcceptNormalization(request: Request): Promise<Response> {
  // Short-circuit OPTIONS preflights with a CORS-only 204, no need to
  // run them through the MCP handler.
  if (request.method === "OPTIONS") {
    return withCors(new Response(null, { status: 204 }));
  }

  // Bind per-request context (User-Agent + Vercel IP-country header) so
  // each tool handler can record telemetry without threading the request.
  const ctx = {
    userAgent: request.headers.get("user-agent") ?? "",
    ipCountry: request.headers.get("x-vercel-ip-country") ?? "",
  };

  return runWithContext(ctx, async () => {
    const accept = request.headers.get("accept") ?? "";

    if (accept.includes("application/json") && accept.includes("text/event-stream")) {
      return withCors(await handler(request));
    }

    // Clone the request with a normalized Accept header. Body must be read first
    // because Request bodies are one-shot streams under Node's fetch.
    const normalizedHeaders = new Headers(request.headers);
    normalizedHeaders.set("accept", "application/json, text/event-stream");

    let body: BodyInit | null = null;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.text();
    }

    const normalized = new Request(request.url, {
      method: request.method,
      headers: normalizedHeaders,
      body,
    });

    return withCors(await handler(normalized));
  });
}

export {
  withAcceptNormalization as GET,
  withAcceptNormalization as POST,
  withAcceptNormalization as DELETE,
  withAcceptNormalization as OPTIONS,
};
