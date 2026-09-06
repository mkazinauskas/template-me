import { env } from "@/lib/env";

// The site's public origin (no trailing slash), used to build absolute URLs
// for metadata, the sitemap, robots.txt, and Open Graph tags. Resolved from
// the same `SITE_URL` that better-auth's `baseURL` uses (see src/lib/env.ts),
// so the two can't drift apart.
export const siteUrl = env.SITE_URL;
