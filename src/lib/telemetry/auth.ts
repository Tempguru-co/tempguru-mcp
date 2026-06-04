// Single-password admin auth for /admin.
//
// Megan sets ADMIN_PASSWORD in Vercel env vars (Production + Preview).
// The login form POSTs the password; we set an HTTP-only cookie that
// the layout checks on every request to /admin/*.
//
// Cookie value is a hash of the password + a server-side secret (the
// password itself), so it's not the plaintext password sitting in the
// browser. Rotating ADMIN_PASSWORD invalidates all existing sessions.

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "tg_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function hashSessionToken(password: string): string {
  // The cookie value is sha256("admin:" + password). Rotating the env var
  // invalidates all sessions automatically since the hash changes.
  return createHash("sha256").update(`admin:${password}`).digest("hex");
}

export function isAuthEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export async function isAuthenticated(): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    // Without ADMIN_PASSWORD set, the admin page is locked (403) — never
    // ship an open-to-the-world dashboard. Megan must set this env var.
    return false;
  }
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const expected = hashSessionToken(password);
  try {
    return timingSafeEqual(
      Buffer.from(token, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

export async function login(password: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  // Constant-time compare on the password itself to prevent timing attacks
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const c = await cookies();
  c.set(COOKIE_NAME, hashSessionToken(expected), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return true;
}

export async function logout(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

/**
 * Convenience helper for protected pages: redirects to /admin/login if the
 * current request isn't authenticated. Call at the top of any server
 * component under /admin/* that isn't itself /admin/login.
 *
 * Note: do NOT call this from a shared layout — that creates a redirect
 * loop when the login page is wrapped by the same layout. The layout for
 * /admin/* should just provide shared UI; gating belongs at the page level.
 */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
}
