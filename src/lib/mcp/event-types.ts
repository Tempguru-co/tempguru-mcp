/** Canonical event-type values advertised to agents and stored in plans. */
export const EVENT_TYPES = [
  "trade-show",
  "conference",
  "festival",
  "concert",
  "sporting-event",
  "corporate",
  "brand-activation",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const EVENT_TYPE_SET = new Set<string>(EVENT_TYPES);

/**
 * Reduce a legacy free-string event type to the documented non-PII catalog.
 *
 * MCP input schemas advertise EVENT_TYPES as an enum for capable agents, while
 * intentionally retaining this tolerant server-side path for older callers.
 */
export function normalizePlanEventType(
  value: string | null | undefined,
): EventType | null {
  if (!value?.trim()) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return EVENT_TYPE_SET.has(normalized) ? (normalized as EventType) : "other";
}
