"use client";

import { useRef, useState, type FormEvent } from "react";
import styles from "./request-quote.module.css";

export type QuoteRolePrefill = {
  role: string;
  headcount: number;
  shifts?: string;
};

export type QuoteFormInitial = {
  city: string;
  eventDates: string;
  eventType: string;
  attendees?: number;
  roles: QuoteRolePrefill[];
};

export type QuoteAttribution = {
  source_platform?: string;
  skill_id?: string;
  skill_version?: string;
};

type EditableRole = {
  key: number;
  role: string;
  headcount: string;
  shifts: string;
};

type SubmissionState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "error"; message: string; reference?: string }
  | { kind: "success"; reference: string };

type QuoteRequestFormProps = {
  initial: QuoteFormInitial;
  attribution: QuoteAttribution;
  planId?: string;
  roleOptions: Array<{ value: string; label: string }>;
};

const TG_REFERENCE_PATTERN = /^TG-[A-HJ-NP-Z2-9]{6}$/;

function responseMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.error && typeof record.error === "object") {
    const message = (record.error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim().slice(0, 500);
    }
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim().slice(0, 500);
  }
  return null;
}

function responseReference(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const reference = (value as Record<string, unknown>).reference;
  if (typeof reference !== "string") return undefined;
  const normalized = reference.trim().toUpperCase();
  return TG_REFERENCE_PATTERN.test(normalized) ? normalized : undefined;
}

