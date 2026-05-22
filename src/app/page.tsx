// Landing page for mcp.tempguru.co — shows the endpoint URL + tool list so
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
  ];

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "60px 24px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 600, marginBottom: 8 }}>
        TempGuru MCP Server
      </h1>
      <p style={{ color: "#9ab0cc", fontSize: 16, marginBottom: 32 }}>
        Read-only Model Context Protocol server for TempGuru event staffing data.
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Endpoint</h2>
        <code
          style={{
            display: "block",
            background: "#1a2332",
            padding: "12px 16px",
            borderRadius: 6,
            fontSize: 14,
            color: "#24bbea",
          }}
        >
          POST /mcp
        </code>
        <p style={{ color: "#9ab0cc", fontSize: 14, marginTop: 8 }}>
          Streamable HTTP transport, MCP spec rev 2025-03-26.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Tools</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {tools.map((t) => (
            <li
              key={t.name}
              style={{
                background: "#1a2332",
                padding: "12px 16px",
                borderRadius: 6,
                marginBottom: 8,
              }}
            >
              <code style={{ color: "#24bbea", fontSize: 14, fontWeight: 600 }}>
                {t.name}
              </code>
              <div style={{ color: "#9ab0cc", fontSize: 14, marginTop: 4 }}>
                {t.desc}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p style={{ color: "#9ab0cc", fontSize: 13 }}>
          Operated by{" "}
          <a href="https://tempguru.co" style={{ color: "#24bbea" }}>
            TempGuru
          </a>
          .
        </p>
      </section>
    </main>
  );
}
