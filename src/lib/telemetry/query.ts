// Dashboard query layer — reads aggregated telemetry from Redis.
//
// All queries return null-safe data so the admin page renders even when
// Upstash isn't configured (e.g., local dev without env vars).

import { exec, isConfigured } from "./redis";

const utcDate = (): string => new Date().toISOString().slice(0, 10);

function lastNDates(n: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function aggregateHash(prefix: string, dates: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const date of dates) {
    const h = await exec((r) => r.hgetall(`${prefix}:${date}`));
    if (!h) continue;
    for (const [k, v] of Object.entries(h)) {
      result[k] = (result[k] ?? 0) + Number(v);
    }
  }
  return result;
}

async function aggregateZSet(prefix: string, dates: string[], topN: number): Promise<Array<{ member: string; count: number }>> {
  const totals: Record<string, number> = {};
  for (const date of dates) {
    // Get all members with their scores (small ZSETs only — we cap entries)
    const entries = await exec((r) => r.zrange(`${prefix}:${date}`, 0, -1, { withScores: true, rev: true }));
    if (!entries || entries.length === 0) continue;
    // Format: [member1, score1, member2, score2, ...]
    for (let i = 0; i < entries.length; i += 2) {
      const member = String(entries[i]);
      const score = Number(entries[i + 1]);
      totals[member] = (totals[member] ?? 0) + score;
    }
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([member, count]) => ({ member, count }));
}

export interface DashboardMetrics {
  configured: boolean;
  windowDays: number;
  totalRequests: number;
  totalErrors: number;
  byTool: Record<string, number>;
  byUa: Record<string, number>;
  byCountry: Record<string, number>;
  topCities: Array<{ member: string; count: number }>;
  topRoles: Array<{ member: string; count: number }>;
  topStates: Array<{ member: string; count: number }>;
  recent: Array<{
    ts: string;
    tool: string;
    ua: string;
    country: string | null;
    status: string;
    city: string | null;
    role: string | null;
    state: string | null;
  }>;
  dailyTotals: Array<{ date: string; count: number }>;
}

export async function getMetrics(windowDays = 7): Promise<DashboardMetrics> {
  if (!isConfigured()) {
    return {
      configured: false,
      windowDays,
      totalRequests: 0,
      totalErrors: 0,
      byTool: {},
      byUa: {},
      byCountry: {},
      topCities: [],
      topRoles: [],
      topStates: [],
      recent: [],
      dailyTotals: [],
    };
  }

  const dates = lastNDates(windowDays);

  const [byTool, byUa, byStatus, byCountry, topCities, topRoles, topStates, recentRaw] =
    await Promise.all([
      aggregateHash("tools", dates),
      aggregateHash("uas", dates),
      aggregateHash("status", dates),
      aggregateHash("countries", dates),
      aggregateZSet("queries:cities", dates, 20),
      aggregateZSet("queries:roles", dates, 20),
      aggregateZSet("queries:states", dates, 20),
      exec((r) => r.lrange("recent:invocations", 0, 49)),
    ]);

  const totalRequests = Object.values(byTool).reduce((a, b) => a + b, 0);
  const totalErrors = byStatus.error ?? 0;

  // Daily totals from the per-date tool hash sums
  const dailyTotals: Array<{ date: string; count: number }> = await Promise.all(
    dates.map(async (date) => {
      const h = await exec((r) => r.hgetall(`tools:${date}`));
      const count: number = h
        ? Object.values(h).reduce<number>((sum, v) => sum + Number(v), 0)
        : 0;
      return { date, count };
    }),
  );

  const recent = (recentRaw ?? []).map((raw) => {
    try {
      return JSON.parse(String(raw));
    } catch {
      return null;
    }
  }).filter(Boolean);

  return {
    configured: true,
    windowDays,
    totalRequests,
    totalErrors,
    byTool,
    byUa,
    byCountry,
    topCities,
    topRoles,
    topStates,
    recent,
    dailyTotals: dailyTotals.reverse(), // oldest → newest for chart
  };
}
