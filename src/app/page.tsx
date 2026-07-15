// Landing page for mcp.tempguru.co, shows the endpoint URL + tool list so
// developers and agent operators visiting the bare domain see useful info
// instead of a 404. Indexable, and carries JSON-LD (Organization / WebAPI /
// Service / Dataset) so search-grounded assistants (Gemini, Perplexity, Copilot)
// can resolve the entity and the Rate Index dataset.

// schema.org JSON-LD graph. Ties the MCP server + REST API + Rate Index to the
// TempGuru entity for knowledge-graph / AI-search grounding.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://tempguru.co/#org",
      name: "TempGuru",
      legalName: "Temporary Assistance Guru, Inc.",
      url: "https://tempguru.co",
      logo: "https://mcp.tempguru.co/logo.svg",
      description:
        "W-2 compliant temporary event staffing across 345 US and Canadian markets: brand ambassadors, registration, hospitality, ushers, crowd control, setup/breakdown, and team leads.",
      areaServed: ["US", "CA"],
      sameAs: [
        "https://github.com/Tempguru-co/tempguru-mcp",
        "https://www.npmjs.com/package/tempguru-mcp",
        "https://pypi.org/project/tempguru/",
      ],
    },
    {
      "@type": "WebAPI",
      "@id": "https://mcp.tempguru.co/#api",
      name: "TempGuru MCP Server & REST API",
      description:
        "Model Context Protocol server and REST API for event-staffing data: role catalog, all-inclusive W-2 hourly rates, city coverage, lead times, and state compliance, plus an opt-in quote request.",
      documentation: "https://tempguru.co/ai",
      provider: { "@id": "https://tempguru.co/#org" },
      termsOfService: "https://tempguru.co/ai",
    },
    {
      "@type": "Service",
      serviceType: "Event staffing",
      provider: { "@id": "https://tempguru.co/#org" },
      areaServed: ["US", "CA"],
      description:
        "All-inclusive W-2 event staffing (worker pay, payroll taxes, workers' comp, general liability, coordinator support). Brand Ambassadors floor at $40/hour.",
    },
    {
      "@type": "Dataset",
      name: "TempGuru Event Staffing Rate Index",
      description:
        "Benchmark of all-inclusive W-2 hourly bill rates by event-staffing role across measured US/Canada markets (typical + national range; Brand Ambassadors by market tier), with methodology and a citation line.",
      creator: { "@id": "https://tempguru.co/#org" },
      url: "https://tempguru.co/event-staffing-rate-index",
      isAccessibleForFree: true,
      license: "https://tempguru.co/ai",
    },
  ],
};

export default function Home() {
  const tools = [
    {
      name: "plan_staffing",
      desc: "Planner meta-tool, call first. Turns an event shape (city, date, roles + headcount) into a full plan: coverage, per-role W-2 rate math, lead-time guidance, and state compliance flags.",
    },
    {
      name: "get_plan",
      desc: "Restore a complete non-PII staffing plan saved for 30 days.",
    },
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
      name: "get_policies",
      desc: "Published booking and procurement policies, with unsupported values explicitly deferred to a coordinator.",
    },
    {
      name: "get_rate_benchmark",
      desc: "The Rate Index: a measured benchmark of all-inclusive W-2 hourly rates by role (typical + national range; Brand Ambassadors by tier), with methodology and citation line.",
    },
    {
      name: "get_quote_status",
      desc: "Check whether a TG quote request was received by the CRM or durably queued.",
    },
    {
      name: "request_quote",
      desc: "Submit a structured staffing request to TempGuru's CRM for human review. Opt-in write tool; not a reservation or contract.",
    },
  ];

  const restEndpoints = [
    { method: "GET", path: "/api/v1/cities", desc: "List cities (?state=&tier=)" },
    { method: "GET", path: "/api/v1/roles", desc: "List staffing roles" },
    { method: "GET", path: "/api/v1/availability", desc: "Lead-time guidance (?city=&date=&role=&headcount=)" },
    { method: "GET", path: "/api/v1/pricing", desc: "Rate range per role per city (?role=&city=)" },
    { method: "GET", path: "/api/v1/compliance", desc: "State compliance summary (?state=)" },
    { method: "GET", path: "/api/v1/policies", desc: "Booking and procurement policies (?topic=)" },
    { method: "GET", path: "/api/v1/plans/{id}", desc: "Restore a saved non-PII staffing plan" },
    { method: "POST", path: "/api/v1/quote-requests", desc: "Submit a staffing quote request (JSON body; the one write endpoint, opt-in, no reservation, no payment)" },
    { method: "GET", path: "/api/v1/quote-requests/{reference}", desc: "Received/queued quote-request status" },
    { method: "GET", path: "/api/v1/health", desc: "Service health probe" },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <h1 style={{ fontSize: 32, fontWeight: 600, marginBottom: 8 }}>
        TempGuru MCP Server
      </h1>
      <p style={{ color: "#9ab0cc", fontSize: 16, marginBottom: 32 }}>
        Model Context Protocol server and public REST API for TempGuru
        event staffing data. Eleven tools: ten read-only planning, lookup, policy,
        saved-plan, benchmark, and quote-status tools plus one opt-in request_quote submission.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>MCP Endpoint</h2>
        <code style={codeBlockStyle}>POST /mcp</code>
        <p style={descStyle}>
          Streamable HTTP transport, negotiates MCP protocol 2025-06-18. SSE disabled. No auth.
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
          don&apos;t speak MCP. No authentication, JSON responses, CORS open.
          The read endpoints have a 1-hour public cache; the quote endpoint
          (<code style={codeNameStyle}>POST /api/v1/quote-requests</code>) is
          no-store and rate-limited.
        </p>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {restEndpoints.map((e) => (
            <li key={e.path} style={cardStyle}>
              <code style={codeNameStyle}>{e.method} {e.path}</code>
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

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Discovery &amp; knowledge</h2>
        <p style={{ color: "#9ab0cc", fontSize: 14, marginBottom: 12 }}>
          Agent-readable surfaces for crawlers and clients that resolve a server
          without an install:
        </p>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {[
            { path: "/llms.txt", desc: "LLM-oriented summary + links" },
            { path: "/okf/index.md", desc: "Open Knowledge Format bundle (roles, rates, coverage, compliance, workflows)" },
            { path: "/.well-known/mcp.json", desc: "MCP server discovery document" },
            { path: "/.well-known/mcp/server-card.json", desc: "SEP-1649 server card" },
            { path: "/.well-known/agent-skills/index.json", desc: "Agent Skills index (SKILL.md digests)" },
            { path: "/.well-known/okf.json", desc: "OKF bundle discovery" },
            { path: "/openapi.json", desc: "OpenAPI 3.1 spec for the REST API" },
            { path: "/.well-known/security.txt", desc: "Security contact (RFC 9116)" },
          ].map((e) => (
            <li key={e.path} style={cardStyle}>
              <a href={e.path} style={codeNameStyle}>{e.path}</a>
              <div style={descStyle}>{e.desc}</div>
            </li>
          ))}
        </ul>
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
