// The site's public origin (no trailing slash), used to build absolute URLs
// for metadata, the sitemap, robots.txt, and Open Graph tags. Mirrors the
// baseURL precedence in src/lib/auth.ts: Vercel's production domain, then the
// current deployment URL, then an explicit override, then localhost for dev.
export const siteUrl = (
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.BETTER_AUTH_URL || "http://localhost:3000"
).replace(/\/+$/, "");
