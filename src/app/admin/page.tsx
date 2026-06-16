import { getMetrics, type DashboardMetrics } from "@/lib/telemetry/query";
import { requireAuth } from "@/lib/telemetry/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAuth();
  const sp = await searchParams;
  const days = Math.max(1, Math.min(90, parseInt(sp.days ?? "7", 10) || 7));
  const m = await getMetrics(days);

  return (
    <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <Header days={days} />
      {!m.configured ? <NotConfigured /> : <Dashboard m={m} />}
    </main>
  );
}

function Header({ days }: { days: number }) {
  const ranges = [1, 7, 30, 90];
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 24,
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: "#24BBEA" }}>
          TempGuru MCP, Telemetry
        </h1>
        <p style={{ margin: "4px 0 0", color: "#94a8c4", fontSize: 13 }}>
          mcp.tempguru.co · last {days} day{days === 1 ? "" : "s"}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {ranges.map((d) => (
          <a
            key={d}
            href={`/admin?days=${d}`}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 13,
              color: d === days ? "#0a1628" : "#94a8c4",
              background: d === days ? "#24BBEA" : "transparent",
              border: "1px solid #2a4a72",
              textDecoration: "none",
              fontWeight: d === days ? 600 : 400,
            }}
          >
            {d}d
          </a>
        ))}
        <form action="/admin/logout" method="POST">
          <button
            type="submit"
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 13,
              color: "#94a8c4",
              background: "transparent",
              border: "1px solid #2a4a72",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

function NotConfigured() {
  return (
    <Card title="Telemetry storage not connected">
      <p style={{ color: "#94a8c4" }}>
        <code>KV_REST_API_URL</code> + <code>KV_REST_API_TOKEN</code> aren&apos;t
        set in this deployment&apos;s environment. Install the Upstash
        integration from Vercel Marketplace and enable it for Production +
        Preview. After the env vars populate, the next deploy will start
        capturing telemetry.
      </p>
    </Card>
  );
}

