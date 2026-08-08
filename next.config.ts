import type { NextConfig } from "next";

// This app retains static rendering, so use Next's documented non-nonce CSP.
// React/Next and the landing/quote pages emit framework and JSON-LD inline
// scripts/styles; unsafe-inline preserves those while all external execution,
// framing, plugins, and cross-origin form posts remain blocked.
const isDevelopment = process.env.NODE_ENV === "development";
const htmlContentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const htmlSecurityHeaders = [
  ...baseSecurityHeaders,
  { key: "Content-Security-Policy", value: htmlContentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
];

const machineSecurityHeaders = [
  ...baseSecurityHeaders,
  {
    key: "Content-Security-Policy",
    value: "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This repo is often checked out below a larger dashboard workspace with
  // its own lockfile. Make the application boundary explicit so Next 16 does
  // not infer that parent and compile unrelated middleware into this server.
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      // nosniff and privacy guards apply to every Next response. Route handlers
      // add the stricter machine-response CSP for JSON/SSE themselves.
      { source: "/:path*", headers: baseSecurityHeaders },
      // All browser-rendered surfaces in this small App Router project.
      { source: "/", headers: htmlSecurityHeaders },
      { source: "/request-quote", headers: htmlSecurityHeaders },
      { source: "/admin/:path*", headers: htmlSecurityHeaders },
      // Route-handler and public-file machine surfaces. Explicit route headers
      // use the same value; these entries cover discovery/OKF/static responses.
      { source: "/api/:path*", headers: machineSecurityHeaders },
      { source: "/mcp", headers: machineSecurityHeaders },
      { source: "/openapi.json", headers: machineSecurityHeaders },
      { source: "/.well-known/:path*", headers: machineSecurityHeaders },
      { source: "/okf/:path*", headers: machineSecurityHeaders },
      { source: "/schemas/:path*", headers: machineSecurityHeaders },
      { source: "/llms.txt", headers: machineSecurityHeaders },
      { source: "/robots.txt", headers: machineSecurityHeaders },
      { source: "/sitemap.xml", headers: machineSecurityHeaders },
    ];
  },
};

export default nextConfig;
