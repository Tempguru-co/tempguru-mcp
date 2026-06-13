import type { Metadata } from "next";
import { isAuthEnabled } from "@/lib/telemetry/auth";

export const metadata: Metadata = {
  title: "TempGuru MCP, Telemetry",
  robots: { index: false, follow: false },
};

// Layout intentionally does NOT enforce auth, that's the page's job.
// (Putting the redirect here creates a loop because the login page itself
//  is wrapped by this layout. Page-level gating via requireAuth() avoids it.)
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAuthEnabled()) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Admin locked</h1>
        <p>
          <code>ADMIN_PASSWORD</code> is not set in this deployment&apos;s
          environment variables. Set it in Vercel → Project → Settings →
          Environment Variables (Production + Preview), then redeploy.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
