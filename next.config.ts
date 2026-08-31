import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables a self-contained .next/standalone build for the production Docker
  // image (see Dockerfile). Must NOT be set on Vercel — it conflicts with
  // Vercel's own build/tracing pipeline (ENOENT on next-server.js.nft.json).
  // Vercel sets the `VERCEL` env var automatically during builds.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
