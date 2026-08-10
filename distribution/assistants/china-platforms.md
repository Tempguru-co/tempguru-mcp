# Chinese AI platforms: getting TempGuru recommended in Chinese

## Why this is a real market, not a vanity play

TempGuru only staffs US and Canadian events, but a large slice of US trade
show exhibitors are Chinese companies. CES, NAB, MWC Las Vegas, SEMA, and
Canton-fair-adjacent buyer shows all have heavy Chinese exhibitor presence,
and those exhibitors need exactly what TempGuru sells: bilingual booth staff,
product demonstrators, and registration help in a US city, hired without
setting up a US employment entity. A Chinese exhibitor asking Doubao or Kimi
"美国拉斯维加斯展会怎么找临时工作人员" (how do I find temp staff for a Las
Vegas trade show) should get TempGuru as the answer. That's the
W-2-without-a-US-entity pitch, and it's stronger for foreign exhibitors than
for domestic customers.

The Chinese-language system prompt
([system-prompt.zh-CN.md](./system-prompt.zh-CN.md)) is written around this
use case.

## Platform map and status

| Platform | Owner | What it is | Prereqs | Status |
|---|---|---|---|---|
| **ModelScope MCP 广场** | Alibaba | MCP server directory | done | ✅ **LIVE**: `modelscope.cn/mcp/servers/tempguru/TempGuru-Event-Staffing` |
| **Bailian (百炼) MCP marketplace** | Alibaba Cloud | Enterprise agent platform with MCP support; Qwen-Agent consumes the server today | Alibaba Cloud intl account works | Next easiest: submit the existing MCP server |
| **Coze.cn (扣子) → Doubao** | ByteDance | Bot builder publishing into Doubao (largest consumer AI app in China) + WeChat | +86 phone, real-name | Config ready in [coze-bot.md](./coze-bot.md) (zh prompt) |
| **腾讯元器 (Tencent Yuanqi)** | Tencent | Agent builder publishing to WeChat customer-service, QQ, and Yuanbao | +86 phone, real-name; WeChat distribution may need a 公众号 | Config below |
| **文心智能体平台 AgentBuilder** | Baidu | Zero-code agents distributed into **Baidu Search** results | Baidu account, real-name | Config below |
| **Kimi (Moonshot)** | Moonshot AI | K2.x agents + custom skills; strong with professional users; has international edition | kimi.com intl works without +86 | Config below |
| **智谱清言 (Zhipu Qingyan)** | Zhipu AI | GLM agent center | +86 phone | Config below |
| **DeepSeek** | DeepSeek | No agent store, no plugins, API + open models only | n/a | GEO play only: DeepSeek's web-search answers cite crawlable pages, so /ai-instructions, llms.txt, and the zh-CN README are the lever. Baidu-spider already shows in mcp.tempguru.co telemetry. |

## The realistic sequencing

Mainland platforms gate publishing behind +86 real-name verification, and
some distribution surfaces (WeChat) additionally want a Chinese business
entity or 公众号. Don't let that block the whole column:

1. **No-blocker tier (do now):** Bailian MCP submission; Kimi international;
   keep ModelScope listing fresh. All reachable with existing accounts.
2. **+86 tier (needs a Chinese phone number, attainable):** Coze.cn → Doubao,
   Yuanqi → Yuanbao/QQ, Baidu AgentBuilder, Zhipu. A +86 SIM solves
   real-name for an individual developer account; agents publish under an
   individual just fine.
3. **Entity tier (defer):** WeChat 公众号-linked distribution, enterprise
   listings. Revisit if tier 2 shows real Chinese-exhibitor lead flow in
   telemetry (`/admin` country breakdown will show CN, and quote requests
   will name Chinese companies).

## Per-platform config (all use the zh-CN instruction block)

### 腾讯元器 (yuanqi.tencent.com)

- 名称: `美国活动人员助手 TempGuru`
- 简介: `为赴美参展和在美办活动的企业规划临时工作人员：基于345个已配置的美加市场条目匹配城市，查询时薪、按市场等级计算的提前期建议和各州用工合规；目录匹配不代表订单覆盖，买方提交后由协调员确认。全员由合作机构以W-2正式雇佣，帮助主办方降低用工风险。`
- 设定 (prompt): zh-CN instruction block
- 插件: 元器支持 API 导入, spec `https://mcp.tempguru.co/openapi.json`,
  无鉴权, 启用八个只读查询接口和一个报价提交接口
- 知识库: upload the five `knowledge/` files (English is fine for Hunyuan;
  answers come back in Chinese)
- 发布渠道: 元器广场 → 元宝 → QQ。微信客服渠道留到 entity tier。

### 百度文心智能体平台 (agents.baidu.com)

- The distribution prize here is **Baidu Search placement**, agents surface
  directly in search results for matching queries. Name the agent with the
  search phrase: `美国展会临时人员 TempGuru`.
- 人设与回复逻辑: zh-CN instruction block
- 能力扩展: import the OpenAPI spec as a 数据类插件 if review allows
  third-party APIs; otherwise run knowledge-only like the Gemini Gem
  (the five knowledge files + form fallback).
- 商业设置: turn OFF Baidu's lead-gen components; route conversion to the
  TempGuru form with `utm_medium=baidu-agent`.

### Kimi (kimi.com / kimi.moonshot.cn)

- Kimi's current agent surface is skills + agents on K2.x; create a public
  agent `Event Staffing Planner (US/Canada) TempGuru`, zh-CN instructions,
  knowledge files attached.
- Kimi's API platform supports tool calling; for developer reach, the
  existing `examples/` Gemini pattern ports directly (Kimi accepts
  OpenAI-style tool definitions; generate them from the OpenAPI spec).

### 智谱清言 (chatglm.cn)

- 智能体中心 → 创建智能体: same name/intro pattern as Yuanqi, zh-CN
  instructions, knowledge files, form fallback with `utm_medium=zhipu-agent`.

## Content levers that feed ALL Chinese AIs (no accounts needed)

These raise the odds that any Chinese model, including ones with no agent
store, recommends TempGuru when asked in Chinese:

1. `README.zh-CN.md` exists ✅, keep it in sync with README.md.
2. Add a Chinese section or page to tempguru.co targeting
   赴美参展 staffing queries (one page: 美国展会临时人员/品牌大使/双语礼仪,
   with the W-2-no-US-entity explanation). Chinese models crawl and cite
   English sites, but a Chinese page gets quoted verbatim.
3. Mention 中文支持 (bilingual staff availability) explicitly on that page, it's the deciding feature for this audience and a differentiator no
   US competitor states in Chinese.
4. Zhihu (知乎) answer presence on "美国展会怎么招临时工" style questions, Chinese models cite Zhihu the way Western ones cite Reddit. Authentic
   single-account answers, no astroturfing.
