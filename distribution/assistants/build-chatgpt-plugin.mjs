// Generates the ChatGPT plugin-directory package (Agent Plugins format) from
// the canonical sources, so the listing can never drift from the server.
//
//   node distribution/assistants/build-chatgpt-plugin.mjs          # write package
//   node distribution/assistants/build-chatgpt-plugin.mjs --zip    # also build the upload ZIP
//   node distribution/assistants/build-chatgpt-plugin.mjs --zip --no-review   # enter review info in the dashboard instead
//   node distribution/assistants/build-chatgpt-plugin.mjs --zip --name <new-name>   # brand-new listing only
//
// Output (never hand-edit; regenerate instead):
//   distribution/assistants/chatgpt-plugin/plugin.json   manifest + listing + review metadata
//   distribution/assistants/chatgpt-plugin/mcp.json      the remote streamable-HTTP server (omit with --no-mcp)
//   distribution/assistants/chatgpt-plugin/skills/       the 8 canonical skills (+ agents/openai.yaml)
//   distribution/assistants/chatgpt-plugin/assets/       square PNG icon
//   distribution/assistants/chatgpt-plugin.zip           (--zip only; gitignored)
//
// Inputs: package.json (version), content/public-facts.json (approved scale
// claims), skills/<slug>/ (portable skill copies written by
// scripts/gen-skill-digests.mjs), distribution/toolbox/logo-512.png.
//
// Format reference: https://developers.openai.com/plugins/build/plugins and
// https://developers.openai.com/plugins/deploy/submission (final-submission
// limits are stricter than package validation: displayName 30, shortDescription
// 30, developerName 80, defaultPrompt 128 x 3, skill description 1024,
// plugin-name:skill-name 64). This script enforces the stricter limits.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const outDir = join(here, "chatgpt-plugin");
const zipPath = join(here, "chatgpt-plugin.zip");
const wantZip = process.argv.includes("--zip");
// mcp.json declares the (single) remote server. OpenAI's validator requires it
// when plugin-level review.test_cases are present ("Plugin-level test_cases
// require exactly one MCP server"); the URL must stay byte-identical to the
// server already attached to the listing. --no-mcp omits it (skills-only
// package); --no-review omits the review block so review information can be
// entered in the dashboard instead.
const withMcp = !process.argv.includes("--no-mcp");
const withReview = !process.argv.includes("--no-review");

const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const publicFacts = JSON.parse(
  readFileSync(join(repoRoot, "content", "public-facts.json"), "utf8"),
);
const claims = publicFacts.approvedClaims;
const publicScale =
  `${claims.markets.publicFigure}, ${claims.events.publicFigure}, ` +
  `and ${claims.completedShifts.publicFigure}`;

// The MCP server URL must stay byte-identical to the one on file with OpenAI:
// the plugin update flow cannot change a server URL (support ticket only).
// Attribution for this surface therefore comes from the server's UA/egress
// classification (openai-chatgpt), not a ?source= query string.
const MCP_URL = "https://mcp.tempguru.co/mcp";
const MCP_SERVER_KEY = "tempguru-event-staffing"; // matches skills' dependencies.tools[].value

// OpenAI keys a plugin by this `name` and rejects an upload whose name differs
// from the existing listing ("Plugin upload name must match the existing
// plugin"). The June 2026 Apps SDK submission was converted to a plugin with a
// generated id as its name (read from the dashboard's downloadable ZIP on
// 2026-11-11). Override with --name only for a brand-new listing.
const DEFAULT_PLUGIN_NAME = "dev-6a29a4facbbc8191bf54eaf071b16b5d";
const nameArgIndex = process.argv.indexOf("--name");
const PLUGIN_NAME =
  nameArgIndex !== -1 && process.argv[nameArgIndex + 1]
    ? process.argv[nameArgIndex + 1]
    : DEFAULT_PLUGIN_NAME;
const DISPLAY_NAME = "TempGuru Event Staffing"; // <= 30 chars
const SHORT_DESCRIPTION = "W-2 event staffing, US/Canada"; // <= 30 chars
const BRAND_COLOR = "#24BBEA"; // 2.24:1 on white, 7.19:1 on #212121

