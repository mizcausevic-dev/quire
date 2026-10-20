import type { MetadataRoute } from "next";
import { canonicalUrl } from "@/lib/seo";
import { collectSitemapPaths } from "@/lib/sitemap-data";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return collectSitemapPaths().map((entry) => ({
    url: canonicalUrl(entry.path),
    lastModified: entry.updatedAt,
  }));
}
