// Root layout, minimal since this app has no UI surface beyond a landing page.

import type { Metadata } from "next";
import { APPROVED_CLAIMS } from "@/lib/public-facts";

export const metadata: Metadata = {
  title: "TempGuru MCP Server, W-2 Event Staffing Data for AI Agents",
  description:
    `MCP server and REST API for TempGuru event staffing in ${APPROVED_CLAIMS.markets.publicFigure}, backed by ${APPROVED_CLAIMS.events.publicFigure} and ${APPROVED_CLAIMS.completedShifts.publicFigure}. Includes W-2 rate planning, state compliance, and a non-PII buyer quote handoff. Availability is confirmed per order.`,
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