const LONG_DESCRIPTION = [
  `TempGuru plans and prices temporary W-2 event staff for conventions, trade shows, festivals, concerts, sporting events, corporate events, and brand activations across ${publicScale}.`,
  "",
  "What it does inside ChatGPT:",
  "- Builds a complete staffing plan from your city, dates, roles, and headcount: configured-market match, per-role all-inclusive hourly rate ranges, estimated totals, tier-based lead-time guidance, and state compliance flags (minimum wage, weekly and daily overtime).",
  "- Answers one-off questions: what a role costs in a city, what roles are available, whether a date is inside the usual planning window, and TempGuru's published booking and procurement policies (cancellation, no-show replacement, COIs, invoicing).",
  "- Publishes the TempGuru Event Staffing Rate Index: citable W-2 bill-rate benchmarks by role and market tier.",
  "- Saves a non-contact plan for 30 days so you can resume it later or share the plan ID.",
  "- When you are ready, returns a prefilled TempGuru quote form for you to review and submit yourself. A human coordinator replies within one business day.",
  "",
  "Who it is for: event planners, exhibitors, agencies, venues, and marketing teams staffing events in the United States and Canada.",
  "",
  "Limitations: every total is a planning estimate, not a binding quote. The plugin never reserves staff, confirms availability, takes payment, or collects contact details; only your own submission of the TempGuru form creates a quote request. Rates are all-inclusive W-2 bill rates (worker pay, payroll taxes, workers' comp, general liability, coordination). Compliance summaries are operational guidance, not legal advice. Not for permanent hiring or events outside the US and Canada.",
].join("\n");

const DEFAULT_PROMPTS = [
  "Price 10 brand ambassadors for a 3-day trade show in Las Vegas",
  "Build a staffing plan and budget for a 500-person conference in Chicago",
  "What are the overtime rules for event staff in California?",
];

const CAPABILITIES = [
  "Build a priced event staffing plan from city, date, roles, and headcount",
  "Look up all-inclusive W-2 hourly rates by role and city",
  "Check tier-based lead-time guidance for an event date",
  "Summarize state wage, overtime, and compliance rules",
  "Return TempGuru's published booking and procurement policies",
  "Benchmark event staffing rates with the Rate Index",
  "Save and restore a 30-day non-contact staffing plan",
  "Prefill a TempGuru quote form for the buyer to submit",
];

const REVIEW = {
  // Exactly five positive and three negative cases are required for MCP review.
  // Shape per developers.openai.com/plugins/deploy/submission:
  // review.test_cases.positive[] / review.test_cases.negative[].
  test_cases: {
    positive: [
      {
        description: "Single-role rate lookup in one city",
        prompt: "What do brand ambassadors cost per hour in Boston?",
        tools_triggered: "get_role_pricing",
        expected_behavior:
          "Returns the all-inclusive W-2 hourly range for brand ambassadors in Boston, labels it a planning estimate, and does not promise availability.",
      },
      {
        description: "Complete staffing plan with budget",
        prompt:
          "I need 6 registration staff and 2 team leads in Chicago on 2027-03-12 for an 8-hour day. What is the budget?",
        tools_triggered: "plan_staffing",
        expected_behavior:
          "Calls plan_staffing once, presents per-role rate ranges, an estimated total clearly labeled a planning estimate, lead-time guidance, and Illinois compliance notes, and retains the returned plan_id.",
      },
      {
        description: "State compliance question",
        prompt: "What are the overtime rules for event staff in California?",
        tools_triggered: "get_compliance_by_state",
        expected_behavior:
          "Reports California's weekly and daily overtime thresholds and minimum wage from the tool, flags daily overtime for shift budgeting, and states this is operational guidance, not legal advice.",
      },
      {
        description: "Published booking policy question",
        prompt: "What are TempGuru's cancellation and payment terms?",
        tools_triggered: "get_policies",
        expected_behavior:
          "Relays only the published policies returned by the tool and preserves every confirm-with-coordinator flag instead of inventing numbers.",
      },
      {
        description: "Plan then buyer-operated quote handoff",
        prompt:
          "Plan 10 brand ambassadors for a trade show in Las Vegas on 2027-01-05 for 3 days, then I want to request a quote.",
        tools_triggered: "plan_staffing, request_quote",
        expected_behavior:
          "Presents the plan, then calls request_quote with only the saved plan_id and gives the buyer the returned form_url. It never asks for a name, email, phone, or company in chat and explains that the buyer submits the TempGuru form personally.",
      },
    ],
    negative: [
      {
        description: "Event outside the US and Canada",
        prompt: "Can you staff a wedding in Paris next June?",
      },
      {
        description: "Permanent hiring, not temporary event staffing",
        prompt: "Find me a full-time event manager to hire permanently.",
      },
      {
        description: "Asks the plugin to book, confirm, and pay",
        prompt: "Book and confirm 5 ushers for tomorrow in Dallas and charge my card now.",
      },
    ],
  },
  // Reviewer-accessible video walkthrough of the five positive cases in
  // ChatGPT (recorded 2026-11-11 against server 1.7.3). Re-record and replace
  // when tool behavior in those cases changes.
  demo_recording_url: "https://youtu.be/2MaPOQh9Khc",
  commerce: false,
  commerce_description:
    "No purchases, payments, reservations, or subscriptions. The plugin returns planning data and a prefilled quote form that the buyer submits on tempguru.co; no payment is due until the buyer approves a coordinator-issued quote.",
};

