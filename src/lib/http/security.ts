// Shared HTTP hardening for machine-readable responses and browser-origin
// allowlists. Browser-facing HTML uses a separate, framework-compatible CSP
// in next.config.ts because Next.js requires its own scripts and inline styles.

/** CSP for JSON, SSE, Markdown, and other non-rendered API responses. */
export const MACHINE_RESPONSE_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export const MACHINE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": MACHINE_RESPONSE_CSP,
};

/**
 * Browser origins known to use the public MCP endpoint. Values are exact
 * hostnames (never globs), matching @modelcontextprotocol/server's
 * originValidationResponse contract. Server-to-server clients omit Origin and
 * are unaffected.
 *
 * Deployments may add exact hostnames with MCP_ALLOWED_ORIGIN_HOSTNAMES, a
 * comma-separated hostname-only list (no scheme, port, path, or wildcard).
 */
export const DEFAULT_MCP_ORIGIN_HOSTNAMES = [
  "tempguru.co",
  "www.tempguru.co",
  "mcp.tempguru.co",
  "claude.ai",
  "claude.com",
  "glama.ai",
  "agentcat.com",
  "app.agentcat.com",
  "inspector.modelcontextprotocol.io",
  "localhost",
  "127.0.0.1",
  "[::1]",
] as const;

/**
 * The contact-bearing quote write is intentionally narrower than MCP. Only
 * TempGuru-owned browser surfaces and local development are trusted by
 * default. Approved server integrations send no Origin. Preview/custom owned
 * hosts can be added with QUOTE_ALLOWED_ORIGIN_HOSTNAMES.
 */
export const DEFAULT_QUOTE_ORIGIN_HOSTNAMES = [
  "tempguru.co",
  "www.tempguru.co",
  "mcp.tempguru.co",
  "localhost",
  "127.0.0.1",
  "[::1]",
] as const;

function exactHostname(value: string): string | undefined {
  const hostname = value.trim().toLowerCase();
  if (!hostname || hostname.includes("*") || hostname.includes("/")) return undefined;

  try {
    // The configuration contract is hostname-only. Parsing under a synthetic
    // HTTPS origin lets URL reject ports, credentials, and malformed IPv6.
    const parsed = new URL(`https://${hostname}`);
    if (
      parsed.hostname !== hostname ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/"
    ) {
      return undefined;
    }
    return hostname;
  } catch {
    return undefined;
  }
}

/** Merge validated, additive env hostnames into immutable defaults. */
export function configuredOriginHostnames(
  defaults: readonly string[],
  configured: string | undefined,
  platformHostnames: readonly (string | undefined)[] = [],
): string[] {
  const hostnames = new Set(defaults);
  for (const raw of configured?.split(",") ?? []) {
    const hostname = exactHostname(raw);
    if (hostname) hostnames.add(hostname);
  }
  for (const raw of platformHostnames) {
    const hostname = raw ? exactHostname(raw) : undefined;
    if (hostname) hostnames.add(hostname);
  }
  return [...hostnames];
}

/**
 * Include only the exact deployment domains Vercel provides for this running
 * build. This keeps preview forms and browser MCP probes usable without ever
 * admitting a broad `*.vercel.app` wildcard. Vercel values are hostname-only.
 */
export function configuredVercelOriginHostnames(
  defaults: readonly string[],
  configured: string | undefined,
): string[] {
  return configuredOriginHostnames(defaults, configured, [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]);
}

/** Add a token to Vary without losing transport-owned values such as Accept. */
export function appendVary(headers: Headers, token: string): void {
  const values = (headers.get("Vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === token.toLowerCase())) {
    values.push(token);
  }
  if (values.length) headers.set("Vary", values.join(", "));
}

/** Clone a response while preserving a streaming body and adding hardening. */
export function withMachineSecurity(
  response: Response,
  options: { varyOrigin?: boolean } = {},
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(MACHINE_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (options.varyOrigin) appendVary(headers, "Origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export interface ExactCorsOptions {
  methods: string;
  allowHeaders: string;
  exposeHeaders?: string;
  maxAge?: string;
}

/**
 * Apply CORS after Origin has passed server-side validation. A browser gets
 * its exact Origin echoed; a server client without Origin receives no ACAO.
 */
export function withExactOriginCors(
  response: Response,
  request: Request,
  options: ExactCorsOptions,
): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  else headers.delete("Access-Control-Allow-Origin");
  headers.set("Access-Control-Allow-Methods", options.methods);
  headers.set("Access-Control-Allow-Headers", options.allowHeaders);
  if (options.exposeHeaders) {
    headers.set("Access-Control-Expose-Headers", options.exposeHeaders);
  }
  headers.set("Access-Control-Max-Age", options.maxAge ?? "86400");
  appendVary(headers, "Origin");

  return withMachineSecurity(
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}
