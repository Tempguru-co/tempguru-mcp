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
  // Generic MCP client libraries (SDK clients with no app-specific UA)
  | "mcp-client"
  // AI training / citation crawlers (index us for model answers, not interactive)
  | "ai-crawler"
  // Plain browser UA — human in a browser, or a browser-context probe
  | "browser"
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
  // TempGuru's own smoke tests / health checks (so they don't masquerade
  // as generic scripted traffic or real agents)
  | "internal-test"
  // Scripted / unknown
  | "scripted"
  | "other";

export function classifyUserAgent(raw: string | null | undefined): UaClass {
  const ua = (raw || "").toLowerCase();
  if (!ua) return "other";

  // TempGuru's own test / health-check traffic. MUST be first so our smoke
  // tests are quarantined into their own bucket instead of polluting
  // "scripted" (curl) or real-agent buckets. Convention: any internal test
  // or health-check call sends `User-Agent: TempGuru-SmokeTest/<version>`
  // (or any UA containing "tempguru-smoketest" / "tempguru-internal").
  if (/tempguru-smoketest|tempguru-internal|tempguru-healthcheck/.test(ua)) {
    return "internal-test";
  }

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

  // AI training / citation crawlers — index the site to feed model answers.
  // These were previously all falling into "other". Note the interactive
  // user-triggered fetches (chatgpt-user, claude-user) are matched ABOVE in
  // the Anthropic/OpenAI blocks so they stay in their interactive buckets.
  if (
    /gptbot|oai-searchbot|claudebot|claude-searchbot|anthropic-ai|google-extended|googleother|applebot-extended|amazonbot|meta-externalagent|meta-externalfetcher|facebookbot|bravebot|mistralai|youbot|bytespider|diffbot|timpibot|omgili|imagesiftbot/.test(
      ua,
    )
  ) {
    return "ai-crawler";
  }

  // Generic MCP client libraries — the official SDKs and remote shims send
  // these when an app hasn't set its own UA. Distinguishes real MCP traffic
  // from random noise.
  if (
    /modelcontextprotocol|mcp-remote|mcp-client|mcp-use|@modelcontextprotocol|mcp-sdk|fastmcp|mcp\.js|eventsource/.test(
      ua,
    )
  ) {
    return "mcp-client";
  }

  // Scripted (curl, wget, python-requests, etc.)
  if (/curl|wget|python-requests|httpx|axios|node-fetch|undici|go-http-client|okhttp|got|^node\/|^node$/.test(ua)) {
    return "scripted";
  }

  // Plain browser user-agent — a human poking the endpoint, or a
  // browser-context probe (some directory scanners fetch with an Origin).
  if (/mozilla\/|applewebkit|chrome\/|safari\/|firefox\/|edge\//.test(ua)) {
    return "browser";
  }

  return "other";
}
