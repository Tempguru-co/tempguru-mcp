# TempGuru MCP（中文）

> 只读 MCP 服务器，提供覆盖美国和加拿大 300+ 个城市的 W-2 活动用工数据。

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

5 个工具全部为只读，已标注 `readOnlyHint: true`。

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
| Claude.ai（网页版） | ✅ 已验证 | 5 个工具在"只读工具"列表中可见 |
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
    mcp/route.ts          # MCP 处理器（5 个工具）
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
