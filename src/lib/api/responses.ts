// HTTP envelope helpers for the REST API.
//
// All REST routes use these to keep CORS, cache, and error envelopes
// consistent. Successful responses are returned via `jsonOk`, which wraps
// in { input, ...data } so agents can verify what was resolved. Errors
// use `jsonError` to produce a uniform { error: { code, message } } shape
// with the right HTTP status.

import type { QueryError } from "@/lib/mcp/queries";

const STANDARD_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

const CACHE_PUBLIC_1H = "public, max-age=3600";
const CACHE_NO_STORE = "no-store";

/** Successful JSON response with input echo, CORS, and a 1-hour public cache. */
export function jsonOk<T>(input: unknown, data: T, init?: { cacheControl?: string }) {
  return new Response(JSON.stringify({ input, ...(data as object) }, null, 2), {
    status: 200,
    headers: {
      ...STANDARD_HEADERS,
      "Cache-Control": init?.cacheControl ?? CACHE_PUBLIC_1H,
    },
  });
}

/** Successful JSON response with no caching (for /health). */
export function jsonOkNoCache<T>(data: T) {
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      ...STANDARD_HEADERS,
      "Cache-Control": CACHE_NO_STORE,
    },
  });
}

const ERROR_STATUS: Record<QueryError["code"], number> = {
  missing_required: 400,
  invalid_param: 400,
  not_found: 404,
};

function errorEnvelope(error: QueryError): string {
  return JSON.stringify(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.field ? { field: error.field } : {}),
        ...(error.suggestion ? { suggestion: error.suggestion } : {}),
      },
    },
    null,
    2,
  );
}

/** Map a QueryError to an HTTP response with the right status and envelope. */
export function jsonError(error: QueryError, init?: { status?: number }) {
  const status = init?.status ?? ERROR_STATUS[error.code];
  return new Response(errorEnvelope(error), {
    status,
    headers: {
      ...STANDARD_HEADERS,
      "Cache-Control": CACHE_NO_STORE,
    },
  });
}

/** Generic 400 for malformed query params (before they hit a query function). */
export function jsonBadRequest(message: string, field?: string) {
  return jsonError({ code: "invalid_param", message, field });
}

/** OPTIONS preflight response. */
export function optionsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      ...STANDARD_HEADERS,
      "Cache-Control": "public, max-age=86400",
    },
  });
}

// ─── Write-endpoint variants (POST /api/v1/quote-requests) ───────────────
//
// STANDARD_HEADERS advertises GET-only CORS, which is what browsers check on
// the preflight of the read endpoints. The write endpoint needs its own
// preflight advertising POST, and its responses must never be cached.

const WRITE_HEADERS: Record<string, string> = {
  ...STANDARD_HEADERS,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** JSON response for a write endpoint: POST CORS, never cached. */
export function jsonWrite<T>(data: T, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...WRITE_HEADERS,
      "Cache-Control": CACHE_NO_STORE,
    },
  });
}

/** jsonError variant for write endpoints: same envelope, POST CORS. */
export function jsonWriteError(error: QueryError, init?: { status?: number }) {
  const status = init?.status ?? ERROR_STATUS[error.code];
  return new Response(errorEnvelope(error), {
    status,
    headers: {
      ...WRITE_HEADERS,
      "Cache-Control": CACHE_NO_STORE,
    },
  });
}

/** 429 for the rate-limited write endpoint, with a Retry-After header. */
export function jsonRateLimited(retryAfterSeconds: number) {
  return new Response(
    JSON.stringify(
      {
        error: {
          code: "rate_limited",
          message: `Too many quote submissions from this address. Retry after ${retryAfterSeconds} seconds, or submit via https://tempguru.co/get-staffing.`,
        },
      },
      null,
      2,
    ),
    {
      status: 429,
      headers: {
        ...WRITE_HEADERS,
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": CACHE_NO_STORE,
      },
    },
  );
}

/** OPTIONS preflight for the write endpoint (advertises POST). */
export function optionsPreflightPost() {
  return new Response(null, {
    status: 204,
    headers: {
      ...WRITE_HEADERS,
      "Cache-Control": "public, max-age=86400",
    },
  });
}

// ─── Param coercion helpers ───────────────────────────────────────────────

/** Read a required string query param. Returns null if missing/empty. */
export function requireParam(url: URL, name: string): string | null {
  const v = url.searchParams.get(name);
  if (!v || !v.trim()) return null;
  return v.trim();
}

/** Read an optional string query param. */
export function optionalParam(url: URL, name: string): string | undefined {
  const v = url.searchParams.get(name);
  if (!v || !v.trim()) return undefined;
  return v.trim();
}

/** Read an optional positive-integer query param. Returns undefined on absence or invalid. */
export function optionalIntParam(url: URL, name: string): number | undefined {
  const v = url.searchParams.get(name);
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}
