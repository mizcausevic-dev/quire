import { all, get } from "./db";
import { AppError } from "./errors";
import type { Actor, ListingStatus } from "./types";

export function canModerate(actor: Actor | null): boolean {
  return actor?.role === "moderator" || actor?.role === "administrator";
}

export function canAdminister(actor: Actor | null): boolean {
  return actor?.role === "administrator";
}

export type ListingGrant = {
  canEditContent: boolean;
  canViewInProvider: boolean;
  hasOrgBilling: boolean;
  isSubmitter: boolean;
  hasOwnership: boolean;
};

const EMPTY_GRANT: ListingGrant = {
  canEditContent: false,
  canViewInProvider: false,
  hasOrgBilling: false,
  isSubmitter: false,
  hasOwnership: false,
};

export function getListingGrant(actor: Actor | null, listingId: string): ListingGrant {
  if (!actor) return { ...EMPTY_GRANT };
  const listing = get<{ status: ListingStatus; submitted_by_user_id: string | null }>(
    "SELECT status, submitted_by_user_id FROM listings WHERE id = ?",
    [listingId],
  );
  if (!listing) return { ...EMPTY_GRANT };
  const ownerships = all<{ owner_type: "user" | "organization"; owner_id: string }>(
    "SELECT owner_type, owner_id FROM listing_ownerships WHERE listing_id = ?",
    [listingId],
  );
  const memberships = all<{ organization_id: string; role: "owner" | "editor" | "billing" }>(
    "SELECT organization_id, role FROM organization_memberships WHERE user_id = ?",
    [actor.id],
  );
  let hasOwnership = false;
  let hasOrgBilling = false;
  for (const ownership of ownerships) {
    if (ownership.owner_type === "user" && ownership.owner_id === actor.id) {
      hasOwnership = true;
      continue;
    }
    if (ownership.owner_type !== "organization") continue;
    const membership = memberships.find((item) => item.organization_id === ownership.owner_id);
    if (!membership) continue;
    if (membership.role === "owner" || membership.role === "editor") hasOwnership = true;
    if (membership.role === "owner" || membership.role === "billing") hasOrgBilling = true;
  }
  const isSubmitter = listing.submitted_by_user_id === actor.id;
  const unpublishedEditable = isSubmitter && (listing.status === "draft" || listing.status === "submitted" || listing.status === "rejected");
  return {
    hasOwnership,
    hasOrgBilling,
    isSubmitter,
    canEditContent: listing.status !== "archived" && (hasOwnership || unpublishedEditable),
    canViewInProvider: hasOwnership || hasOrgBilling || unpublishedEditable,
  };
}

export function assertCanEditListing(actor: Actor, listingId: string): ListingGrant {
  const grant = getListingGrant(actor, listingId);
  if (!grant.canEditContent) {
    throw new AppError("You do not have permission to edit this listing.", "forbidden");
  }
  return grant;
}