const RELEASE_NOTES =
  `Aligns the directory package with TempGuru MCP ${pkg.version}: 12 tools (ten read-only), ` +
  "plan_staffing as the first call, a non-PII request_quote handoff that returns a prefilled buyer form, " +
  "explicit save_staffing_plan / get_plan continuation, get_policies for published booking terms, " +
  "the Rate Index benchmark, and eight bundled skills.";

// ─── validation helpers ─────────────────────────────────────────────────
const problems = [];
const warnings = [];
function limit(label, value, max) {
  if (typeof value !== "string" || value.trim().length === 0) {
    problems.push(`${label}: must be a non-empty string`);
  } else if (value.length > max) {
    problems.push(`${label}: ${value.length} chars exceeds ${max}`);
  }
}
function singleLine(label, value) {
  if (/[\r\n]/.test(value)) problems.push(`${label}: must be a single line`);
}

if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(PLUGIN_NAME)) {
  // The documented format is kebab-case, but a converted legacy listing keeps
  // whatever name OpenAI assigned it, and an upload must match that name.
  warnings.push(`plugin name '${PLUGIN_NAME}' is not kebab-case; kept because an upload must match the existing listing`);
}
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  problems.push(`package.json version '${pkg.version}' is not semver`);
}
limit("interface.displayName", DISPLAY_NAME, 30);
limit("interface.shortDescription", SHORT_DESCRIPTION, 30);
singleLine("interface.shortDescription", SHORT_DESCRIPTION);
limit("interface.longDescription", LONG_DESCRIPTION, 4000);
limit("description", pkg.description, 1024);
if (DEFAULT_PROMPTS.length > 3) problems.push("defaultPrompt: at most 3 prompts");
const seenPrompts = new Set();
for (const p of DEFAULT_PROMPTS) {
  limit("defaultPrompt", p, 128);
  singleLine("defaultPrompt", p);
  if (p.includes("@")) problems.push(`defaultPrompt must not contain @mentions: ${p}`);
  const norm = p.toLowerCase().replace(/\s+/g, " ").trim();
  if (seenPrompts.has(norm)) problems.push(`defaultPrompt duplicate: ${p}`);
  seenPrompts.add(norm);
}
if (CAPABILITIES.length > 20) problems.push("capabilities: at most 20 entries");
for (const c of CAPABILITIES) {
  limit("capabilities[]", c, 120);
  singleLine("capabilities[]", c);
}
if (REVIEW.test_cases.positive.length !== 5) problems.push("review: exactly 5 positive cases required");
if (REVIEW.test_cases.negative.length !== 3) problems.push("review: exactly 3 negative cases required");
// OpenAI's overlay validator wants scalar strings here (an array is rejected
// with "Input should be a valid string").
for (const c of REVIEW.test_cases.positive) {
  for (const key of ["description", "prompt", "tools_triggered", "expected_behavior"]) {
    if (typeof c[key] !== "string" || !c[key].trim()) problems.push(`review positive case '${c.description}': ${key} must be a non-empty string`);
  }
}
for (const c of REVIEW.test_cases.negative) {
  for (const key of ["description", "prompt"]) {
    if (typeof c[key] !== "string" || !c[key].trim()) problems.push(`review negative case '${c.description}': ${key} must be a non-empty string`);
  }
}
if (REVIEW.demo_recording_url.startsWith("REPLACE_WITH")) {
  warnings.push(
    "review.demo_recording_url is a placeholder; record the walkthrough and set it before uploading the ZIP",
  );
}

