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
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext {
  return storage.getStore() ?? { userAgent: "", ipCountry: "" };
}
