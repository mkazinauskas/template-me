import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables a self-contained .next/standalone build for the production Docker
  // image (see Dockerfile). Must NOT be set on Vercel — it conflicts with
  // Vercel's own build/tracing pipeline (ENOENT on next-server.js.nft.json).
  // Vercel sets the `VERCEL` env var automatically during builds.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
};

export default nextConfig;
