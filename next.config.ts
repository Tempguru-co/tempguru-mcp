import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No image domains, no rewrites — pure API surface.
  reactStrictMode: true,
};

export default nextConfig;
