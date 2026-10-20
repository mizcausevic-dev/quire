import { randomUUID } from "node:crypto";
import { MAX_COLLECTION_ITEMS, MAX_COLLECTIONS } from "./constants";
import { all, get, run } from "./db";
import { AppError } from "./errors";
import { nowIso, uniqueSlug } from "./text";
import type { Actor } from "./types";

export function listCollections(userId: string): Array<{ id: string; name: string; slug: string; count: number }> {
  return all(
    `SELECT c.id, c.name, c.slug, COUNT(ci.listing_id) AS count
     FROM collections c
     LEFT JOIN collection_items ci ON ci.collection_id = c.id
     WHERE c.user_id = ?
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [userId],
  );
}

export function createCollection(actor: Actor, name: string): { id: string; slug: string } {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 80) throw new AppError("Collection names must be 2 to 80 characters.", "name");
  const count = get<{ count: number }>("SELECT COUNT(*) AS count FROM collections WHERE user_id = ?", [actor.id]);
  if ((count?.count ?? 0) >= MAX_COLLECTIONS) throw new AppError("You have reached the collection limit.", "limit");
  const slug = uniqueSlug(clean, (candidate) => Boolean(get("SELECT id FROM collections WHERE user_id = ? AND slug = ?", [actor.id, candidate])));
  const id = randomUUID();
  run("INSERT INTO collections (id, user_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?)", [id, actor.id, clean, slug, nowIso()]);
  return { id, slug };
}

export function collectionForUser(actor: Actor, id: string) {
  const collection = get<{ id: string; name: string; slug: string }>("SELECT id, name, slug FROM collections WHERE id = ? AND user_id = ?", [id, actor.id]);
  if (!collection) return null;
  const items = all<{ listing_id: string; slug: string; title: string; summary: string }>(
    `SELECT l.id AS listing_id, l.slug, r.title, r.summary
     FROM collection_items ci
     JOIN listings l ON l.id = ci.listing_id AND l.status = 'published'
     JOIN listing_revisions r ON r.id = l.published_revision_id
     WHERE ci.collection_id = ?
     ORDER BY ci.created_at DESC`,
    [id],
  );
  return { ...collection, items };
}

export function addToCollection(actor: Actor, collectionId: string, listingId: string): void {
  const collection = get("SELECT id FROM collections WHERE id = ? AND user_id = ?", [collectionId, actor.id]);
  if (!collection) throw new AppError("Collection not found.", "missing");
  const listing = get<{ status: string }>("SELECT status FROM listings WHERE id = ?", [listingId]);
  if (!listing || listing.status !== "published") throw new AppError("Only published listings can be saved.", "state");
  const count = get<{ count: number }>("SELECT COUNT(*) AS count FROM collection_items WHERE collection_id = ?", [collectionId]);
  const existing = get("SELECT listing_id FROM collection_items WHERE collection_id = ? AND listing_id = ?", [collectionId, listingId]);
  if (!existing && (count?.count ?? 0) >= MAX_COLLECTION_ITEMS) throw new AppError("This collection is full.", "limit");
  if (!existing) run("INSERT INTO collection_items (collection_id, listing_id, created_at) VALUES (?, ?, ?)", [collectionId, listingId, nowIso()]);
}

export function removeFromCollection(actor: Actor, collectionId: string, listingId: string): void {
  const collection = get("SELECT id FROM collections WHERE id = ? AND user_id = ?", [collectionId, actor.id]);
  if (!collection) throw new AppError("Collection not found.", "missing");
  run("DELETE FROM collection_items WHERE collection_id = ? AND listing_id = ?", [collectionId, listingId]);
}
