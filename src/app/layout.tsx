// Root layout, minimal since this app has no UI surface beyond a landing page.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TempGuru MCP Server, W-2 Event Staffing Data for AI Agents",
  description:
    "MCP server and REST API for TempGuru event staffing: all-inclusive W-2 hourly rates, role catalog, city coverage across 345 US/Canada markets, lead times, and state compliance, plus the Event Staffing Rate Index and an opt-in quote request.",
  // Indexable: this subdomain is the natural ranking target for 'event staffing
  // MCP' / 'TempGuru MCP' queries and passes crawlers to /okf/, llms.txt, and the
  // OpenAPI spec. /admin sets its own noindex via src/app/admin/layout.tsx.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          padding: 0,
          background: "#0a1628",
          color: "#e6edf3",
        }}
      >
        {children}
      </body>
    </html>
  );
}
