// User-agent classifier — buckets every inbound UA into one of ~15 categories
// so the dashboard can show a useful breakdown instead of 47 unique strings.
//
// Categories are roughly ordered by specificity. First match wins. The
// `other` bucket catches everything that doesn't fit a known agent or crawler
// pattern — useful for spotting new clients before we explicitly classify them.

export type UaClass =
  // Anthropic surfaces
  | "claude-ai"
  | "claude-code"
  | "claude-desktop"
  // OpenAI surfaces
  | "openai-chatgpt"
  | "openai-codex"
  | "openai-agents-sdk"
  // Other Western agent surfaces
  | "cursor"
  | "cline"
  | "windsurf"
  | "gemini"
  | "perplexity"
  // Chinese ecosystem agents
  | "qwen-ecosystem"
  | "deepseek"
  | "doubao"
  | "kimi"
  // Directory / scanner probes
  | "glama-probe"
  | "smithery-probe"
  | "modelscope-probe"
  | "mcp-inspector"
  // Search engine crawlers
  | "baidu-spider"
  | "yisou-spider"
  | "sogou-spider"
  | "_360-spider"
  | "bing-bot"
  | "google-bot"
  | "yandex-bot"
  | "applebot"
  | "common-crawl"
  // Scripted / unknown
  | "scripted"
  | "other";

export function classifyUserAgent(raw: string | null | undefined): UaClass {
  const ua = (raw || "").toLowerCase();
  if (!ua) return "other";

  // Anthropic
  if (/claude\.ai|anthropic-claude/.test(ua)) return "claude-ai";
  if (/claude-code/.test(ua)) return "claude-code";
  if (/claude desktop|claude-desktop/.test(ua)) return "claude-desktop";

  // OpenAI
  if (/chatgpt-user|openai-chatgpt/.test(ua)) return "openai-chatgpt";
  if (/codex/.test(ua)) return "openai-codex";
  if (/openai-agents/.test(ua)) return "openai-agents-sdk";

  // Other Western agents
  if (/cursor/.test(ua)) return "cursor";
  if (/cline/.test(ua)) return "cline";
  if (/windsurf/.test(ua)) return "windsurf";
  if (/gemini/.test(ua)) return "gemini";
  if (/perplexity/.test(ua)) return "perplexity";

  // Chinese ecosystem agents (Qwen/DashScope/ModelScope = same Alibaba stack)
  if (/qwen|dashscope|modelscope-agent/.test(ua)) return "qwen-ecosystem";
  if (/deepseek/.test(ua)) return "deepseek";
  if (/doubao|bytedance/.test(ua)) return "doubao";
  if (/kimi/.test(ua)) return "kimi";

  // Directory / scanner probes (very useful for capacity planning)
  if (/glama/.test(ua)) return "glama-probe";
  if (/smithery/.test(ua)) return "smithery-probe";
  if (/modelscope/.test(ua)) return "modelscope-probe";
  if (/mcp-inspector|mcp inspector/.test(ua)) return "mcp-inspector";

  // Search engine crawlers
  if (/baiduspider/.test(ua)) return "baidu-spider";
  if (/yisouspider/.test(ua)) return "yisou-spider";
  if (/sogou web spider/.test(ua)) return "sogou-spider";
  if (/360spider|haosouspider/.test(ua)) return "_360-spider";
  if (/bingbot|bingpreview/.test(ua)) return "bing-bot";
  if (/googlebot/.test(ua)) return "google-bot";
  if (/yandexbot/.test(ua)) return "yandex-bot";
  if (/applebot/.test(ua)) return "applebot";
  if (/ccbot|commoncrawl/.test(ua)) return "common-crawl";

  // Scripted (curl, wget, python-requests, etc.)
  if (/curl|wget|python-requests|httpx|axios|node-fetch|got/.test(ua)) {
    return "scripted";
  }

  return "other";
}
