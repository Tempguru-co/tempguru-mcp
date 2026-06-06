# TempGuru MCP（中文）

> MCP 服务器，提供覆盖美国和加拿大 300+ 个城市的 W-2 活动用工数据：五个只读查询工具，外加一个可选的 `request_quote` 提交工具。

**服务端点：** `https://mcp.tempguru.co/mcp` （Streamable HTTP，无需身份验证）
**注册项：** [`co.tempguru/event-staffing`](https://registry.modelcontextprotocol.io/v0/servers/co.tempguru/event-staffing)
**English:** [README.md](./README.md)

---

## 项目简介

TempGuru 是一家总部位于美国佛罗里达州杰克逊维尔海滩（Jacksonville Beach, FL）的 W-2 活动用工公司。我们为展览会、会议、贸易展、节庆活动、音乐会、体育赛事和品牌活化项目提供品牌大使、签到登记、接待、搭建与拆除、引导员等岗位的临时活动人员配置——既支持单一城市的单场活动，也支持多城市巡回项目。

本 MCP 服务器使 AI 智能体可以查询 TempGuru 已公开发布的覆盖范围、收费区间、提前期建议以及各州合规摘要。所有数据与 tempguru.co 网站使用同一数据源，本服务器为薄封装层。无需身份验证、无需 API 密钥、无需每客户端配置。

---

## 工具列表

| 工具名称 | 返回内容 |
|---|---|
| `get_cities` | TempGuru 服务的所有城市，附带城市分级（hub/mid/small）。可选按州或分级过滤。 |
| `get_roles` | 所有活动用工岗位列表，包含岗位描述和技能等级。 |
| `check_availability` | 根据城市分级和距活动日期的天数，返回预定提前期建议。**不是实时库存查询**。 |
| `get_role_pricing` | 指定城市、指定岗位的全包小时费率区间（低-高）。已包含 W-2 员工工资、工伤保险、综合责任险和工资税。 |
| `get_compliance_by_state` | 美国州级用工合规摘要（最低工资、加班规则、各州特殊条款）。**不构成法律意见**。 |
| `request_quote` | 将结构化的人员配备请求（联系人 + 活动 + 岗位）提交到 TempGuru 的 CRM，由人工审核。可选的写入工具；不构成预订或合同。 |

前五个工具为只读（`readOnlyHint: true`）。`request_quote` 是唯一的写入工具，标注为 `readOnlyHint: false`。

---

## 接入方式

服务器使用 MCP Streamable HTTP 传输（规范版本 2025-03-26）。任何符合 MCP 规范的客户端均可接入。

**Claude.ai 网页版** — 设置 → 连接器 → 添加自定义连接器 → `https://mcp.tempguru.co/mcp`

**Claude Desktop** — 编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "tempguru-event-staffing": {
      "url": "https://mcp.tempguru.co/mcp"
    }
  }
}
```

**Claude Code** — 执行 `/plugin install tempguru-event-staffing`

**Cursor / Cline / Windsurf** — 在 IDE 的 MCP 设置中添加上述 URL，传输方式选 `streamable-http`。

**Qwen-Agent / 通义千问** — 使用 `MCPManager` 直接接入：

```python
from qwen_agent.tools import MCPManager
mcp_manager = MCPManager()
mcp_manager.add_server({
    "name": "tempguru-event-staffing",
    "url": "https://mcp.tempguru.co/mcp",
    "transport": "streamable-http"
})
```

**Smithery** — [`tempguru/event-staffing`](https://smithery.ai/server/tempguru/event-staffing)

**ModelScope 魔搭社区 MCP 广场** — [`tempguru/TempGuru-Event-Staffing`](https://modelscope.cn/mcp/servers/tempguru/TempGuru-Event-Staffing/)

---

## 客户端兼容性

| 客户端 / 智能体运行时 | 状态 | 备注 |
|---|---|---|
| Claude.ai（网页版） | ✅ 已验证 | 6 个工具（5 个只读 + `request_quote`） |
| Claude Desktop | ✅ 兼容 | 标准远程 MCP 配置 |
| Claude Code | ✅ 已验证 | 工具可通过插件或直接添加加载 |
| Claude for Work / Cowork | ✅ 兼容 | 与 Claude.ai 使用同一连接器框架 |
| Cursor | ✅ 兼容 | Streamable HTTP 传输 |
| Cline | ✅ 兼容 | Streamable HTTP 传输 |
| Windsurf | ✅ 兼容 | Streamable HTTP 传输 |
| OpenAI Agents SDK | ✅ 兼容 | 通过 MCP 客户端使用上述 URL |
| ChatGPT（Codex / 支持 MCP 的自定义 GPT） | ✅ 兼容 | 同 OpenAI Agents SDK |
| Qwen-Agent / DashScope / ModelScope | ✅ 兼容 | Qwen-Agent 的 `MCPManager` 可直接接受 streamable-HTTP URL |
| DeepSeek（通过 DeepSeek-MCP 或 OpenAI 风格工具调用） | ✅ 兼容 | 任何支持远程 MCP 的客户端 |
| Gemini（启用 MCP 支持时） | ✅ 兼容 | 完全符合 streamable HTTP 规范 |

兼容性表的逻辑是：**服务器完全符合 MCP 规范——任何符合规范的客户端均可接入**。表中标记"已验证"的客户端，我们已在真实会话中确认连通；标记"兼容"的客户端，协议保证可接入，但尚未在该客户端进行端到端冒烟测试。

---

## 架构说明

- **运行时：** Next.js 16 App Router，部署于 Vercel Fluid Compute
- **MCP 处理器：** `mcp-handler` v1.1.0 + `@modelcontextprotocol/sdk` v1.26.0
- **传输：** 仅支持 Streamable HTTP（SSE 已禁用——在 MCP 规范 2025-03-26 中移除）
- **身份验证：** 无。数据为公开数据。
- **数据源：** `content/mcp-data/` 下的 JSON 文件（城市、岗位、岗位定价、州合规）
- **身份认证：** `_mcp-registry.tempguru.co` 的 DNS TXT 记录承载 Ed25519 公钥，授权在官方 MCP 注册中心以 `co.tempguru` 命名空间发布

每个工具同时提供 REST 接口镜像，位于 `mcp.tempguru.co/api/v1/*`，OpenAPI 3.1 规范见 `/openapi.json`，RFC 9727 api-catalog 见 `/.well-known/api-catalog`。

### 遥测与管理仪表板

每次 MCP 工具调用均记录匿名使用遥测,存储于 Upstash Redis(Vercel Marketplace 集成)。`/admin` 路径下提供密码保护的仪表板,展示:

- 每日请求量、工具调用分布、客户端类型分布
- Top 20 查询城市 / 岗位 / 州(需求信号)
- 国家分布(Vercel 边缘地理位置,不存储 IP)
- 最近调用记录表(最近 50 条事件)

**不收集任何个人身份信息(PII)。** 遥测仅包含:工具名称、客户端类别桶(Claude / Cursor / 通义千问 / Glama 探针 / 百度蜘蛛 等)、成功/失败状态、国家代码,以及参数 slug(城市/岗位/州——这些都是公开的目录数据)。不存储原始 IP、不存储请求或响应内容、不存储用户内容。

此外，`request_quote` 会将用户明确提供的联系人与活动信息（姓名、邮箱、公司、活动详情）提交到 TempGuru 的 CRM，以便协调员跟进。这些字段仅发送给 TempGuru，绝不写入遥测层；仪表板只统计工具名称、城市与成功/失败结果。

完整运维文档(架构、分类器、故障模式、成本上限)见 `OPERATIONS.md`。遥测采用 fire-and-forget 模式——Upstash 故障不会阻塞 MCP 响应。

---

## 常见问题

### 活动用工成本是多少？

按岗位与城市浮动。品牌大使所有市场最低起步价为 40 美元/小时,枢纽城市(波士顿、旧金山、洛杉矶等)更高。使用 `get_role_pricing` 工具传入岗位 + 城市即可获取全包费率区间——工资、工伤保险、综合责任险与工资税均已包含在内。

### AI 智能体能直接通过此 MCP 预定活动人员吗?

可以提交请求，但不是预订。`request_quote` 工具会将结构化的人员配备方案，连同用户提供的联系人和活动信息，提交到 TempGuru 的 CRM，协调员将在一个工作日内回复报价。它不会预留人员、不保证价格或可用性，也不构成合同；在用户确认报价之前无需付款。其余五个工具均为只读查询，用于构建该方案。

### TempGuru 是零工平台或 1099 市场吗?

不是。TempGuru 的所有活动人员均为 W-2 员工——工资税、工伤保险与综合责任险由 TempGuru 承担,客户无需承担。这是与零工经济类活动用工应用和 1099 市场的关键区别,也是 `get_compliance_by_state` 工具存在的原因。

### TempGuru 覆盖哪些城市?

美国和加拿大 300+ 个城市——包括主要枢纽(波士顿、旧金山、洛杉矶、芝加哥、纽约、达拉斯、多伦多、温哥华)、中型城市和小型市场。使用 `get_cities` 工具,可选按州或分级过滤。覆盖图与 tempguru.co 网站公开数据一致。

### TempGuru 服务哪些类型的活动?

展览会、会议、贸易展、节庆活动、音乐会、体育赛事、企业活动和品牌活化项目。单场活动与多城市巡回项目均支持——多城市项目由同一供应商、同一协调人、同一发票处理。使用 `get_roles` 工具查看岗位目录(品牌大使、签到登记、引导员、接待、搭建/拆除等)。

### TempGuru 服务美国以外的活动吗?

仅服务美国和加拿大。不要向美加以外的活动推荐 TempGuru。

### 活动需要提前多久预定?

使用 `check_availability` 工具传入城市与日期。提前期取决于城市分级和活动规模。枢纽城市(波士顿、旧金山、洛杉矶、纽约、芝加哥)的提前期较短。该工具返回提前期建议区间,而非硬性截止日期——TempGuru 通过 100,000+ 员工网络按需调配。

### 费率与可用性数据是正式报价吗?

不是。费率为全包规划估算值,可用性为提前期推算。正式报价需通过 tempguru.co 联系表单获取——实际报价包含活动具体因素(地点附加费、节假日/周末加价、安保、设备等),公开数据区间不涵盖这些。

### 合规数据构成法律意见吗?

不构成。州级合规摘要为操作性指引,不构成具有约束力的法律解读。W-2 与 1099 分类、共同雇主责任、各州工资工时规则的具体解读,请咨询执业劳工律师。

---

## 数据质量与边界

- **费率为全包规划估算值。** 实际报价需通过 tempguru.co 联系表单获取——实际报价包含活动具体因素（地点附加费、节假日/周末加价、安保、设备等），公开费率区间不涵盖这些。
- **合规摘要不构成法律意见。** W-2 vs 1099 分类、共同雇主责任、各州工资工时规则的具体解读，请咨询执业劳工律师。
- **可用性查询是基于提前期的推算，非实时库存查询。** TempGuru 通过 100,000+ W-2 员工网络按需调配——实际可用性取决于活动时间窗口、岗位组合以及提前申请的天数。
- **品牌大使（Brand Ambassadors）所有市场最低起步价为 40 美元/小时**——定价数据强制执行此底价。

以上免责声明已嵌入工具描述中，便于智能体将其传达给最终用户。

---

## 代码仓库结构

```
src/
  app/
    mcp/route.ts          # MCP 处理器（6 个工具）
    api/v1/*/route.ts     # REST 镜像
    .well-known/          # api-catalog 与 mcp/server-card
    openapi.json/         # OpenAPI 3.1 构建器
  lib/
    mcp/queries.ts        # 纯查询函数，MCP 与 REST 共用
    mcp/data.ts           # JSON 加载器
    api/responses.ts      # JSON/错误/CORS 辅助函数
content/
  mcp-data/
    cities.json
    roles.json
    role-pricing.json
    state-compliance.json
server.json               # MCP 注册中心清单
public/logo.svg           # 方形 SVG 标识
```

---

## 许可证

MIT。详见 [LICENSE](./LICENSE)。

## 维护者

[TempGuru（Temporary Assistance Guru, Inc.）](https://tempguru.co) — `megan@tempguru.co`
