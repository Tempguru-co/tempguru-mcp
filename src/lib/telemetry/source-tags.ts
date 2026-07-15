// Source labels can arrive through public headers/query/body fields, so never
// persist arbitrary caller strings in telemetry Redis. Known ecosystem labels
// are retained; everything else collapses to `other` (or null when absent).

const KNOWN_SOURCES = new Set([
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
]);

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
const KNOWN_PLATFORMS = new Set([
  ...KNOWN_SOURCES,
  "claude-code",
  "openai-chatgpt",
  "openai-codex",
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
]);

function token(value: string | undefined, max = 40): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

export function normalizeControlledSource(value: string | undefined): string | null {
  const raw = token(value);
  if (!raw) return null;
  const normalized = SOURCE_ALIASES.get(raw) ?? raw;
  return KNOWN_SOURCES.has(normalized) ? normalized : "other";
}

export function normalizeSourcePlatform(value: string | undefined): string | null {
  const raw = token(value);
  if (!raw) return null;
  const normalized = SOURCE_ALIASES.get(raw) ?? raw;
  return KNOWN_PLATFORMS.has(normalized) ? normalized : "other";
}