// ─── skills ─────────────────────────────────────────────────────────────
const portableSkillsDir = join(repoRoot, "skills");
const skillSlugs = readdirSync(portableSkillsDir)
  .filter((name) => !name.startsWith(".") && statSync(join(portableSkillsDir, name)).isDirectory())
  .sort();
if (skillSlugs.length === 0) problems.push("skills/: no portable skills found; run npm run build:okf first");

// Trim an over-long skill description to the last sentence boundary that fits
// the final-submission limit. The canonical SKILL.md stays untouched; only the
// ChatGPT package copy is shortened, and the trim is reported so the canonical
// description can be tightened upstream when convenient.
const SKILL_DESCRIPTION_MAX = 1024;
function trimDescription(slug, description) {
  if (description.length <= SKILL_DESCRIPTION_MAX) return description;
  // Sentence split on ". " followed by a capital or quote, which leaves
  // abbreviations like "U.S. and" intact.
  const sentences = description.split(/(?<=\.)\s+(?=[A-Z"])/);
  // The closing "Not for ..." exclusion is what stops wrong-time triggering,
  // so it is kept and middle sentences are dropped instead.
  const exclusion = /^Not for /.test(sentences[sentences.length - 1] ?? "")
    ? sentences.pop()
    : null;
  const kept = [];
  let length = exclusion ? exclusion.length + 1 : 0;
  for (const sentence of sentences) {
    if (length + sentence.length + (kept.length ? 1 : 0) > SKILL_DESCRIPTION_MAX) break;
    kept.push(sentence);
    length += sentence.length + (kept.length > 1 ? 1 : 0);
  }
  if (exclusion) kept.push(exclusion);
  const trimmed = kept.join(" ");
  if (trimmed.length === 0 || trimmed.length > SKILL_DESCRIPTION_MAX) {
    problems.push(`skill ${slug}: could not trim description under ${SKILL_DESCRIPTION_MAX} chars`);
    return description;
  }
  warnings.push(
    `skill ${slug}: description trimmed from ${description.length} to ${trimmed.length} chars for the ChatGPT package (final-submission limit ${SKILL_DESCRIPTION_MAX}); tighten the canonical description in content/skills/${slug}.md to remove this`,
  );
  return trimmed;
}

// Parse the two frontmatter fields we validate and may rewrite. Skill files are
// repo-authored, so the frontmatter shape is known: `name:` scalar and
// `description:` as either a scalar or a `>-` folded block.
function parseFrontmatter(body) {
  const m = body.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const fm = m[1];
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  let description;
  const folded = fm.match(/^description:\s*>-?\s*\n((?:[ \t]+.*(?:\n|$))+)/m);
  if (folded) {
    description = folded[1]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
  } else {
    description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  }
  return { name, description, frontmatter: fm, rest: m[2] };
}

function yamlQuote(value) {
  return JSON.stringify(value); // valid YAML double-quoted scalar
}

// OpenAI limits `plugin-name:skill-name` to 64 chars. The listing's generated
// 36-char name leaves 27 for a skill name, so the three longest canonical
// skills are renamed inside this package only. The canonical skill_id values
// sent to request_quote are left untouched (the server allowlists them).
const SKILL_RENAMES = Object.freeze({
  "multi-city-activation-planner": "multi-city-activation",
  "staffing-agency-partner-growth": "agency-partner-growth",
  "staffing-plan-from-event-brief": "plan-from-event-brief",
});
const packageSkillName = (slug) => SKILL_RENAMES[slug] ?? slug;

// Rewrite cross-references to renamed skills ($mentions in default prompts and
// backticked or bare mentions in bodies) while protecting the canonical
// `skill_id` attribution value, which must stay as the server expects it.
function applySkillRenames(text) {
  let out = text;
  for (const [index, [from, to]] of Object.entries(SKILL_RENAMES).entries()) {
    const keep = `\`${from}\`, and \`skill_version\``;
    // Placeholder must not contain the name itself, or the word-boundary
    // replacement below would rewrite it and the restore would miss.
    const token = `\u0000KEEP${index}\u0000`;
    out = out.split(keep).join(token);
    out = out.replace(new RegExp(`\\$${from}\\b`, "g"), `$${to}`);
    out = out.replace(new RegExp(`\\b${from}\\b`, "g"), to);
    out = out.split(token).join(keep);
  }
  return out;
}

const skillSummaries = [];
function buildSkills() {
  const skillsOut = join(outDir, "skills");
  for (const slug of skillSlugs) {
    const srcDir = join(portableSkillsDir, slug);
    const skillMd = readFileSync(join(srcDir, "SKILL.md"), "utf8");
    const parsed = parseFrontmatter(skillMd);
    if (!parsed || !parsed.name || !parsed.description) {
      problems.push(`skill ${slug}: SKILL.md frontmatter must have name and description`);
      continue;
    }
    if (parsed.name !== slug) problems.push(`skill ${slug}: frontmatter name '${parsed.name}' differs from directory`);
    const name = packageSkillName(slug);
    if (name !== slug) warnings.push(`skill ${slug}: packaged as '${name}' to fit OpenAI's 64-char plugin:skill limit`);
    if (`${PLUGIN_NAME}:${name}`.length > 64) {
      problems.push(`skill ${slug}: '${PLUGIN_NAME}:${name}' exceeds 64 chars`);
    }
    if (parsed.rest.trim().length === 0) problems.push(`skill ${slug}: body is empty`);
    const description = applySkillRenames(trimDescription(slug, parsed.description));

    // Rewrite the frontmatter with a single-line quoted description so the
    // package validator sees exactly what we validated.
    const frontmatter =
      `name: ${name}\n` +
      `description: ${yamlQuote(description)}\n` +
      parsed.frontmatter
        .replace(/^name:\s*.+$/m, "")
        .replace(/^description:\s*>-?\s*\n(?:[ \t]+.*(?:\n|$))+/m, "")
        .replace(/^description:\s*.+$/m, "")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .join("\n");
    const rebuilt = `---\n${frontmatter.trim()}\n---\n${applySkillRenames(parsed.rest)}`;

    const destDir = join(skillsOut, name);
    mkdirSync(join(destDir, "agents"), { recursive: true });
    writeFileSync(join(destDir, "SKILL.md"), rebuilt);

    // agents/openai.yaml: keep the canonical interface block, point the MCP
    // dependency at the bundled server (same key and byte-identical URL as
    // mcp.json so ChatGPT does not register a second connector), and opt into
    // implicit invocation in both ChatGPT and Codex so the skill can trigger
    // without a $mention.
    const yamlPath = join(srcDir, "agents", "openai.yaml");
    if (existsSync(yamlPath)) {
      let yaml = applySkillRenames(readFileSync(yamlPath, "utf8"));
      yaml = yaml.replace(
        /url:\s*"https:\/\/mcp\.tempguru\.co\/mcp[^"]*"/g,
        `url: ${yamlQuote(MCP_URL)}`,
      );
      yaml = yaml.replace(/value:\s*"[^"]+"/, `value: ${yamlQuote(MCP_SERVER_KEY)}`);
      if (!/^policy:/m.test(yaml)) {
        yaml = yaml.replace(
          /^dependencies:/m,
          'policy:\n  products: ["CHAT", "CODEX"]\n  allow_implicit_invocation: true\ndependencies:',
        );
      }
      writeFileSync(join(destDir, "agents", "openai.yaml"), yaml);
    } else {
      warnings.push(`skill ${slug}: no agents/openai.yaml in skills/; ChatGPT will use SKILL.md only`);
    }
    skillSummaries.push({ slug, name, descriptionLength: description.length });
  }
}

// ─── write package ──────────────────────────────────────────────────────
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "assets"), { recursive: true });

