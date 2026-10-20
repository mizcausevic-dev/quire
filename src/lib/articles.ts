import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import { all, get, run, withTransaction } from "./db";
import { AppError } from "./errors";
import { canModerate } from "./permissions";
import { retargetRedirect } from "./redirects";
import { assertSlug, nowIso, paragraphs, uniqueSlug } from "./text";
import type { Actor } from "./types";

export type ArticleRecord = {
  id: string;
  slug: string;
  title: string;
  dek: string;
  body: string;
  status: "draft" | "published" | "archived";
  author_label: string;
  published_at: string | null;
  indexable: number;
  updated_at: string;
  listings: Array<{ id: string; slug: string; title: string }>;
};

function load(idOrSlug: string, by: "id" | "slug"): ArticleRecord | undefined {
  const article = get<Omit<ArticleRecord, "listings">>(
    by === "id" ? "SELECT * FROM articles WHERE id = ?" : "SELECT * FROM articles WHERE slug = ?",
    [idOrSlug],
  );
  if (!article) return undefined;
  const listings = all<{ id: string; slug: string; title: string }>(
    `SELECT l.id, l.slug, r.title
     FROM article_listings al
     JOIN listings l ON l.id = al.listing_id
     JOIN listing_revisions r ON r.id = l.published_revision_id
     WHERE al.article_id = ? AND l.status = 'published'`,
    [article.id],
  );
  return { ...article, listings };
}

export function getPublicArticle(slug: string): ArticleRecord | null {
  const article = load(slug, "slug");
  if (!article || article.status !== "published") return null;
  return article;
}

export function listPublicArticles(): Array<{ slug: string; title: string; dek: string; published_at: string | null }> {
  return all("SELECT slug, title, dek, published_at FROM articles WHERE status = 'published' ORDER BY published_at DESC");
}

export function listArticles(): ArticleRecord[] {
  return all<{ id: string }>("SELECT id FROM articles ORDER BY updated_at DESC")
    .map((row) => load(row.id, "id"))
    .filter((article): article is ArticleRecord => Boolean(article));
}

export function saveArticle(actor: Actor, input: { id?: string; title: string; dek: string; body: string; listingSlugs?: string[] }): { id: string; slug: string } {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const title = input.title.trim();
  const dek = input.dek.trim();
  const body = input.body.trim();
  if (title.length < 4 || title.length > 160) throw new AppError("Article titles must be 4 to 160 characters.", "article");
  if (dek.length < 10 || dek.length > 300) throw new AppError("The dek must be 10 to 300 characters.", "article");
  if (paragraphs(body).length === 0 || body.length > 20000) throw new AppError("Write the article body.", "article");
  return withTransaction(() => {
    let id = input.id;
    let slug = "";
    if (!id) {
      id = randomUUID();
      slug = uniqueSlug(title, (candidate) => Boolean(get("SELECT id FROM articles WHERE slug = ?", [candidate])));
      const now = nowIso();
      run(
        `INSERT INTO articles (id, slug, title, dek, body, status, author_label, indexable, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', 'Quire editorial desk', 0, ?, ?)`,
        [id, slug, title, dek, body, now, now],
      );
    } else {
      const current = get<{ slug: string; status: string }>("SELECT slug, status FROM articles WHERE id = ?", [id]);
      if (!current) throw new AppError("Article not found.", "missing");
      slug = current.slug;
      run("UPDATE articles SET title = ?, dek = ?, body = ?, updated_at = ? WHERE id = ?", [title, dek, body, nowIso(), id]);
    }
    run("DELETE FROM article_listings WHERE article_id = ?", [id]);
    for (const listingSlug of input.listingSlugs ?? []) {
      const listing = get<{ id: string; status: string }>("SELECT id, status FROM listings WHERE slug = ?", [listingSlug]);
      if (!listing || listing.status !== "published") throw new AppError(`Listing ${listingSlug} is not published.`, "listing");
      run("INSERT INTO article_listings (article_id, listing_id) VALUES (?, ?)", [id, listing.id]);
    }
    audit(actor.id, "article.save", "article", id, `Saved ${title}.`);
    return { id, slug };
  });
}

export function setArticleStatus(actor: Actor, id: string, status: "draft" | "published" | "archived", nextSlug?: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const article = get<{ slug: string }>("SELECT slug FROM articles WHERE id = ?", [id]);
  if (!article) throw new AppError("Article not found.", "missing");
  let slug = article.slug;
  if (nextSlug && nextSlug !== article.slug) {
    slug = assertSlug(nextSlug);
    if (get("SELECT id FROM articles WHERE slug = ? AND id != ?", [slug, id])) throw new AppError("That article slug is already in use.", "slug");
    retargetRedirect("article", id, `/articles/${article.slug}`, `/articles/${slug}`);
  }
  const now = nowIso();
  run("UPDATE articles SET status = ?, slug = ?, indexable = ?, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?", [
    status,
    slug,
    status === "published" ? 1 : 0,
    status === "published" ? now : null,
    now,
    id,
  ]);
  audit(actor.id, "article.publish", "article", id, `Set article status to ${status}.`);
}
