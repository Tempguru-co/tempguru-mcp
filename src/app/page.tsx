// Landing page for mcp.tempguru.co, shows the endpoint URL + tool list so
// developers and agent operators visiting the bare domain see useful info
// instead of a 404. Never indexed (see layout metadata).

export default function Home() {
  const tools = [
    {
      name: "get_cities",
      desc: "List all cities TempGuru serves, optionally filtered by state or tier.",
    },
    {
      name: "get_roles",
      desc: "List all event staffing roles with descriptions and skill tiers.",
    },
    {
      name: "check_availability",
      desc: "Lead-time guidance for a city/date, optionally with role and headcount.",
    },
    {
      name: "get_role_pricing",
      desc: "All-inclusive hourly rate range for a specific role in a specific city.",
    },
    {
      name: "get_compliance_by_state",
      desc: "Minimum wage, overtime rules, and state-specific event-staffing compliance quirks.",
    },
    {
      name: "request_quote",
      desc: "Submit a structured staffing request to TempGuru's CRM for human review. Opt-in write tool; not a reservation or contract.",
    },
  ];

  const restEndpoints = [
    { path: "/api/v1/cities", desc: "List cities (?state=&tier=)" },
    { path: "/api/v1/roles", desc: "List staffing roles" },
    { path: "/api/v1/availability", desc: "Lead-time guidance (?city=&date=&role=&headcount=)" },
    { path: "/api/v1/pricing", desc: "Rate range per role per city (?role=&city=)" },
    { path: "/api/v1/compliance", desc: "State compliance summary (?state=)" },
    { path: "POST /api/v1/quote-requests", desc: "Submit a staffing quote request (JSON body; the one write endpoint, opt-in, no reservation, no payment)" },
    { path: "/api/v1/health", desc: "Service health probe" },
  ];

  const sectionStyle: React.CSSProperties = { marginBottom: 32 };
  const codeBlockStyle: React.CSSProperties = {
    display: "block",
    background: "#1a2332",
    padding: "12px 16px",
    borderRadius: 6,
    fontSize: 14,
    color: "#24bbea",
  };
  const cardStyle: React.CSSProperties = {
    background: "#1a2332",
    padding: "12px 16px",
    borderRadius: 6,
    marginBottom: 8,
  };
  const codeNameStyle: React.CSSProperties = { color: "#24bbea", fontSize: 14, fontWeight: 600 };
  const descStyle: React.CSSProperties = { color: "#9ab0cc", fontSize: 14, marginTop: 4 };
  const linkStyle: React.CSSProperties = { color: "#24bbea" };

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "60px 24px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 600, marginBottom: 8 }}>
        TempGuru MCP Server
      </h1>
      <p style={{ color: "#9ab0cc", fontSize: 16, marginBottom: 32 }}>
        Model Context Protocol server and public REST API for TempGuru
        event staffing data. Five read-only lookup tools plus an opt-in
        request_quote submission.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>MCP Endpoint</h2>
        <code style={codeBlockStyle}>POST /mcp</code>
        <p style={descStyle}>
          Streamable HTTP transport, MCP spec rev 2025-03-26. SSE disabled.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>MCP Tools</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {tools.map((t) => (
            <li key={t.name} style={cardStyle}>
              <code style={codeNameStyle}>{t.name}</code>
              <div style={descStyle}>{t.desc}</div>
            </li>
          ))}
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Public REST API</h2>
        <p style={{ color: "#9ab0cc", fontSize: 14, marginBottom: 12 }}>
          Same data as the MCP tools, exposed as plain HTTP for clients that
          don&apos;t speak MCP. No authentication, JSON responses, CORS open,
          1-hour public cache.
        </p>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {restEndpoints.map((e) => (
            <li key={e.path} style={cardStyle}>
              <code style={codeNameStyle}>GET {e.path}</code>
              <div style={descStyle}>{e.desc}</div>
            </li>
          ))}
        </ul>
        <p style={{ ...descStyle, marginTop: 12 }}>
          Full machine-readable spec:{" "}
          <a href="/openapi.json" style={linkStyle}>
            /openapi.json
          </a>
          {" · "}
          API catalog:{" "}
          <a href="/.well-known/api-catalog" style={linkStyle}>
            /.well-known/api-catalog
          </a>
        </p>
      </section>

      <section>
        <p style={{ color: "#9ab0cc", fontSize: 13 }}>
          Operated by{" "}
          <a href="https://tempguru.co" style={linkStyle}>
            TempGuru
          </a>
          . Docs:{" "}
          <a href="https://tempguru.co/ai" style={linkStyle}>
            tempguru.co/ai
          </a>
          .
        </p>
      </section>
    </main>
  );
}