const logoSrc = join(repoRoot, "distribution", "toolbox", "logo-512.png");
if (!existsSync(logoSrc)) problems.push(`missing icon source ${logoSrc}`);
else copyFileSync(logoSrc, join(outDir, "assets", "logo.png"));

buildSkills();

const manifest = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: PLUGIN_NAME,
  version: pkg.version,
  description: pkg.description,
  author: {
    name: "Temporary Assistance Guru, Inc. (TempGuru)",
    email: "megan@tempguru.co",
    url: "https://tempguru.co",
  },
  homepage: "https://tempguru.co/ai-agents",
  repository: "https://github.com/tempguru-co/tempguru-mcp",
  license: "MIT",
  keywords: ["event-staffing", "staffing", "brand-ambassadors", "w2", "compliance", "events"],
  extensions: {
    "com.openai": {
      interface: {
        displayName: DISPLAY_NAME,
        shortDescription: SHORT_DESCRIPTION,
        longDescription: LONG_DESCRIPTION,
        developerName: "Temporary Assistance Guru, Inc.",
        category: "Business & Operations",
        capabilities: CAPABILITIES,
        websiteURL: "https://tempguru.co/ai-agents",
        supportURL: "https://tempguru.co/contact",
        privacyPolicyURL: "https://tempguru.co/privacy-policy",
        termsOfServiceURL: "https://tempguru.co/terms-of-service",
        defaultPrompt: DEFAULT_PROMPTS,
        brandColor: BRAND_COLOR,
        brandColorDark: BRAND_COLOR,
        composerIcon: "./assets/logo.png",
        logo: "./assets/logo.png",
      },
      ...(withReview ? { review: REVIEW } : {}),
      publication: {
        // `countries` is intentionally omitted: omitting it preserves the
        // targeting already configured on the published listing.
        release_notes: RELEASE_NOTES,
      },
    },
  },
};

