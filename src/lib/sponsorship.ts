import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import { organizationCanSponsor } from "./billing";
import { all, get, run } from "./db";
import { AppError } from "./errors";
import { canAdminister } from "./permissions";
import { nowIso } from "./text";
import type { Actor } from "./types";

export type PlacementSurface = "homepage" | "category" | "search";

function disclosureLabel(input: string): string {
  const text = input.trim().slice(0, 80) || "Sponsored";
  return /sponsored/i.test(text) ? text : `Sponsored: ${text}`;
}

export function createPlacement(
  actor: Actor,
  input: { listingId: string; placement: PlacementSurface; startsAt: string; endsAt: string; disclosure?: string; requiresEntitlement?: boolean },
): { id: string } {
  if (!canAdminister(actor)) throw new AppError("Administrator permission required.", "forbidden");
  const listing = get<{ status: string }>("SELECT status FROM listings WHERE id = ?", [input.listingId]);
  if (!listing || listing.status !== "published") throw new AppError("Sponsor a published listing.", "state");
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new AppError("Sponsorship needs a start and a later end.", "date");
  }
  const requires = input.requiresEntitlement === false ? 0 : 1;
  const id = randomUUID();
  run(
    `INSERT INTO sponsored_placements
      (id, listing_id, placement, starts_at, ends_at, status, disclosure, requires_entitlement, created_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`,
    [id, input.listingId, input.placement, start.toISOString(), end.toISOString(), disclosureLabel(input.disclosure ?? ""), requires, actor.id, nowIso()],
  );
  audit(actor.id, "sponsorship.create", "sponsored_placement", id, `${input.placement} from ${start.toISOString()} to ${end.toISOString()}.`);
  return { id };
}

export function cancelPlacement(actor: Actor, placementId: string): void {
  if (!canAdminister(actor)) throw new AppError("Administrator permission required.", "forbidden");
  run("UPDATE sponsored_placements SET status = 'canceled' WHERE id = ?", [placementId]);
  audit(actor.id, "sponsorship.cancel", "sponsored_placement", placementId, "Canceled a sponsorship.");
}

export function placementIsLive(row: { status: string; starts_at: string; ends_at: string; requires_entitlement: number; organization_id: string | null }, now = new Date()): boolean {
  if (row.status === "canceled") return false;
  const instant = now.toISOString();
  if (row.starts_at > instant || row.ends_at <= instant) return false;
  if (row.requires_entitlement && !organizationCanSponsor(row.organization_id, now)) return false;
  return true;
}

export function livePlacementForListing(listingId: string, now = new Date()): { disclosure: string; ends_at: string; placement: string } | null {
  const rows = all<{ status: string; starts_at: string; ends_at: string; requires_entitlement: number; organization_id: string | null; disclosure: string; placement: string }>(
    `SELECT sp.status, sp.starts_at, sp.ends_at, sp.requires_entitlement, sp.disclosure, sp.placement, l.organization_id
     FROM sponsored_placements sp
     JOIN listings l ON l.id = sp.listing_id
     WHERE sp.listing_id = ?`,
    [listingId],
  );
  const live = rows.find((row) => placementIsLive(row, now));
  return live ? { disclosure: live.disclosure, ends_at: live.ends_at, placement: live.placement } : null;
}

export function listPlacements(): Array<Record<string, unknown>> {
  return all(
    `SELECT sp.*, l.slug, l.organization_id, r.title
     FROM sponsored_placements sp
     JOIN listings l ON l.id = sp.listing_id
     LEFT JOIN listing_revisions r ON r.id = l.published_revision_id
     ORDER BY sp.starts_at DESC`,
  );
}
