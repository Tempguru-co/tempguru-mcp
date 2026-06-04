import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isAuthenticated, isAuthEnabled } from "@/lib/telemetry/auth";

export const metadata: Metadata = {
  title: "TempGuru MCP — Telemetry",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
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

  // Skip auth check on the login page itself
  const h = await headers();
  const path = h.get("x-pathname") ?? h.get("next-url") ?? "";
  const isLoginRoute = path.includes("/admin/login");

  if (!isLoginRoute && !(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <>{children}</>;
}
