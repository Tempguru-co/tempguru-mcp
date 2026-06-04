import { redirect } from "next/navigation";
import { isAuthenticated, login } from "@/lib/telemetry/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAuthenticated()) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const error = sp.error;

  async function submitLogin(formData: FormData) {
    "use server";
    const pw = String(formData.get("password") ?? "");
    const ok = await login(pw);
    if (ok) redirect("/admin");
    redirect("/admin/login?error=1");
  }

  return (
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <form
        action={submitLogin}
        style={{
          width: "100%",
          maxWidth: 360,
          padding: 32,
          borderRadius: 12,
          background: "#10243a",
          border: "1px solid #1d3a5c",
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 22, color: "#24BBEA" }}>
          TempGuru Telemetry
        </h1>
        <p style={{ margin: "0 0 24px", color: "#94a8c4", fontSize: 14 }}>
          Admin access required.
        </p>
        <label
          htmlFor="password"
          style={{ display: "block", fontSize: 13, marginBottom: 6 }}
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid #2a4a72",
            background: "#0a1628",
            color: "#e1f0fc",
            fontSize: 15,
            boxSizing: "border-box",
          }}
        />
        {error && (
          <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 8 }}>
            Incorrect password.
          </p>
        )}
        <button
          type="submit"
          style={{
            marginTop: 16,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 6,
            border: "none",
            background: "#24BBEA",
            color: "#0a1628",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
