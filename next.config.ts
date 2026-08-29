import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables a self-contained .next/standalone build for the production Docker image.
  output: "standalone",
};

export default nextConfig;
