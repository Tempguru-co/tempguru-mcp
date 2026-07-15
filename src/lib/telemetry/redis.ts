// Telemetry storage, Upstash Redis via Vercel Marketplace integration.
//
// The integration sets KV_REST_API_URL + KV_REST_API_TOKEN automatically on
// the tempguru-mcp project once Upstash is added from the Vercel Marketplace.
// If those env vars aren't set (e.g. local dev without integration), the
// client below short-circuits to a no-op so the MCP tools continue serving
// without an active telemetry backend.

import { Redis } from "@upstash/redis";

let cached: Redis | null | undefined;

// Deterministic eval-only Redis subset. The stdio golden suite needs to prove
// plan -> resume -> quote -> status without external Upstash/Notion services.
// Both guards are required so this can never activate in a deployed runtime.
class EvalMemoryRedis {
  private values = new Map<string, { value: unknown; expiresAt?: number }>();

  private live(key: string) {
    const row = this.values.get(key);
    if (row?.expiresAt && row.expiresAt <= Date.now()) {
      this.values.delete(key);
      return undefined;
    }
    return row;
  }

  async set(key: string, value: unknown, options?: { ex?: number; nx?: boolean }) {
    const commitDelayMs =
      key.startsWith("lead:dedup:")
        ? Number(process.env.TEMPGURU_EVAL_DEDUP_SET_COMMIT_DELAY_MS ?? 0)
        : 0;
    if (Number.isFinite(commitDelayMs) && commitDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, commitDelayMs));
    }
    if (
      key.startsWith("leads:pending:record:") &&
      process.env.TEMPGURU_EVAL_QUEUE_WRITE_FAIL === "1"
    ) {
      throw new Error("eval-memory injected queue write failure");
    }
    if (options?.nx && this.live(key)) return null;
    this.values.set(key, {
      value,
      ...(options?.ex ? { expiresAt: Date.now() + options.ex * 1000 } : {}),
    });
    // Unit-only fault injection: model the important distributed-systems case
    // where Redis commits a dedup claim but its HTTP response arrives after the
    // caller's cap. The value is visible to a follow-up GET before SET resolves.
    const delayMs =
      key.startsWith("lead:dedup:")
        ? Number(process.env.TEMPGURU_EVAL_DEDUP_SET_DELAY_MS ?? 0)
        : 0;
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return "OK";
  }

  async get<T>(key: string): Promise<T | null> {
    if (key.startsWith("leads:pending:record:")) {
      const injectedMisses = Number(
        process.env.TEMPGURU_EVAL_QUEUE_RECORD_READ_MISSES ?? 0,
      );
      if (Number.isFinite(injectedMisses) && injectedMisses > 0) {
        process.env.TEMPGURU_EVAL_QUEUE_RECORD_READ_MISSES = String(
          injectedMisses - 1,
        );
        return null;
      }
    }
    return (this.live(key)?.value as T | undefined) ?? null;
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    const row = this.live(key);
    const hash =
      row?.value && typeof row.value === "object" && !Array.isArray(row.value)
        ? (row.value as Record<string, number>)
        : {};
    const next = Number(hash[field] ?? 0) + increment;
    hash[field] = next;
    this.values.set(key, {
      value: hash,
      ...(row?.expiresAt ? { expiresAt: row.expiresAt } : {}),
    });
    return next;
  }

  async del(key: string) {
    return this.values.delete(key) ? 1 : 0;
  }

  async eval<TArgs extends unknown[], TData>(
    script: string,
    keys: string[],
    args: TArgs,
  ): Promise<TData> {
    const normalized = script.replace(/\s+/g, " ");
    if (
      keys.length === 1 &&
      args.length === 3 &&
      normalized.includes('redis.call("GET", KEYS[1])') &&
      normalized.includes('redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])')
    ) {
      const current = await this.get(keys[0]);
      if (current !== args[0]) return null as TData;
      return (await this.set(keys[0], args[1], {
        ex: Number(args[2]),
      })) as TData;
    }
    if (
      keys.length === 1 &&
      args.length === 1 &&
      normalized.includes('redis.call("GET", KEYS[1])') &&
      normalized.includes('redis.call("DEL", KEYS[1])')
    ) {
      const current = await this.get(keys[0]);
      const removed = current === args[0] ? await this.del(keys[0]) : 0;
      return removed as TData;
    }
    throw new Error("EvalMemoryRedis received an unsupported script");
  }

  async lpush(key: string, ...values: unknown[]) {
    const row = this.live(key);
    const existing = row?.value;
    const list = Array.isArray(existing) ? existing : [];
    list.unshift(...values);
    this.values.set(key, { value: list, ...(row?.expiresAt ? { expiresAt: row.expiresAt } : {}) });
    return list.length;
  }

  async rpop<T>(key: string): Promise<T | null> {
    const row = this.live(key);
    if (!row || !Array.isArray(row.value)) return null;
    const value = row.value.pop() as T | undefined;
    if (row.value.length === 0) this.values.delete(key);
    return value ?? null;
  }

  async lindex<T>(key: string, index: number): Promise<T | null> {
    const row = this.live(key);
    if (!row || !Array.isArray(row.value)) return null;
    const resolved = index < 0 ? row.value.length + index : index;
    return (row.value[resolved] as T | undefined) ?? null;
  }

  async lmove<T>(
    source: string,
    destination: string,
    whereFrom: "left" | "right",
    whereTo: "left" | "right",
  ): Promise<T | null> {
    const sourceRow = this.live(source);
    if (!sourceRow || !Array.isArray(sourceRow.value) || sourceRow.value.length === 0) {
      return null;
    }
    const value = (whereFrom === "left" ? sourceRow.value.shift() : sourceRow.value.pop()) as T;
    if (sourceRow.value.length === 0) this.values.delete(source);

    const destinationRow = this.live(destination);
    const destinationList = Array.isArray(destinationRow?.value) ? destinationRow.value : [];
    if (whereTo === "left") destinationList.unshift(value);
    else destinationList.push(value);
    this.values.set(destination, {
      value: destinationList,
      ...(destinationRow?.expiresAt ? { expiresAt: destinationRow.expiresAt } : {}),
    });
    return value;
  }

  async lrem<T>(key: string, count: number, value: T): Promise<number> {
    const row = this.live(key);
    if (!row || !Array.isArray(row.value)) return 0;
    const same = (candidate: unknown) =>
      typeof candidate === "object" || typeof value === "object"
        ? JSON.stringify(candidate) === JSON.stringify(value)
        : candidate === value;
    let remaining = count === 0 ? Number.POSITIVE_INFINITY : Math.abs(count);
    let removed = 0;
    if (count < 0) {
      for (let index = row.value.length - 1; index >= 0 && remaining > 0; index--) {
        if (!same(row.value[index])) continue;
        row.value.splice(index, 1);
        remaining--;
        removed++;
      }
    } else {
      for (let index = 0; index < row.value.length && remaining > 0; ) {
        if (!same(row.value[index])) {
          index++;
          continue;
        }
        row.value.splice(index, 1);
        remaining--;
        removed++;
      }
    }
    if (row.value.length === 0) this.values.delete(key);
    return removed;
  }

  async expire(key: string, seconds: number) {
    const row = this.live(key);
    if (!row) return 0;
    row.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  multi() {
    const commands: Array<() => Promise<unknown>> = [];
    const pipeline = {
      set: (key: string, value: unknown, options?: { ex?: number; nx?: boolean }) => {
        commands.push(() => this.set(key, value, options));
        return pipeline;
      },
      hincrby: (key: string, field: string, increment: number) => {
        commands.push(() => this.hincrby(key, field, increment));
        return pipeline;
      },
      lpush: (key: string, ...values: unknown[]) => {
        commands.push(() => this.lpush(key, ...values));
        return pipeline;
      },
      lrem: <T>(key: string, count: number, value: T) => {
        commands.push(() => this.lrem(key, count, value));
        return pipeline;
      },
      expire: (key: string, seconds: number) => {
        commands.push(() => this.expire(key, seconds));
        return pipeline;
      },
      del: (key: string) => {
        commands.push(() => this.del(key));
        return pipeline;
      },
      exec: async () => {
        const results: unknown[] = [];
        for (const command of commands) results.push(await command());
        return results;
      },
    };
    return pipeline;
  }
}

function client(): Redis | null {
  if (cached !== undefined) return cached;
  if (
    process.env.NODE_ENV === "test" &&
    process.env.TEMPGURU_EVAL_MEMORY_REDIS === "1"
  ) {
    cached = new EvalMemoryRedis() as unknown as Redis;
    return cached;
  }
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  cached = new Redis({ url, token });
  return cached;
}

/**
 * Awaited execution against Redis. Returns the command's result, or null when
 * telemetry isn't configured (e.g. local dev / stdio). Does NOT swallow
 * errors; read callers want them surfaced, while write callers (telemetry) wrap their own
 * try/catch so a Redis hiccup can never break a tool call.
 *
 * Telemetry writes are awaited via this same path (capped) rather than deferred:
 * on Vercel's serverless runtime, fire-and-forget / next-server after() writes
 * were killed on function shutdown before they reached Upstash. Awaiting inside
 * the tool handler is the only durable option.
 */
export async function exec<T>(cmd: (redis: Redis) => Promise<T>): Promise<T | null> {
  const r = client();
  if (!r) return null;
  return cmd(r);
}

export function isConfigured(): boolean {
  return client() !== null;
}
