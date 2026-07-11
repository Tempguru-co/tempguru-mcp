// Pull a best-effort START date out of an event-dates string. Handles the ISO
// and US-numeric forms first, then free-text month-name forms such as
// "January 6-9, 2026" or "Aug 14-15, 2026". The returned Date contains only
// the parsed UTC calendar date; callers can safely persist its ISO date without
// retaining the original free text.

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

// Full names precede abbreviations and word boundaries prevent false matches
// such as May in Mayflower or Mar in marketing.
const MONTH_RE =
  /\b(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)\b/;

export function parseEventStart(value: string): Date | null {
  // Collect every valid ISO/US numeric date and select the latest one, so
  // "setup 2026-01-05, event 2026-08-14" resolves to the event date.
  const validUtc = (year: number, month: number, day: number): number | null => {
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    const timestamp = Date.UTC(year, month, day);
    const date = new Date(timestamp);
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month &&
      date.getUTCDate() === day
      ? timestamp
      : null;
  };

  const candidates: number[] = [];
  for (const match of value.matchAll(/\b(20[2-9]\d)[-/](\d{1,2})[-/](\d{1,2})(?!\d)/g)) {
    const timestamp = validUtc(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    if (timestamp !== null) candidates.push(timestamp);
  }
  for (const match of value.matchAll(/\b(\d{1,2})[-/](\d{1,2})[-/](20[2-9]\d)\b/g)) {
    const timestamp = validUtc(
      Number(match[3]),
      Number(match[1]) - 1,
      Number(match[2]),
    );
    if (timestamp !== null) candidates.push(timestamp);
  }
  if (candidates.length) return new Date(Math.max(...candidates));

  // For named months, use the first month token in text order and only inspect
  // the text after it for a day. A leading crew/shift count therefore cannot be
  // mistaken for the calendar day.
  const years = [...value.matchAll(/\b(20[2-9]\d)\b/g)].map((match) =>
    Number(match[1]),
  );
  if (!years.length) return null;
  const lower = value.toLowerCase();
  const monthMatch = lower.match(MONTH_RE);
  if (!monthMatch) return null;

  const month = MONTH_INDEX[monthMatch[1]];
  const year = Math.max(...years);
  let day = 1;
  const afterMonth = lower
    .slice((monthMatch.index ?? 0) + monthMatch[1].length)
    .replace(/20[2-9]\d/g, " ");
  const dayMatch = afterMonth.match(/\b([0-3]?\d)\b/);
  if (dayMatch) {
    const candidate = Number(dayMatch[1]);
    if (candidate >= 1 && candidate <= 31) day = candidate;
  }

  const timestamp = validUtc(year, month, day);
  // If the named day is impossible (for example Feb 31), preserve only the
  // unambiguous month/year rather than allowing JavaScript to roll it forward.
  return new Date(timestamp ?? Date.UTC(year, month, 1));
}
