import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use Turbopack (default in Next.js 16)
  turbopack: {},
  reactStrictMode: true,
  // Server external packages for XMTP Node SDK
  serverExternalPackages: ["@xmtp/node-sdk"],
};

export default nextConfig;
