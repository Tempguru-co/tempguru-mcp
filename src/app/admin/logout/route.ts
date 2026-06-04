import { NextResponse } from "next/server";
import { logout } from "@/lib/telemetry/auth";

export async function POST() {
  await logout();
  return NextResponse.redirect(new URL("/admin/login", "https://mcp.tempguru.co"));
}

export async function GET() {
  await logout();
  return NextResponse.redirect(new URL("/admin/login", "https://mcp.tempguru.co"));
}
