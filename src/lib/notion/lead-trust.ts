// Lead authenticity scoring for the buyer-operated REST quote-submission path.
//
// The buyer-facing REST quote endpoint is public/no-auth: a form buyer or an
// explicitly configured REST integration can submit a lead. MCP request_quote
// never calls this path. This module scores each REST submission from cheap,
// single-request signals so the CRM record carries a trust level plus the
// specific reasons, and the downstream enrichment (Frodo) can VERIFY rather
// than auto-promote anything that isn't clearly real.
//
// Design rules (learned the hard way on a real near-miss):
//   - NEVER blocks a write. It only annotates, so a real-but-unusual lead is
//     flagged for a human, never silently lost.
//   - Only UNAMBIGUOUS bots (scripted/probe/spider/crawler UAs) are hard-flagged.
//     An unrecognized UA is treated as neutral-negative (-> verify), not bot,
//     because a real lead can arrive through a weird user-agent.
//   - The reply is still the ground truth (a real buyer answers the qualifying
//     email). This layer only triages so verification effort goes where it counts.
//
// Signals (none decisive alone; combined into high/medium/low):
//   - event-date sanity: a past or implausibly-far event date is a strong
//     stale/synthetic signal (this is what would have caught the Jan-2026-in-
//     June-2026 submission in one check).
//   - caller user-agent: a recognized agent raises trust; a scanner/probe UA
//     lowers it hard; an unrecognized UA is a soft negative.
//   - email: disposable domains, domains with no MX, and placeholder/fixture
//     domains are strong signals; a corporate domain matching the company raises trust.
//   - fixture identity: Test/Acme/example.com style names and domains.

import { promises as dns } from "node:dns";
import { classifyUserAgent } from "../telemetry/classify-ua";
import { parseEventStart } from "../dates/parse-event-start";

export { parseEventStart } from "../dates/parse-event-start";

export type TrustLevel = "high" | "medium" | "low";

export interface LeadTrust {
  level: TrustLevel;
  flags: string[]; // machine-readable reason codes
  notes: string[]; // human-readable one-liners for Call Notes / Frodo
}

export interface LeadTrustSource {
  userAgent?: string;
  ipCountry?: string;
}

export interface LeadTrustInput {
  contact_name: string;
  contact_email: string;
  company: string;
  event_dates: string;
}

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "trashmail.com", "yopmail.com", "throwawaymail.com", "getnada.com", "sharklasers.com",
]);
const FREE_MAIL = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com",
  "proton.me", "protonmail.com", "gmx.com", "mail.com", "live.com", "msn.com",
]);
const FIXTURE_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "test.com", "acme.com", "email.com", "domain.com",
]);
const FIXTURE_TOKENS = ["test", "example", "acme", "foobar", "john doe", "jane doe", "jdoe", "asdf", "qwerty", "sample", "lorem"];
// Token-boundary matchers: "test" must be a standalone token, so a real company
// like "Contest Labs" or "Sampler Co" is never flagged as fixture data.
const FIXTURE_RES = FIXTURE_TOKENS.map((t) => new RegExp(`(?:^|[^a-z0-9])${t}(?:[^a-z0-9]|$)`));

// UA classes that represent a real interactive agent (a plausible buyer path).
const REAL_AGENT_UA = new Set([
  "claude-ai", "claude-code", "claude-desktop", "openai-chatgpt", "openai-codex",
  "openai-agents-sdk", "openai-mcp", "cursor", "cline", "windsurf", "gemini",
  "perplexity", "qwen-ecosystem", "deepseek", "doubao", "kimi", "mcp-client",
]);
// UA classes that are unambiguous scanners/probes/automation, never a buyer.
// NOTE: "other" (unrecognized) is deliberately NOT here, an odd-but-real lead
// can come through an unknown UA, so that is a soft signal, handled below.
const SCANNER_UA = new Set([
  "scripted", "glama-probe", "smithery-probe", "modelscope-probe", "mcp-scoring-probe",
  "mcp-inspector", "ai-crawler", "baidu-spider", "yisou-spider", "sogou-spider",
  "_360-spider", "bing-bot", "google-bot", "yandex-bot", "applebot", "common-crawl",
  "internal-test",
]);

