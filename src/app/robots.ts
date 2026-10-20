import type { MetadataRoute } from "next";
import { robotsDisallowRules } from "@/lib/seo";
import { siteOrigin } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: robotsDisallowRules() },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
