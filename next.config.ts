import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output creates a self-contained build — ideal for Render, Railway, etc.
  // Includes only necessary node_modules, so the deploy is smaller and faster.
  output: "standalone",

  // Ensure native Node.js modules are not bundled by webpack
  serverExternalPackages: ["pg"],

  // Logging config for debugging in non-production environments
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV !== "production",
    },
  },
};

export default nextConfig;