// true = has MX, false = domain has no mail records (synthetic signal),
// null = could not check (no network / DNS error / timeout -> fail-open, no penalty).
// ENOTFOUND/ENODATA mean the lookup succeeded and the domain genuinely has no
// mail; any other error (ESERVFAIL, ETIMEOUT, offline) is "unknown", not "fake".
function resolveMxSafe(domain: string): Promise<boolean | null> {
  return Promise.race([
    dns
      .resolveMx(domain)
      .then((r) => Array.isArray(r) && r.length > 0)
      .catch((e: NodeJS.ErrnoException) =>
        e && (e.code === "ENOTFOUND" || e.code === "ENODATA") ? false : null,
      ),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
}

export async function scoreLeadTrust(input: LeadTrustInput, source: LeadTrustSource = {}): Promise<LeadTrust> {
  const flags: string[] = [];
  const notes: string[] = [];
  let strong = 0; // strong synthetic / bot signals
  let weak = 0; // softer signals
  let agentBoost = false;

  // ── Event-date sanity ──
  const start = parseEventStart(input.event_dates);
  if (!start) {
    flags.push("event-date-unparseable");
    notes.push(`Could not parse an event date from "${input.event_dates}".`);
    weak++;
  } else {
    const ageDays = (Date.now() - start.getTime()) / 86_400_000;
    if (ageDays > 3) {
      flags.push("event-date-in-past");
      notes.push(`Event date "${input.event_dates}" is in the past, a stale or synthetic signal.`);
      strong++;
    } else if (ageDays < -550) {
      flags.push("event-date-implausibly-far");
      notes.push(`Event date "${input.event_dates}" is more than 18 months out.`);
      weak++;
    }
  }

  // ── Caller user-agent ──
  const uaClass = classifyUserAgent(source.userAgent);
  if (REAL_AGENT_UA.has(uaClass)) {
    agentBoost = true;
    notes.push(`Submitted by a recognized agent (${uaClass}).`);
  } else if (SCANNER_UA.has(uaClass)) {
    flags.push(`scanner-ua:${uaClass}`);
    notes.push(`Submitted by a scanner/automation user-agent (${uaClass}), not a buyer's agent.`);
    strong++;
  } else {
    flags.push("unrecognized-ua");
    notes.push(`Submitted by an unrecognized user-agent (classified "${uaClass}"), verify the source.`);
    weak++;
  }

  // ── Email ──
  const domain = (input.contact_email.split("@")[1] ?? "").toLowerCase().trim();
  const company = input.company.toLowerCase();
  const name = input.contact_name.toLowerCase();
  if (FIXTURE_DOMAINS.has(domain)) {
    flags.push("fixture-email-domain");
    notes.push(`Email domain "${domain}" is a placeholder/fixture domain.`);
    strong++;
  } else if (DISPOSABLE_DOMAINS.has(domain)) {
    flags.push("disposable-email");
    notes.push(`Email uses a disposable domain (${domain}).`);
    strong++;
  } else if (FREE_MAIL.has(domain)) {
    flags.push("free-email-domain");
    notes.push(`Email is a free-mail domain (${domain}), common but lower-signal for B2B.`);
    weak++;
  } else if (domain) {
    // Corporate domain: does its base token relate to the company name?
    const dBase = domain.split(".")[0] ?? "";
    const cTokens = company.replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t.length >= 4);
    const matches = cTokens.some((t) => dBase.includes(t) || t.includes(dBase));
    if (cTokens.length && dBase && !matches) {
      flags.push("email-company-mismatch");
      notes.push(`Email domain "${domain}" does not obviously match company "${input.company}".`);
      weak++;
    }
  }
  if (FIXTURE_RES.some((re) => re.test(name) || re.test(company))) {
    flags.push("fixture-identity");
    notes.push(`Contact/company looks like placeholder data ("${input.contact_name}" / "${input.company}").`);
    strong++;
  }
  // MX existence (best-effort, fail-open). Skipped for fixture domains (already flagged).
  if (domain && !FIXTURE_DOMAINS.has(domain)) {
    const mx = await resolveMxSafe(domain);
    if (mx === false) {
      flags.push("email-domain-no-mx");
      notes.push(`Email domain "${domain}" has no mail (MX) records, likely undeliverable or fake.`);
      strong++;
    }
  }

  // ── Combine. High needs a recognized agent and a clean sheet; any strong
  //    signal (or three soft ones) drops it to low; everything else is medium
  //    and routes to verify-before-promote. ──
  let level: TrustLevel;
  if (strong >= 1 || weak >= 3) level = "low";
  else if (weak >= 1 || !agentBoost) level = "medium";
  else level = "high";

  return { level, flags, notes };
}

// Render the trust block that gets prepended to the Notion Call Notes, so the
// signal is the first thing a human or the enrichment agent reads on the record.
export function renderTrustBlock(trust: LeadTrust): string {
  const lines = [`LEAD TRUST: ${trust.level.toUpperCase()}`];
  if (trust.flags.length) lines.push(`  flags: ${trust.flags.join(", ")}`);
  for (const n of trust.notes) lines.push(`  - ${n}`);
  if (trust.level !== "high") {
    lines.push(`  ACTION: verify contact, company, and event are real before any outreach.`);
  }
  return lines.join("\n");
}