function Dashboard({ m }: { m: DashboardMetrics }) {
  const errorRate = m.totalRequests
    ? ((m.totalErrors / m.totalRequests) * 100).toFixed(1)
    : "0.0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Top summary row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 16,
        }}
      >
        <Stat label="Total requests" value={m.totalRequests.toLocaleString()} />
        <Stat label="Errors" value={m.totalErrors.toLocaleString()} sub={`${errorRate}%`} />
        <Stat label="Unique tools used" value={String(Object.keys(m.byTool).length)} />
        <Stat label="UA classes seen" value={String(Object.keys(m.byUa).length)} />
      </div>

      {/* Daily totals */}
      {m.dailyTotals.length > 0 && (
        <Card title="Daily volume">
          <DailyChart data={m.dailyTotals} />
        </Card>
      )}

      {/* Two-column row: by tool + by UA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="By tool">
          <KeyValueTable rows={toRows(m.byTool)} />
        </Card>
        <Card title="By user-agent class">
          <KeyValueTable rows={toRows(m.byUa)} />
        </Card>
      </div>

      {/* Unclassified raw UAs, the menu for the next classifier pass */}
      <Card title="Unclassified user-agents (raw)">
        <KeyValueTable
          rows={m.unclassifiedUas.map((u) => [u.member, u.count])}
          emptyMessage="No unclassified user-agents, every UA matched a known pattern."
        />
      </Card>

      {/* Three-column row: top cities / roles / states */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        <Card title="Top cities queried">
          <KeyValueTable
            rows={m.topCities.map((c) => [c.member, c.count])}
            emptyMessage="No city-keyed tool calls yet."
          />
        </Card>
        <Card title="Top roles queried">
          <KeyValueTable
            rows={m.topRoles.map((c) => [c.member, c.count])}
            emptyMessage="No role-keyed tool calls yet."
          />
        </Card>
        <Card title="Top states queried">
          <KeyValueTable
            rows={m.topStates.map((c) => [c.member, c.count])}
            emptyMessage="No state-keyed tool calls yet."
          />
        </Card>
      </div>

      {/* Unrecognized city inputs, kept out of the demand chart above. The menu
          for spotting uncovered demand, typos worth aliasing, or junk to ignore. */}
      <Card title="Unrecognized city inputs (raw)">
        <KeyValueTable
          rows={m.unmatchedCities.map((c) => [c.member, c.count])}
          emptyMessage="No unrecognized city inputs, every city query matched a known market."
        />
      </Card>

      {/* By country */}
      {Object.keys(m.byCountry).length > 0 && (
        <Card title="By country (from Vercel edge geolocation)">
          <KeyValueTable rows={toRows(m.byCountry)} />
        </Card>
      )}

      {/* Recent activity */}
      <Card title="Recent invocations (last 50)">
        <RecentTable rows={m.recent} />
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: "#10243a",
        border: "1px solid #1d3a5c",
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "#94a8c4", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#94a8c4", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "#10243a",
        border: "1px solid #1d3a5c",
        borderRadius: 10,
        padding: 16,
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 14, color: "#24BBEA", fontWeight: 500 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function toRows(o: Record<string, number>): Array<[string, number]> {
  return Object.entries(o).sort((a, b) => b[1] - a[1]);
}

function KeyValueTable({
  rows,
  emptyMessage = "No data yet.",
}: {
  rows: Array<[string, number]>;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p style={{ color: "#94a8c4", fontSize: 13, margin: 0 }}>{emptyMessage}</p>;
  }
  const total = rows.reduce((s, [, v]) => s + v, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map(([k, v]) => {
        const pct = total ? Math.round((v / total) * 100) : 0;
        return (
          <div
            key={k}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {k}
              </span>
              <div
                style={{
                  height: 4,
                  flex: 1,
                  background: "#1d3a5c",
                  borderRadius: 2,
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: "#24BBEA",
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
            <span style={{ color: "#94a8c4", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              {pct}%
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
              {v.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DailyChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${data.length}, 1fr)`,
        gap: 4,
        alignItems: "end",
        height: 100,
      }}
    >
      {data.map((d) => {
        const h = Math.max(2, Math.round((d.count / max) * 100));
        return (
          <div
            key={d.date}
            title={`${d.date}: ${d.count.toLocaleString()} requests`}
            style={{ display: "flex", flexDirection: "column", justifyContent: "end" }}
          >
            <div
              style={{
                height: `${h}%`,
                background: "#24BBEA",
                borderRadius: "2px 2px 0 0",
                opacity: d.count > 0 ? 1 : 0.2,
              }}
            />
            <div
              style={{
                fontSize: 10,
                color: "#94a8c4",
                marginTop: 4,
                textAlign: "center",
              }}
            >
              {d.date.slice(5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentTable({ rows }: { rows: DashboardMetrics["recent"] }) {
  if (rows.length === 0) {
    return (
      <p style={{ color: "#94a8c4", fontSize: 13, margin: 0 }}>
        No invocations captured yet. Connect a client to mcp.tempguru.co/mcp to
        start populating telemetry.
      </p>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#94a8c4", textAlign: "left" }}>
            <th style={{ padding: "6px 8px" }}>Time (UTC)</th>
            <th style={{ padding: "6px 8px" }}>Tool</th>
            <th style={{ padding: "6px 8px" }}>UA class</th>
            <th style={{ padding: "6px 8px" }}>Country</th>
            <th style={{ padding: "6px 8px" }}>Status</th>
            <th style={{ padding: "6px 8px" }}>Params</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid #1d3a5c" }}>
              <td style={{ padding: "6px 8px", fontFamily: "monospace", color: "#94a8c4" }}>
                {r.ts.slice(11, 19)}
              </td>
              <td style={{ padding: "6px 8px" }}>{r.tool}</td>
              <td style={{ padding: "6px 8px" }}>{r.ua}</td>
              <td style={{ padding: "6px 8px" }}>{r.country ?? "-"}</td>
              <td
                style={{
                  padding: "6px 8px",
                  color: r.status === "success" ? "#3dd17c" : "#ff6b6b",
                }}
              >
                {r.status}
              </td>
              <td style={{ padding: "6px 8px", color: "#94a8c4" }}>
                {[r.city, r.role, r.state].filter(Boolean).join(" · ") || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
