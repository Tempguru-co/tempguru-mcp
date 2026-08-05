import type { Metadata } from "next";
import { findRole, ROLES } from "@/lib/mcp/data";
import {
  canRestorePlanLink,
  loadPlanSnapshot,
  normalizePlanEventType,
  PLAN_ID_PATTERN,
  type PlanSnapshot,
} from "@/lib/mcp/plan-store";
import { sanitizeQuoteAttributionQuery } from "@/lib/mcp/quote-attribution";
import QuoteRequestForm, {
  type QuoteFormInitial,
  type QuoteRolePrefill,
} from "./quote-request-form";
import styles from "./request-quote.module.css";

export const metadata: Metadata = {
  title: "Review your staffing plan | TempGuru",
  description:
    "Review your TempGuru event staffing plan and securely request a human-prepared quote.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type SearchValue = string | string[] | undefined;

type RequestQuoteSearchParams = {
  plan?: SearchValue;
  sig?: SearchValue;
  exp?: SearchValue;
  city?: SearchValue;
  dates?: SearchValue;
  roles?: SearchValue;
  event_type?: SearchValue;
  attendees?: SearchValue;
  source_platform?: SearchValue;
  skill_id?: SearchValue;
  skill_version?: SearchValue;
  utm_source?: SearchValue;
  utm_medium?: SearchValue;
  utm_campaign?: SearchValue;
  utm_content?: SearchValue;
};

type PlanLinkState = "restored" | "invalid" | "unavailable" | "none";

type SafePlanLine = QuoteRolePrefill & {
  estimatedLow?: number;
  estimatedHigh?: number;
};

type SafePlanReview = {
  city: string;
  eventDates: string;
  eventType: string;
  attendees?: number;
  roles: SafePlanLine[];
  estimate?: {
    low: number;
    high: number;
    currency: "USD" | "CAD";
    basis: string;
  };
  overtimeEstimate?: {
    low: number;
    high: number;
    currency: "USD" | "CAD";
    note: string;
  };
  complianceJurisdiction?: string;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  "trade-show": "Trade show",
  conference: "Conference",
  festival: "Festival",
  concert: "Concert",
  "sporting-event": "Sporting event",
  corporate: "Corporate event",
  "brand-activation": "Brand activation",
  other: "Other",
};

function singleValue(value: SearchValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function cleanText(value: string | undefined, maxLength: number): string {
  if (!value || value.length > maxLength) return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedParam(value: SearchValue, maxLength: number): string {
  const cleaned = cleanText(singleValue(value), maxLength);
  return /[<>{}\[\]\\`]/.test(cleaned) ? "" : cleaned;
}

function safePositiveInteger(
  value: string | undefined,
  maximum: number,
): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : undefined;
}

function parseQueryRoles(value: SearchValue): QuoteRolePrefill[] {
  const raw = singleValue(value);
  if (!raw || raw.length > 4_000) return [];

  const roles = new Map<string, QuoteRolePrefill>();
  for (const entry of raw.split(",").slice(0, 50)) {
    const separator = entry.lastIndexOf(":");
    if (separator <= 0) continue;
    const requestedRole = cleanText(entry.slice(0, separator), 80);
    const headcount = safePositiveInteger(entry.slice(separator + 1).trim(), 10_000);
    const knownRole = requestedRole ? findRole(requestedRole) : null;
    if (!knownRole || !headcount) continue;

    const existing = roles.get(knownRole.slug);
    const combinedHeadcount = (existing?.headcount ?? 0) + headcount;
    if (combinedHeadcount > 10_000) continue;
    roles.set(knownRole.slug, {
      role: knownRole.name,
      headcount: combinedHeadcount,
    });
  }
  return [...roles.values()];
}

function queryPrefill(params: RequestQuoteSearchParams): QuoteFormInitial {
  const rawEventType = boundedParam(params.event_type, 80);
  return {
    city: boundedParam(params.city, 120),
    eventDates: boundedParam(params.dates, 160),
    eventType: normalizePlanEventType(rawEventType) ?? "",
    attendees: safePositiveInteger(singleValue(params.attendees)?.trim(), 5_000_000),
    roles: parseQueryRoles(params.roles),
  };
}

function finiteAmount(value: number): number | undefined {
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000_000
    ? value
    : undefined;
}

function safeSnapshot(snapshot: PlanSnapshot): SafePlanReview {
  const cityName = cleanText(snapshot.city.name, 120);
  const cityState = cleanText(snapshot.city.state, 80);
  const roles: SafePlanLine[] = [];
  for (const line of snapshot.plan_lines.slice(0, 50)) {
    const role =
      cleanText(line.role, 80) ||
      cleanText(findRole(line.role_slug)?.name, 80) ||
      cleanText(line.role_slug, 80);
    if (
      !role ||
      !Number.isInteger(line.headcount) ||
      line.headcount < 1 ||
      line.headcount > 10_000
    ) {
      continue;
    }
    const days =
      Number.isInteger(line.days) && line.days > 0 && line.days <= 365
        ? line.days
        : undefined;
    const hours =
      Number.isFinite(line.hours_per_shift) &&
      line.hours_per_shift > 0 &&
      line.hours_per_shift <= 24
        ? line.hours_per_shift
        : undefined;
    const shifts =
      days && hours
        ? `${days} ${days === 1 ? "day" : "days"} × ${hours} ${
            hours === 1 ? "hour" : "hours"
          } per shift`
        : undefined;
    roles.push({
      role,
      headcount: line.headcount,
      ...(shifts ? { shifts } : {}),
      ...(finiteAmount(line.estimated_total_range.low) !== undefined
        ? { estimatedLow: line.estimated_total_range.low }
        : {}),
      ...(finiteAmount(line.estimated_total_range.high) !== undefined
        ? { estimatedHigh: line.estimated_total_range.high }
        : {}),
    });
  }

  const estimateLow = finiteAmount(snapshot.estimated_total_range.low);
  const estimateHigh = finiteAmount(snapshot.estimated_total_range.high);
  const estimate =
    estimateLow !== undefined && estimateHigh !== undefined && estimateHigh >= estimateLow
      ? {
          low: estimateLow,
          high: estimateHigh,
          currency: snapshot.estimated_total_range.currency,
          basis: cleanText(snapshot.estimated_total_range.basis, 240),
        }
      : undefined;

  const overtimeLow = snapshot.overtime_adjusted_total_range
    ? finiteAmount(snapshot.overtime_adjusted_total_range.low)
    : undefined;
  const overtimeHigh = snapshot.overtime_adjusted_total_range
    ? finiteAmount(snapshot.overtime_adjusted_total_range.high)
    : undefined;
  const overtimeEstimate =
    snapshot.overtime_adjusted_total_range &&
    overtimeLow !== undefined &&
    overtimeHigh !== undefined &&
    overtimeHigh >= overtimeLow
      ? {
          low: overtimeLow,
          high: overtimeHigh,
          currency: snapshot.overtime_adjusted_total_range.currency,
          note: cleanText(snapshot.overtime_adjusted_total_range.note, 300),
        }
      : undefined;

  return {
    city:
      cityName && cityState
        ? cleanText(`${cityName}, ${cityState}`, 120)
        : cityName,
    eventDates: cleanText(snapshot.event.event_date ?? undefined, 160),
    eventType: normalizePlanEventType(snapshot.event.event_type) ?? "",
    attendees:
      snapshot.event.attendees &&
      Number.isInteger(snapshot.event.attendees) &&
      snapshot.event.attendees <= 5_000_000
        ? snapshot.event.attendees
        : undefined,
    roles,
    ...(estimate ? { estimate } : {}),
    ...(overtimeEstimate ? { overtimeEstimate } : {}),
    ...(snapshot.compliance_jurisdiction
      ? {
          complianceJurisdiction: cleanText(
            snapshot.compliance_jurisdiction,
            160,
          ),
        }
      : {}),
  };
}

function formatEventType(value: string): string {
  return EVENT_TYPE_LABELS[value] ?? "Not provided";
}

function formatMoney(
  low: number,
  high: number,
  currency: "USD" | "CAD",
): string {
  const formatter = new Intl.NumberFormat(currency === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  return `${formatter.format(low)}–${formatter.format(high)} ${currency}`;
}

function detail(value: string | number | undefined): string {
  if (typeof value === "number") return value.toLocaleString("en-US");
  return value || "Not provided";
}

export default async function RequestQuotePage({
  searchParams,
}: {
  searchParams: Promise<RequestQuoteSearchParams>;
}) {
  const params = await searchParams;
  const fallback = queryPrefill(params);
  const rawPlan = boundedParam(params.plan, 12).toUpperCase();
  const signatureParametersPresent = params.sig !== undefined || params.exp !== undefined;
  const planLinkSecret = process.env.PLAN_LINK_SECRET?.trim() ?? "";

  let planLinkState: PlanLinkState = "none";
  let planId: string | undefined;
  let snapshot: PlanSnapshot | null = null;

  if (rawPlan) {
    if (!PLAN_ID_PATTERN.test(rawPlan)) {
      planLinkState = "invalid";
    } else {
      const signatureValid = canRestorePlanLink(rawPlan, {
        signature: singleValue(params.sig)?.trim(),
        rawExpiry: singleValue(params.exp)?.trim(),
        signatureParametersPresent,
        secret: planLinkSecret,
      });

      if (!signatureValid) {
        planLinkState = "invalid";
      } else {
        try {
          snapshot = await loadPlanSnapshot(rawPlan);
        } catch {
          snapshot = null;
        }
        if (snapshot) {
          planId = rawPlan;
          planLinkState = "restored";
        } else {
          planLinkState = "unavailable";
        }
      }
    }
  } else if (signatureParametersPresent) {
    planLinkState = "invalid";
  }

  const review: SafePlanReview = snapshot
    ? safeSnapshot(snapshot)
    : {
        city: fallback.city,
        eventDates: fallback.eventDates,
        eventType: fallback.eventType,
        attendees: fallback.attendees,
        roles: fallback.roles,
      };
  const initial: QuoteFormInitial = {
    city: review.city,
    eventDates: review.eventDates,
    eventType: review.eventType,
    attendees: review.attendees,
    roles: review.roles.map(({ role, headcount, shifts }) => ({
      role,
      headcount,
      ...(shifts ? { shifts } : {}),
    })),
  };
  const attribution = sanitizeQuoteAttributionQuery(params);
  const roleOptions = ROLES.map((role) => ({
    value: role.name,
    label: role.slug,
  }));

  return (
    <main className={styles.pageShell}>
      <header className={styles.siteHeader}>
        <a className={styles.brand} href="https://tempguru.co" aria-label="TempGuru home">
          <span className={styles.brandMark} aria-hidden="true">
            TG
          </span>
          <span>TempGuru</span>
        </a>
        <span className={styles.headerTag}>W-2 event staffing</span>
      </header>

      <section className={styles.hero} aria-labelledby="page-title">
        <p className={styles.eyebrow}>Plan review · Quote request</p>
        <h1 id="page-title">Your event plan, ready for a human review.</h1>
        <p>
          Confirm the staffing details from your AI planning session, add the
          buyer information only you should provide, and send one secure request
          to TempGuru.
        </p>
      </section>

      <div className={styles.contentGrid}>
        <aside className={styles.reviewCard} aria-labelledby="plan-review-title">
          <div className={styles.reviewHeading}>
            <div>
              <p className={styles.eyebrow}>Staffing plan</p>
              <h2 id="plan-review-title">Review before submitting</h2>
            </div>
            {planLinkState === "restored" ? (
              <span className={styles.restoredBadge}>Saved plan</span>
            ) : (
              <span className={styles.prefillBadge}>Editable prefill</span>
            )}
          </div>

          {planLinkState === "restored" ? (
            <div className={styles.planNotice}>
              <span aria-hidden="true">✓</span>
              <p>
                <strong>Saved plan restored</strong>
                <span>
                  Snapshot {planId}. Saved details take priority over URL hints.
                </span>
              </p>
            </div>
          ) : null}
          {planLinkState === "invalid" ? (
            <div className={styles.planWarning} role="status">
              The saved-plan link is invalid or expired. Safe event hints were
              loaded instead; review and edit every detail before submitting.
            </div>
          ) : null}
          {planLinkState === "unavailable" ? (
            <div className={styles.planWarning} role="status">
              That saved plan is unavailable or has expired. You can still review
              the safe prefill and submit an ordinary request.
            </div>
          ) : null}

          <dl className={styles.summaryList}>
            <div>
              <dt>Market</dt>
              <dd>{detail(review.city)}</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>{detail(review.eventDates)}</dd>
            </div>
            <div>
              <dt>Event type</dt>
              <dd>{formatEventType(review.eventType)}</dd>
            </div>
            <div>
              <dt>Attendance</dt>
              <dd>{detail(review.attendees)}</dd>
            </div>
          </dl>

          <section className={styles.reviewRoles} aria-labelledby="review-roles-title">
            <div className={styles.subheading}>
              <h3 id="review-roles-title">Crew plan</h3>
              <span>
                {review.roles.length
                  ? `${review.roles.length} ${
                      review.roles.length === 1 ? "role" : "roles"
                    }`
                  : "Needs details"}
              </span>
            </div>
            {review.roles.length ? (
              <ul>
                {review.roles.map((role, index) => (
                  <li key={`${role.role}-${index}`}>
                    <span>
                      <b>{role.headcount}</b>
                      <span>×</span>
                    </span>
                    <p>
                      <strong>{role.role}</strong>
                      {role.shifts ? <small>{role.shifts}</small> : null}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.emptyRoles}>
                Add at least one staffing role in the form.
              </p>
            )}
          </section>

          {review.estimate ? (
            <section className={styles.estimate} aria-labelledby="estimate-title">
              <p id="estimate-title">Planning estimate</p>
              <strong>
                {formatMoney(
                  review.estimate.low,
                  review.estimate.high,
                  review.estimate.currency,
                )}
              </strong>
              {review.estimate.basis ? <span>{review.estimate.basis}</span> : null}
              {review.overtimeEstimate ? (
                <div>
                  <b>
                    Overtime-adjusted:{" "}
                    {formatMoney(
                      review.overtimeEstimate.low,
                      review.overtimeEstimate.high,
                      review.overtimeEstimate.currency,
                    )}
                  </b>
                  {review.overtimeEstimate.note ? (
                    <span>{review.overtimeEstimate.note}</span>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {review.complianceJurisdiction ? (
            <p className={styles.complianceNote}>
              <span aria-hidden="true">i</span>
              Compliance review: {review.complianceJurisdiction}
            </p>
          ) : null}

          <div className={styles.disclaimer}>
            <strong>What happens next</strong>
            <p>
              A TempGuru coordinator checks availability, shifts, rates, and
              compliance before sending a binding quote. This plan is an estimate,
              not a reservation.
            </p>
          </div>
        </aside>

        <QuoteRequestForm
          initial={initial}
          attribution={attribution}
          planId={planId}
          roleOptions={roleOptions}
        />
      </div>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} TempGuru</span>
        <span>W-2 staff · Workers’ comp · General liability</span>
      </footer>
    </main>
  );
}
