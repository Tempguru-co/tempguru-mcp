// Non-PII quote status stubs keyed by the public TG reference. These are not
// the CRM source of truth yet; they let an agent confirm receipt/queue capture
// and leave an intentionally extensible status field for later CRM sync.

import { z } from "zod";
import {
  redisJsonStore,
  type ExpiringJsonStore,
} from "../telemetry/expiring-json-store";
import { findCity } from "./data";
import { normalizePlanEventType } from "./plan-store";

export const QUOTE_STATUS_TTL_SECONDS = 60 * 60 * 24 * 90;
export const QUOTE_REFERENCE_PATTERN = /^TG-[A-HJ-NP-Z2-9]{6}$/;

export const QuoteStatusStubSchema = z.object({
  status: z.enum(["received", "queued"]),
  created_at: z.string(),
  deal_name: z.string(),
  channel: z.enum(["mcp", "rest"]),
});

export type QuoteStatusStub = z.infer<typeof QuoteStatusStubSchema>;

/**
 * Status Redis is a no-PII zone. Build its display name only from controlled
 * event types and catalog-resolved cities; never persist the caller's free
 * event-date/type/city strings verbatim.
 */
export function buildQuoteStatusDealName(eventType: string, city: string): string {
  const safeType = normalizePlanEventType(eventType) ?? "event";
  const safeCity = findCity(city)?.name ?? "submitted market";
  return `Agent Quote, ${safeType} · ${safeCity}`;
}

export function makeQuoteStatusStub(
  status: QuoteStatusStub["status"],
  dealName: string,
  channel: "mcp" | "rest",
  createdAt = new Date().toISOString(),
): QuoteStatusStub {
  return { status, created_at: createdAt, deal_name: dealName, channel };
}

export function quoteStatusTtlSeconds(
  createdAt: string,
  nowMs = Date.now(),
): number {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return QUOTE_STATUS_TTL_SECONDS;
  return Math.min(
    QUOTE_STATUS_TTL_SECONDS,
    Math.max(
      0,
      Math.ceil((createdMs + QUOTE_STATUS_TTL_SECONDS * 1000 - nowMs) / 1000),
    ),
  );
}

export async function saveQuoteStatus(
  reference: string,
  stub: QuoteStatusStub,
  store: ExpiringJsonStore = redisJsonStore,
): Promise<boolean> {
  const normalized = reference.trim().toUpperCase();
  if (!QUOTE_REFERENCE_PATTERN.test(normalized)) return false;
  const ttl = quoteStatusTtlSeconds(stub.created_at);
  if (ttl <= 0) return false;
  return (await store.put(`leads:ref:${normalized}`, stub, ttl)) === "stored";
}

export async function loadQuoteStatus(
  reference: string,
  store: ExpiringJsonStore = redisJsonStore,
): Promise<QuoteStatusStub | null> {
  const normalized = reference.trim().toUpperCase();
  if (!QUOTE_REFERENCE_PATTERN.test(normalized)) return null;
  const raw = await store.get<unknown>(`leads:ref:${normalized}`);
  if (!raw) return null;
  const parsedRaw =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  const parsed = QuoteStatusStubSchema.safeParse(parsedRaw);
  return parsed.success ? parsed.data : null;
}

export type QuoteStatusResult =
  | {
      quote_found: true;
      reference: string;
      status: QuoteStatusStub["status"];
      created_at: string;
      deal_name: string;
      channel: QuoteStatusStub["channel"];
      message: string;
      follow_up: string;
    }
  | {
      quote_found: false;
      reference: string;
      message: string;
      follow_up: string;
    };

const FOLLOW_UP_GUIDANCE =
  "A coordinator replies within one business day; to follow up cite this reference to megan@tempguru.co.";

/** Shared MCP/REST read behavior for a quote reference. */
export async function queryQuoteStatus(
  reference: string,
  store: ExpiringJsonStore = redisJsonStore,
): Promise<QuoteStatusResult> {
  const normalized = reference.trim().toUpperCase();
  const stub = await loadQuoteStatus(normalized, store);
  if (!stub) {
    return {
      quote_found: false,
      reference: normalized,
      message:
        "That quote reference was not found or its 90-day status record has expired. This does not prove the CRM request is absent.",
      follow_up: FOLLOW_UP_GUIDANCE,
    };
  }
  return {
    quote_found: true,
    reference: normalized,
    ...stub,
    message:
      stub.status === "queued"
        ? "The request was durably queued while the CRM was unavailable and remains captured for retry."
        : "The request was received by TempGuru's CRM for coordinator review.",
    follow_up: FOLLOW_UP_GUIDANCE,
  };
}
