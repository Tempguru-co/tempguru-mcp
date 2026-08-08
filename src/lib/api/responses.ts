// HTTP envelope helpers for the REST API.
//
// All REST routes use these to keep CORS, cache, and error envelopes
// consistent. Successful responses are returned via `jsonOk`, which wraps
// in { input, ...data } so agents can verify what was resolved. Errors
// use `jsonError` to produce a uniform { error: { code, message } } shape
// with the right HTTP status.

import type { QueryError } from "@/lib/mcp/queries";
import {
  MACHINE_SECURITY_HEADERS,
  withExactOriginCors,
  withMachineSecurity,
} from "@/lib/http/security";

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  ...MACHINE_SECURITY_HEADERS,
};

const STANDARD_HEADERS: Record<string, string> = {
  ...JSON_HEADERS,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, X-TempGuru-Source",
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
// STANDARD_HEADERS advertises wildcard GET-only CORS for public read data. The
// contact-bearing write endpoint must never use wildcard CORS: its route first
// validates Origin, then these helpers echo only that already-approved exact
// origin. Server integrations without Origin receive no ACAO.

const WRITE_CORS = {
  methods: "POST, OPTIONS",
  allowHeaders: "Content-Type, Accept, X-TempGuru-Source",
} as const;

function withWriteCors(response: Response, request: Request): Response {
  return withExactOriginCors(response, request, WRITE_CORS);
}

/** JSON response for a write endpoint: POST CORS, never cached. */
export function jsonWrite<T>(request: Request, data: T, status = 200) {
  return withWriteCors(
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": CACHE_NO_STORE,
      },
    }),
    request,
  );
}

/** jsonError variant for write endpoints: same envelope, POST CORS. */
export function jsonWriteError(
  request: Request,
  error: QueryError,
  init?: { status?: number },
) {
  const status = init?.status ?? ERROR_STATUS[error.code];
  return withWriteCors(
    new Response(errorEnvelope(error), {
      status,
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": CACHE_NO_STORE,
      },
    }),
    request,
  );
}

/** 429 for public read endpoints, with a Retry-After header. */
export function jsonRateLimited(retryAfterSeconds: number) {
  return new Response(
    JSON.stringify(
      {
        error: {
          code: "rate_limited",
          message: `Too many requests from this address. Retry after ${retryAfterSeconds} seconds.`,
        },
      },
      null,
      2,
    ),
    {
      status: 429,
      headers: {
        ...STANDARD_HEADERS,
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": CACHE_NO_STORE,
      },
    },
  );
}

/** 429 for the validated write endpoint, with exact-origin CORS. */
export function jsonWriteRateLimited(request: Request, retryAfterSeconds: number) {
  return withWriteCors(
    new Response(
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
          ...JSON_HEADERS,
          "Retry-After": String(retryAfterSeconds),
          "Cache-Control": CACHE_NO_STORE,
        },
      },
    ),
    request,
  );
}

/** 403 for an untrusted present Origin. Deliberately carries no ACAO. */
export function jsonWriteOriginRejected() {
  return withMachineSecurity(
    new Response(
      JSON.stringify(
        {
          error: {
            code: "forbidden",
            message: "This browser origin is not allowed to submit quote requests.",
          },
        },
        null,
        2,
      ),
      {
        status: 403,
        headers: {
          ...JSON_HEADERS,
          "Cache-Control": CACHE_NO_STORE,
        },
      },
    ),
    { varyOrigin: true },
  );
}

/** OPTIONS preflight for the write endpoint (advertises POST). */
export function optionsPreflightPost(request: Request) {
  return withWriteCors(
    new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    }),
    request,
  );
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