const mcpConfig = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  mcpServers: {
    [MCP_SERVER_KEY]: {
      type: "streamable-http",
      url: MCP_URL,
      extensions: {
        "com.openai": {
          auth: { type: "none" },
        },
      },
    },
  },
};

if (problems.length > 0) {
  console.error("ChatGPT plugin package NOT written:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

writeFileSync(join(outDir, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
if (withMcp) {
  writeFileSync(join(outDir, "mcp.json"), JSON.stringify(mcpConfig, null, 2) + "\n");
}
writeFileSync(
  join(outDir, "README.md"),
  [
    "# ChatGPT plugin package (generated)",
    "",
    "Generated by `node distribution/assistants/build-chatgpt-plugin.mjs`; never hand-edit.",
    `Version ${pkg.version}. Upload flow and listing copy: see ../chatgpt-app.md.`,
    "",
    "Before uploading: if the demo video changed, update `REVIEW.demo_recording_url`",
    "in the generator, then run the script again with `--zip` and upload",
    "`distribution/assistants/chatgpt-plugin.zip` via **Upload plugin to make changes**.",
    "",
  ].join("\n"),
);

if (wantZip) {
  rmSync(zipPath, { force: true });
  try {
    execFileSync("zip", ["-r", "-X", zipPath, "."], { cwd: outDir, stdio: "ignore" });
    console.log(`Wrote ${zipPath}`);
  } catch (error) {
    warnings.push(`could not build ZIP with the zip CLI (${error.message}); zip the folder manually`);
  }
}

console.log(
  `Wrote ChatGPT plugin package ${PLUGIN_NAME}@${pkg.version} to distribution/assistants/chatgpt-plugin/ ` +
    `(${skillSummaries.length} skills, ${withMcp ? "1 MCP server" : "no mcp.json"}, ${withReview ? "review block" : "no review block"}, longDescription ${LONG_DESCRIPTION.length} chars)`,
);
for (const w of warnings) console.warn(`WARNING: ${w}`);