export default function QuoteRequestForm({
  initial,
  attribution,
  planId,
  roleOptions,
}: QuoteRequestFormProps) {
  const nextRoleKey = useRef(initial.roles.length);
  const [roles, setRoles] = useState<EditableRole[]>(() => {
    const prefilled = initial.roles.map((role, index) => ({
      key: index,
      role: role.role,
      headcount: String(role.headcount),
      shifts: role.shifts ?? "",
    }));
    return prefilled.length
      ? prefilled
      : [{ key: 0, role: "", headcount: "1", shifts: "" }];
  });
  const [submission, setSubmission] = useState<SubmissionState>({ kind: "idle" });

  const pending = submission.kind === "pending";

  function updateRole(
    key: number,
    field: "role" | "headcount" | "shifts",
    value: string,
  ) {
    setRoles((current) =>
      current.map((role) => (role.key === key ? { ...role, [field]: value } : role)),
    );
  }

  function addRole() {
    nextRoleKey.current += 1;
    setRoles((current) => [
      ...current,
      { key: nextRoleKey.current, role: "", headcount: "1", shifts: "" },
    ]);
  }

  function removeRole(key: number) {
    setRoles((current) => current.filter((role) => role.key !== key));
  }

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedRoles = roles.map((role) => {
      const headcount = Number(role.headcount);
      return {
        role: role.role.trim(),
        headcount,
        ...(role.shifts.trim() ? { shifts: role.shifts.trim() } : {}),
      };
    });
    const invalidRole = normalizedRoles.some(
      (role) =>
        !role.role ||
        role.role.length > 80 ||
        !Number.isInteger(role.headcount) ||
        role.headcount < 1 ||
        role.headcount > 10_000,
    );
    if (!normalizedRoles.length || invalidRole) {
      setSubmission({
        kind: "error",
        message: "Add at least one role with a headcount between 1 and 10,000.",
      });
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = (name: string) => String(formData.get(name) ?? "").trim();
    const attendeeText = text("attendees");
    const attendees = attendeeText ? Number(attendeeText) : undefined;

    if (
      attendees !== undefined &&
      (!Number.isInteger(attendees) || attendees < 1 || attendees > 5_000_000)
    ) {
      setSubmission({
        kind: "error",
        message: "Expected attendance must be a whole number between 1 and 5,000,000.",
      });
      return;
    }

    const phone = text("contact_phone");
    const venue = text("venue");
    const specialRequirements = text("special_requirements");
    const payload = {
      contact_name: text("contact_name"),
      contact_email: text("contact_email"),
      ...(phone ? { contact_phone: phone } : {}),
      company: text("company"),
      event_name: text("event_name"),
      event_type: text("event_type"),
      city: text("city"),
      event_dates: text("event_dates"),
      ...(venue ? { venue } : {}),
      ...(attendees !== undefined ? { attendees } : {}),
      roles: normalizedRoles,
      ...(specialRequirements ? { special_requirements: specialRequirements } : {}),
      ...attribution,
      ...(planId ? { plan_id: planId } : {}),
    };

    setSubmission({ kind: "pending" });

    try {
      const response = await fetch("/api/v1/quote-requests", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-tempguru-source": "mcp-handoff",
        },
        body: JSON.stringify(payload),
      });

      let responseBody: unknown = null;
      try {
        responseBody = await response.json();
      } catch {
        // A non-JSON upstream error is rendered as a generic, actionable message.
      }

      const reference = responseReference(responseBody);
      if (
        !response.ok ||
        !responseBody ||
        typeof responseBody !== "object" ||
        (responseBody as Record<string, unknown>).submitted !== true ||
        !reference
      ) {
        setSubmission({
          kind: "error",
          message:
            responseMessage(responseBody) ??
            "We could not submit the request. Please try again in a moment.",
          ...(reference ? { reference } : {}),
        });
        return;
      }

      setSubmission({ kind: "success", reference });
    } catch {
      setSubmission({
        kind: "error",
        message:
          "We could not reach TempGuru. Check your connection and try submitting again.",
      });
    }
  }

  if (submission.kind === "success") {
    return (
      <section
        className={`${styles.formCard} ${styles.successCard}`}
        aria-labelledby="quote-success-title"
        aria-live="polite"
      >
        <div className={styles.successIcon} aria-hidden="true">
          ✓
        </div>
        <p className={styles.eyebrow}>Request received</p>
        <h2 id="quote-success-title">Your staffing request is with TempGuru.</h2>
        <p className={styles.successCopy}>
          A coordinator will review the plan and follow up within one business day.
          No payment or commitment has been made.
        </p>
        <div className={styles.referenceBox}>
          <span>Your reference</span>
          <strong>{submission.reference}</strong>
        </div>
        <p className={styles.keepReference}>
          Keep this reference handy if you need to follow up about the request.
        </p>
      </section>
    );
  }

  return (
    <form
      className={styles.formCard}
      action="/api/v1/quote-requests"
      method="post"
      onSubmit={submitQuote}
      aria-busy={pending}
      aria-labelledby="quote-form-title"
    >
      <div className={styles.formHeading}>
        <p className={styles.eyebrow}>Buyer details</p>
        <h2 id="quote-form-title">Where should we send the quote?</h2>
        <p>Fields marked “Required” are needed for a coordinator to respond.</p>
      </div>

      <noscript>
        <p className={styles.errorMessage} role="alert">
          JavaScript is required to securely submit this form as JSON.
        </p>
      </noscript>

      <section className={styles.formSection} aria-labelledby="contact-section-title">
        <div className={styles.sectionHeading}>
          <span aria-hidden="true">01</span>
          <h3 id="contact-section-title">Contact</h3>
        </div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label htmlFor="contact_name">
              Contact name <span>Required</span>
            </label>
            <input
              id="contact_name"
              name="contact_name"
              type="text"
              autoComplete="name"
              maxLength={120}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="contact_email">
              Work email <span>Required</span>
            </label>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="contact_phone">Phone</label>
            <input
              id="contact_phone"
              name="contact_phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="company">
              Company or organization <span>Required</span>
            </label>
            <input
              id="company"
              name="company"
              type="text"
              autoComplete="organization"
              maxLength={160}
              required
            />
          </div>
        </div>
      </section>

      <section className={styles.formSection} aria-labelledby="event-section-title">
        <div className={styles.sectionHeading}>
          <span aria-hidden="true">02</span>
          <h3 id="event-section-title">Event</h3>
        </div>
        <div className={styles.fieldGrid}>
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label htmlFor="event_name">
              Event name <span>Required</span>
            </label>
            <input id="event_name" name="event_name" type="text" maxLength={200} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="event_type">
              Event type <span>Required</span>
            </label>
            <select
              id="event_type"
              name="event_type"
              defaultValue={initial.eventType || ""}
              required
            >
              <option value="" disabled>
                Select an event type
              </option>
              <option value="trade-show">Trade show</option>
              <option value="conference">Conference</option>
              <option value="festival">Festival</option>
              <option value="concert">Concert</option>
              <option value="sporting-event">Sporting event</option>
              <option value="corporate">Corporate event</option>
              <option value="brand-activation">Brand activation</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="city">
              Event city <span>Required</span>
            </label>
            <input
              id="city"
              name="city"
              type="text"
              autoComplete="address-level2"
              defaultValue={initial.city}
              maxLength={120}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="event_dates">
              Event dates <span>Required</span>
            </label>
            <input
              id="event_dates"
              name="event_dates"
              type="text"
              defaultValue={initial.eventDates}
              placeholder="June 15–17, 2026"
              maxLength={160}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="attendees">Expected attendance</label>
            <input
              id="attendees"
              name="attendees"
              type="number"
              inputMode="numeric"
              min={1}
              max={5_000_000}
              step={1}
              defaultValue={initial.attendees}
            />
          </div>
          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label htmlFor="venue">Venue name or address</label>
            <input
              id="venue"
              name="venue"
              type="text"
              autoComplete="street-address"
              maxLength={200}
            />
          </div>
        </div>
      </section>

      <fieldset className={styles.formSection}>
        <legend className={styles.sectionHeading}>
          <span aria-hidden="true">03</span>
          <span className={styles.legendText}>Staffing</span>
        </legend>
        <p className={styles.sectionHelp}>
          Confirm each role and headcount. Shift details are optional but help us
          respond faster.
        </p>
        <datalist id="tempguru-role-options">
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </datalist>
        <div className={styles.roleList}>
          {roles.map((role, index) => (
            <div className={styles.roleRow} key={role.key}>
              <div className={styles.roleNumber} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className={styles.roleFields}>
                <div className={styles.field}>
                  <label htmlFor={`role-${role.key}`}>
                    Role <span>Required</span>
                  </label>
                  <input
                    id={`role-${role.key}`}
                    name={`role-${role.key}`}
                    type="text"
                    list="tempguru-role-options"
                    value={role.role}
                    onChange={(event) =>
                      updateRole(role.key, "role", event.currentTarget.value)
                    }
                    maxLength={80}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`headcount-${role.key}`}>
                    Headcount <span>Required</span>
                  </label>
                  <input
                    id={`headcount-${role.key}`}
                    name={`headcount-${role.key}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10_000}
                    step={1}
                    value={role.headcount}
                    onChange={(event) =>
                      updateRole(role.key, "headcount", event.currentTarget.value)
                    }
                    required
                  />
                </div>
                <div className={`${styles.field} ${styles.shiftDetails}`}>
                  <label htmlFor={`shifts-${role.key}`}>Shift details</label>
                  <input
                    id={`shifts-${role.key}`}
                    name={`shifts-${role.key}`}
                    type="text"
                    value={role.shifts}
                    onChange={(event) =>
                      updateRole(role.key, "shifts", event.currentTarget.value)
                    }
                    placeholder="2 days × 8 hours"
                    maxLength={160}
                  />
                </div>
              </div>
              {roles.length > 1 ? (
                <button
                  className={styles.removeRole}
                  type="button"
                  onClick={() => removeRole(role.key)}
                  disabled={pending}
                  aria-label={`Remove staffing role ${index + 1}`}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {roles.length < 50 ? (
          <button
            className={styles.addRole}
            type="button"
            onClick={addRole}
            disabled={pending}
          >
            <span aria-hidden="true">+</span> Add another role
          </button>
        ) : null}
      </fieldset>

      <section className={styles.formSection} aria-labelledby="requirements-section-title">
        <div className={styles.sectionHeading}>
          <span aria-hidden="true">04</span>
          <h3 id="requirements-section-title">Anything else?</h3>
        </div>
        <div className={styles.field}>
          <label htmlFor="special_requirements">
            Additional cities or special requirements
          </label>
          <textarea
            id="special_requirements"
            name="special_requirements"
            rows={5}
            maxLength={2000}
            placeholder="Additional city/date/crew legs for a tour, attire, language skills, certifications, overnight shifts, accessibility needs…"
          />
          <p className={styles.fieldHint}>
            Please don’t include payment information or sensitive personal data.
          </p>
        </div>
      </section>

      {submission.kind === "error" ? (
        <div className={styles.errorMessage} role="alert">
          <strong>Request not sent.</strong>
          <span>{submission.message}</span>
          {submission.reference ? (
            <span>
              Reference: <b>{submission.reference}</b>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.submitArea}>
        <div>
          <strong>Ready for a human review?</strong>
          <p>
            Submitting requests a quote. It does not reserve staff, guarantee
            availability, or create a payment obligation.
          </p>
          <p className={styles.privacyNotice}>
            Your contact details are sent to TempGuru only when you press
            submit, so a coordinator can respond. See the{" "}
            <a href="https://tempguru.co/privacy-policy">privacy policy</a>.
          </p>
        </div>
        <button className={styles.submitButton} type="submit" disabled={pending}>
          {pending ? "Sending request…" : "Submit request for a quote"}
        </button>
      </div>
      <p className={styles.pendingMessage} aria-live="polite">
        {pending ? "Securely sending your request to TempGuru…" : ""}
      </p>
    </form>
  );
}
