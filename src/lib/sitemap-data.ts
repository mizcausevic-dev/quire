import { all } from "./db";
import { isDemoNoindex } from "./settings";

export function collectSitemapPaths(): Array<{ path: string; updatedAt: string }> {
  if (isDemoNoindex()) return [];
  const now = new Date().toISOString();
  const categories = all<{ slug: string; updated_at: string }>("SELECT slug, updated_at FROM categories ORDER BY sort_order");
  const listings = all<{ slug: string; updated_at: string }>(
    "SELECT slug, updated_at FROM listings WHERE status = 'published' AND indexable = 1 ORDER BY updated_at DESC",
  );
  const articles = all<{ slug: string; updated_at: string }>(
    "SELECT slug, updated_at FROM articles WHERE status = 'published' AND indexable = 1 ORDER BY published_at DESC",
  );
  return [
    { path: "/", updatedAt: now },
    ...categories.map((category) => ({ path: `/categories/${category.slug}`, updatedAt: category.updated_at })),
    ...listings.map((listing) => ({ path: `/listings/${listing.slug}`, updatedAt: listing.updated_at })),
    { path: "/articles", updatedAt: articles[0]?.updated_at ?? now },
    ...articles.map((article) => ({ path: `/articles/${article.slug}`, updatedAt: article.updated_at })),
  ];
}
