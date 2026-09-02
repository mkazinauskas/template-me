import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// Only the marketing landing page is meant to be indexed. Everything behind
// auth (dashboard, admin, per-user templates) and the API surface is kept
// out of search results — those pages also set `robots: { index: false }`
// in their own metadata, this is the crawl-level backstop.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/dashboard", "/templates", "/sign-in", "/sign-up"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
