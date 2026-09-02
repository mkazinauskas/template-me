import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// The landing page is the only public, indexable route (see robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
