// Source labels can arrive through public headers/query/body fields, so never
// persist arbitrary caller strings in telemetry Redis. Known ecosystem labels
// are retained; everything else collapses to `other` (or null when absent).

export const CONTROLLED_SOURCE_TAGS = [
  "ai-agent",
  "ai-page",
  "ai-page-zh",
  "baidu-agent",
  "chatgpt-app",
  "chatgpt-gpt",
  "claude-ai",
  "claude-code",
  "claude-desktop",
  "cn-agent",
  "copilot-agent",
  "coze",
  "coze-bot",
  "custom-gpt",
  "gemini",
  "gemini-cli",
  "gemini-gem",
  "hermes",
  "kimi",
  "langchain",
  "lechat-agent",
  "llamaindex",
  "manual-test",
  "meta-ai",
  "mcp-handoff",
  "open-webui",
  "openai-codex",
  "openclaw",
  "perplexity-space",
  "pi",
  "poe-bot",
  "postman",
  "python-client",
  "skill",
  "team-demo",
  "website",
  "website-widget",
  "zhipu-agent",
] as const;

export type ControlledSourceTag = (typeof CONTROLLED_SOURCE_TAGS)[number];

const KNOWN_SOURCES = new Set<string>(CONTROLLED_SOURCE_TAGS);

const SOURCE_ALIASES = new Map([
  ["custom_gpt", "custom-gpt"],
  ["manual_test", "manual-test"],
  ["team_demo", "team-demo"],
  ["website_widget", "website-widget"],
]);

// Broader than controlled campaign/source tags: request_quote callers may
// identify any established agent runtime. Keep this separate so a valid
// platform never collapses to `other`, while arbitrary public strings still
// cannot enter Redis.
export const SOURCE_PLATFORM_TAGS = [
  ...CONTROLLED_SOURCE_TAGS,
  "openai-chatgpt",
  "openai-agents-sdk",
  "openai-mcp",
  "cursor",
  "cline",
  "windsurf",
  "perplexity",
  "qwen-ecosystem",
  "deepseek",
  "doubao",
  "mcp-client",
] as const;

export type SourcePlatformTag = (typeof SOURCE_PLATFORM_TAGS)[number];

const KNOWN_PLATFORMS = new Set<string>(SOURCE_PLATFORM_TAGS);

export const QUOTE_UTM_SOURCES = ["ai-agent"] as const;
export const QUOTE_UTM_MEDIA = ["mcp", "rest", ...SOURCE_PLATFORM_TAGS] as const;
export const QUOTE_UTM_CAMPAIGNS = ["quote-handoff"] as const;
export const QUOTE_UTM_CONTENTS = ["mcp", "rest"] as const;

const QUOTE_UTM_SOURCE_SET = new Set<string>(QUOTE_UTM_SOURCES);
const QUOTE_UTM_MEDIUM_SET = new Set<string>(QUOTE_UTM_MEDIA);
const QUOTE_UTM_CAMPAIGN_SET = new Set<string>(QUOTE_UTM_CAMPAIGNS);
const QUOTE_UTM_CONTENT_SET = new Set<string>(QUOTE_UTM_CONTENTS);

function token(value: string | undefined, max = 40): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

export function normalizeControlledSource(
  value: string | undefined,
): ControlledSourceTag | "other" | null {
  const raw = token(value);
  if (!raw) return null;
  const normalized = SOURCE_ALIASES.get(raw) ?? raw;
  return KNOWN_SOURCES.has(normalized)
    ? (normalized as ControlledSourceTag)
    : "other";
}

export function normalizeSourcePlatform(
  value: string | undefined,
): SourcePlatformTag | "other" | null {
  const raw = token(value);
  if (!raw) return null;
  const normalized = SOURCE_ALIASES.get(raw) ?? raw;
  return KNOWN_PLATFORMS.has(normalized)
    ? (normalized as SourcePlatformTag)
    : "other";
}

/** Prefer an explicit controlled surface tag, then a classified interactive
 * runtime. Unknown public source values never suppress a valid runtime. */
export function normalizeRuntimeAttributionSource(
  source: string | undefined,
  platform: string | undefined,
): SourcePlatformTag | null {
  const controlledSource = normalizeControlledSource(source);
  if (controlledSource && controlledSource !== "other") return controlledSource;
  const normalizedPlatform = normalizeSourcePlatform(platform);
  return normalizedPlatform && normalizedPlatform !== "other"
    ? normalizedPlatform
    : null;
}

// Quote-form UTM values originate in public URLs, so keep their accepted
// vocabulary deliberately closed. These helpers are shared by the page parser,
// REST schema, and CRM sanitizer; a caller cannot smuggle free text or PII into
// attribution fields by naming it like a UTM parameter.
export function normalizeQuoteUtmSource(value: string | undefined): string | null {
  const raw = token(value);
  return QUOTE_UTM_SOURCE_SET.has(raw) ? raw : null;
}

export function normalizeQuoteUtmMedium(value: string | undefined): string | null {
  const raw = token(value);
  if (!raw) return null;
  const normalized = SOURCE_ALIASES.get(raw) ?? raw;
  return QUOTE_UTM_MEDIUM_SET.has(normalized) ? normalized : null;
}

export function normalizeQuoteUtmCampaign(value: string | undefined): string | null {
  const raw = token(value);
  return QUOTE_UTM_CAMPAIGN_SET.has(raw) ? raw : null;
}

export function normalizeQuoteUtmContent(value: string | undefined): string | null {
  const raw = token(value);
  return QUOTE_UTM_CONTENT_SET.has(raw) ? raw : null;
}
