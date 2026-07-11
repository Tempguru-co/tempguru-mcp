import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No image domains, no rewrites, pure API surface.
  reactStrictMode: true,
  // This repo is often checked out below a larger dashboard workspace with
  // its own lockfile. Make the application boundary explicit so Next 16 does
  // not infer that parent and compile unrelated middleware into this server.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
