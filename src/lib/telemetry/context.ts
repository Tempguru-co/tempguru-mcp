// Per-request context using AsyncLocalStorage.
//
// mcp-handler's tool callbacks receive parsed tool parameters but not the
// underlying Request object, so headers like User-Agent aren't directly
// reachable from inside a tool handler. We bind them to a request-scoped
// AsyncLocalStorage frame at the top of the route handler, then read them
// from inside tool handlers without threading the Request through.

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  userAgent: string;
  ipCountry: string;
  // Client IP (x-forwarded-for first hop), used ONLY for the request_quote
  // rate limiter, which stores a truncated hash, never the raw IP. Empty under
  // stdio, where the limiter fails open.
  ip: string;
  // Optional attribution tag from a surface we control (the Custom GPT, the
  // website widget, a test script, a team demo). Set via the `X-TempGuru-Source`
  // header or a `?source=` query param. Empty for organic/unattributed traffic.
  source: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext {
  return storage.getStore() ?? { userAgent: "", ipCountry: "", ip: "", source: "" };
}
