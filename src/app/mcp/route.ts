// TempGuru MCP server, streamable-HTTP transport (production, on Vercel).
//
// The 12 tools and Skill resources are registered by the shared registerTools()
// in @/lib/mcp/register-tools, so this hosted endpoint and the stdio binary
// (src/mcp-stdio.ts) expose byte-identical tools, no behavior drift between the
// remote server and a local/Docker build. This file owns only what is
// HTTP-specific: per-request telemetry context, Accept-header normalization,
// CORS, and the streamable-HTTP handler wiring.
//
//   - plan_staffing              build a complete plan from city/date/roles
//   - save_staffing_plan         explicitly save a complete non-contact plan
//   - get_plan                    restore a non-PII saved staffing plan
//   - get_cities                 list all cities TempGuru serves (with tier)
//   - get_roles                  list all staffing roles with descriptions
//   - check_availability         deterministic lead-time guidance for a city/date
//   - get_role_pricing           rate range for a role in a specific city
//   - get_compliance_by_state    state-level employment compliance summary
//   - get_policies                published booking/procurement terms
//   - get_rate_benchmark          citable W-2 Rate Index benchmark
//   - get_quote_status            received/queued quote status by TG reference
//   - request_quote              return a prefilled buyer-operated quote form
//
// plan_staffing retains its Phase A non-destructive saved-plan side effect for
// compatibility. save_staffing_plan is the explicit non-contact saved-plan
// write; request_quote is read-only and never accepts or transmits contact data.
//
// Transport: official dual-era HTTP entry (2025 initialize/streamable HTTP
// plus the 2026-07-28 per-request envelope protocol).
// Public endpoint: https://mcp.tempguru.co/mcp

import { createMcpHandler } from "@modelcontextprotocol/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTempGuruMcpServer } from "@/lib/mcp/create-server";
import { SKILL_SLUGS, type SkillSlug } from "@/lib/mcp/register-tools";
import { runWithContext, currentContext } from "@/lib/telemetry/context";
import { classifyUserAgent } from "@/lib/telemetry/classify-ua";
import { normalizeSourcePlatform } from "@/lib/telemetry/source-tags";
import { track } from "@/lib/telemetry/track";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Skill resource content ───────────────────────────────────────────────
//
// SKILL.md files are loaded once at module-init time and served as MCP
// resources. Source-of-truth is /content/skills/*.md in this repo, kept in
// sync with the canonical files at tempguru.co/.well-known/skills/<name>/SKILL.md.
//
// Loading at module-init (not per-request) avoids filesystem reads on every
// resources/read call. Vercel's Fluid Compute reuses module state across
// requests, so the read happens once per cold start.
const SKILLS_DIR = join(process.cwd(), "content", "skills");
const SKILL_BODIES = Object.fromEntries(
  SKILL_SLUGS.map((slug) => [slug, readFileSync(join(SKILLS_DIR, `${slug}.md`), "utf-8")]),
) as Record<SkillSlug, string>;

// ─── Handler ──────────────────────────────────────────────────────────────

const handler = createMcpHandler(
  () =>
    createTempGuruMcpServer({
      // Tools + resources come from the shared module. The HTTP route's only
      // addition is telemetry: enrich each record with the request context
      // bound in withAcceptNormalization (User-Agent + Vercel IP-country),
      // then write to Redis. The stdio binary omits onTrack entirely.
      onTrack: async (record) => {
        const ctx = currentContext();
        await track({
          ...record,
          channel: "mcp",
          userAgent: ctx.userAgent,
          ipCountry: ctx.ipCountry,
          source: ctx.source,
          sourcePlatform: record.sourcePlatform || ctx.platform,
        });
      },
      resources: SKILL_BODIES,
    }),
  {
    // Preserve the installed endpoint for initialize-based clients while the
    // same factory also serves the 2026-07-28 per-request protocol.
    legacy: "stateless",
    responseMode: "auto",
    onerror: (error) => {
      console.error("[tempguru-mcp] HTTP transport error:", error);
    },
  },
);

// ─── Accept header normalization wrapper ────────────────────────────────
//
// The official transport enforces the MCP requirement that clients advertise
// both `application/json` and `text/event-stream`. Real-world clients
// (Anthropic's claude.ai connectors among them) sometimes send only one and
// get a 406, which surfaces as "This connector has no tools available" with
// no further diagnostic.
//
// We rewrite the incoming Accept header to include both content types when
// either is missing, so the downstream handler always sees a spec-compliant
// request. Response shaping remains transport-owned: legacy calls retain
// streamable-HTTP behavior and modern calls use the configured auto mode.

// ─── CORS headers ──────────────────────────────────────────────────────
//
// Glama's health checker, in-browser MCP clients (Claude.ai connector
// surface, future web-based MCP playgrounds), and any directory scanner
// that probes from a browser context all require CORS preflight to
// succeed before the actual request lands.
//
// Until 2026-06-04 ~04:30 UTC the route returned 204 to OPTIONS without
// Access-Control-* headers. That looked fine to server-to-server clients
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
    "Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID, Authorization, X-TempGuru-Source",
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
  const userAgent = request.headers.get("user-agent") ?? "";
  const classifiedPlatform = normalizeSourcePlatform(classifyUserAgent(userAgent));
  const ctx = {
    userAgent,
    ipCountry: request.headers.get("x-vercel-ip-country") ?? "",
    // Client IP for bounded public read/save/status rate limits (never stored
    // raw). Vercel sets x-forwarded-for with the real client first.
    ip:
      (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      (request.headers.get("x-real-ip") ?? ""),
    // Attribution tag from a surface we control. Header first, `?source=` param
    // as a fallback for clients that can't set custom headers.
    source:
      request.headers.get("x-tempguru-source") ??
      new URL(request.url).searchParams.get("source") ??
      "",
    platform:
      classifiedPlatform && classifiedPlatform !== "other"
        ? classifiedPlatform
        : "",
  };

  return runWithContext(ctx, async () => {
    const accept = request.headers.get("accept") ?? "";

    if (accept.includes("application/json") && accept.includes("text/event-stream")) {
      return withCors(await handler.fetch(request));
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
      signal: request.signal,
    });

    return withCors(await handler.fetch(normalized));
  });
}

export {
  withAcceptNormalization as GET,
  withAcceptNormalization as POST,
  withAcceptNormalization as DELETE,
  withAcceptNormalization as OPTIONS,
};
