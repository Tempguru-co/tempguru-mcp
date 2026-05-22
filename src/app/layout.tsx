// Root layout — minimal since this app has no UI surface beyond a landing page.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TempGuru MCP Server",
  description:
    "Read-only Model Context Protocol server for TempGuru event staffing data. Agent-callable tools for cities, roles, pricing, availability, and state compliance.",
  robots: { index: false, follow: false },
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
