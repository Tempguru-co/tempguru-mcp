// Small, fail-open JSON persistence boundary over the same Upstash Redis used
// for telemetry. Only non-PII lifecycle records belong here (saved staffing
// plans and quote-status stubs). The interface is injectable so unit tests can
// exercise TTL/lifecycle behavior without a network connection.

import { exec, isConfigured } from "./redis";

export const REDIS_OP_CAP_MS = 1500;
export type StorePutResult = "stored" | "collision" | "unavailable";

export interface ExpiringJsonStore {
  put(
    key: string,
    value: unknown,
    ttlSeconds: number,
    options?: { ifAbsent?: boolean },
  ): Promise<StorePutResult>;
  get<T>(key: string): Promise<T | null>;
}

/** Cap any promise; a hung dependency resolves to null instead of stalling. */
export function withCap<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T | null>;
}

export const redisJsonStore: ExpiringJsonStore = {
  async put(key, value, ttlSeconds, options) {
    if (!isConfigured()) return "unavailable";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = Symbol("redis-write-timeout");
    try {
      const result = await Promise.race([
        exec((redis) =>
          options?.ifAbsent
            ? redis.set(key, value, { ex: ttlSeconds, nx: true })
            : redis.set(key, value, { ex: ttlSeconds }),
        ),
        new Promise<typeof timedOut>((resolve) => {
          timer = setTimeout(() => resolve(timedOut), REDIS_OP_CAP_MS);
        }),
      ]);
      if (result === timedOut) return "unavailable";
      if (result === "OK") return "stored";
      return options?.ifAbsent && result === null ? "collision" : "unavailable";
    } catch {
      return "unavailable";
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  async get<T>(key: string) {
    if (!isConfigured()) return null;
    try {
      return await withCap(exec((redis) => redis.get<T>(key)), REDIS_OP_CAP_MS);
    } catch {
      return null;
    }
  },
};
