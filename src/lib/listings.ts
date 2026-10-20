import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import { assertPublishAllowed } from "./billing";
import { all, get, run, withTransaction } from "./db";
import { AppError } from "./errors";
import { listingContentHash } from "./hash";
import { assertCurrency, isPriceModel, parseMoney, priceLabel } from "./money";
import { canModerate, getListingGrant } from "./permissions";
import { reindexListing } from "./search";
import { retargetRedirect } from "./redirects";
import { definitionsForCategory, getCategory, parseEnumOptions, type CategoryRow } from "./taxonomy";
import { assertMediaPath, assertSlug, isHttpUrl, nowIso, uniqueSlug } from "./text";
import type { Actor, CanonicalListing, ImageInput, ListingInput, ListingKind, ListingStatus, NormalizedAttribute, NormalizedPrice, PriceInput, PriceModel } from "./types";
import { getUser } from "./auth";

type ListingRow = {
  id: string;
  slug: string;
  kind: ListingKind;
  status: ListingStatus;
  organization_id: string | null;
  category_id: string;
  submitted_by_user_id: string | null;
  published_revision_id: string | null;
  external_key: string | null;
  provider_label: string | null;
  is_demo: number;
  indexable: number;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type RevisionRow = {
  id: string;
  listing_id: string;
  revision_number: number;
  title: string;
  summary: string;
  body: string;
  website: string | null;
  category_id: string;
  kind: ListingKind;
  proposed_slug: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  change_note: string;
  submitted_by_user_id: string | null;
  reviewed_by_user_id: string | null;
  review_note: string | null;
  content_hash: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

export type PublicReview = {
  id: string;
  rating: number;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  relationship: "ordinary" | "verified_customer";
  verificationNote: string | null;
};

export type PublicListing = {
  id: string;
  slug: string;
  status: "published" | "archived";
  kind: ListingKind;
  isDemo: boolean;
  indexable: boolean;
  updatedAt: string;
  title: string;
  summary: string;
  body: string;
  website: string | null;
  ownershipClaimed: boolean;
  providerName: string | null;
  providerSlug: string | null;
  categoryName: string;
  categorySlug: string;
  parentName: string | null;
  parentSlug: string | null;
  prices: Array<{ label: string; text: string; model: PriceModel; amountCents: number | null; currency: string; interval: "month" | "year" | null }>;
  attributes: Array<{ key: string; label: string; display: string }>;
  tags: Array<{ name: string; slug: string }>;
  images: ImageInput[];
  reviews: PublicReview[];
  articles: Array<{ title: string; slug: string }>;
};

type NormalizedListing = {
  canonical: CanonicalListing;
  prices: NormalizedPrice[];
  attributes: NormalizedAttribute[];
  tagIds: string[];
  images: ImageInput[];
  category: CategoryRow;
  slug: string;
  title: string;
  summary: string;
  body: string;
  website: string | null;
};

function mustListing(id: string): ListingRow {
  const row = get<ListingRow>("SELECT * FROM listings WHERE id = ?", [id]);
  if (!row) throw new AppError("Listing not found.", "missing");
  return row;
}

function mustRevision(id: string): RevisionRow {
  const row = get<RevisionRow>("SELECT * FROM listing_revisions WHERE id = ?", [id]);
  if (!row) throw new AppError("Revision not found.", "missing");
  return row;
}

export function getRevision(id: string): RevisionRow | undefined {
  return get<RevisionRow>("SELECT * FROM listing_revisions WHERE id = ?", [id]);
}

export function listRevisions(listingId: string): RevisionRow[] {
  return all<RevisionRow>("SELECT * FROM listing_revisions WHERE listing_id = ? ORDER BY revision_number DESC", [listingId]);
}

function slugTaken(slug: string, exceptListingId?: string): boolean {
  const row = get<{ id: string }>("SELECT id FROM listings WHERE slug = ?", [slug]);
  return Boolean(row && row.id !== exceptListingId);
}

function normalizePrices(prices: PriceInput[], mode: "draft" | "submit"): NormalizedPrice[] {
  const normalized: NormalizedPrice[] = [];
  const errors: string[] = [];
  for (const price of prices.slice(0, 12)) {
    if (!isPriceModel(price.model)) {
      errors.push("Unknown price model.");
      continue;
    }
    const label = price.label.trim() || "Price";
    let amount: number | null = null;
    try {
      amount = parseMoney(price.amount || "");
      const currency = assertCurrency(price.currency || "USD");
      const interval = price.interval === "month" || price.interval === "year" ? price.interval : null;
      if ((price.model === "free" || price.model === "contact") && amount !== null) errors.push(`${label} should not include an amount.`);
      if ((price.model === "one_time" || price.model === "usage" || price.model === "subscription") && amount === null && mode === "submit") {
        errors.push(`${label} needs an amount.`);
      }
      if (price.model === "subscription" && !interval && mode === "submit") errors.push(`${label} needs a billing interval.`);
      normalized.push({ label: label.slice(0, 80), model: price.model, amountCents: amount, currency, interval: price.model === "subscription" ? interval : null, notes: price.notes.trim().slice(0, 300) });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid price.");
    }
  }
  if (mode === "submit" && normalized.length === 0) errors.push("Add at least one price, even if the product is free.");
  if (errors.length) throw new AppError(errors.join(" "), "price");
  return normalized;
}

function normalizeAttributes(categoryId: string, raw: Record<string, string>, mode: "draft" | "submit"): NormalizedAttribute[] {
  const definitions = definitionsForCategory(categoryId);
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const errors: string[] = [];
  const values: NormalizedAttribute[] = [];
  for (const [key, input] of Object.entries(raw)) {
    const trimmed = input.trim();
    if (!trimmed) continue;
    const definition = byKey.get(key);
    if (!definition) {
      errors.push(`Unknown attribute ${key}.`);
      continue;
    }
    if (definition.value_type === "boolean") {
      const token = trimmed.toLowerCase();
      if (!["true", "false", "yes", "no", "1", "0"].includes(token)) errors.push(`${definition.label} must be yes or no.`);
      else values.push({ definitionId: definition.id, key, valueText: null, valueNumber: null, valueBoolean: ["true", "yes", "1"].includes(token) ? 1 : 0 });
    } else if (definition.value_type === "number") {
      const number = Number(trimmed);
      if (!Number.isFinite(number)) errors.push(`${definition.label} must be a number.`);
      else values.push({ definitionId: definition.id, key, valueText: null, valueNumber: number, valueBoolean: null });
    } else if (definition.value_type === "enum") {
      const options = parseEnumOptions(definition.enum_options);
      if (!options.includes(trimmed)) errors.push(`${definition.label} must be one of: ${options.join(", ")}.`);
      else values.push({ definitionId: definition.id, key, valueText: trimmed, valueNumber: null, valueBoolean: null });
    } else if (definition.value_type === "url") {
      if (!isHttpUrl(trimmed)) errors.push(`${definition.label} must be an http or https URL.`);
      else values.push({ definitionId: definition.id, key, valueText: trimmed, valueNumber: null, valueBoolean: null });
    } else {
      if (trimmed.length > (definition.value_type === "long_text" ? 4000 : 400)) errors.push(`${definition.label} is too long.`);
      else values.push({ definitionId: definition.id, key, valueText: trimmed, valueNumber: null, valueBoolean: null });
    }
  }
  if (mode === "submit") {
    for (const definition of definitions) {
      if (definition.required && !values.some((value) => value.definitionId === definition.id)) errors.push(`${definition.label} is required.`);
    }
  }
  if (errors.length) throw new AppError(errors.join(" "), "attributes");
  return values;
}

function normalizeListing(input: ListingInput, mode: "draft" | "submit", exceptListingId?: string): NormalizedListing {
  const errors: string[] = [];
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 140) errors.push("Title must be 2 to 140 characters.");
  const summary = input.summary.trim();
  if (mode === "submit" && (summary.length < 20 || summary.length > 400)) errors.push("Summary must be 20 to 400 characters.");
  if (summary.length > 400) errors.push("Summary must be 400 characters or fewer.");
  const body = input.body.trim();
  if (body.length > 12000) errors.push("Body must be 12,000 characters or fewer.");
  const website = input.website.trim();
  if (website && !isHttpUrl(website)) errors.push("Website must start with http:// or https://.");
  const category = getCategory(input.categoryId);
  if (!category) errors.push("Choose a category.");
  if (category && category.kind !== input.kind) errors.push("The listing kind must match the category.");
  if (errors.length || !category) throw new AppError(errors.join(" ") || "Listing is incomplete.", "listing");
  const prices = normalizePrices(input.prices, mode);
  const attributes = normalizeAttributes(category.id, input.attributes, mode);
  const tagSlugs = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  const tagIds: string[] = [];
  for (const slug of tagSlugs) {
    const tag = get<{ id: string }>("SELECT id FROM tags WHERE slug = ?", [slug]);
    if (!tag) errors.push(`Unknown tag ${slug}.`);
    else tagIds.push(tag.id);
  }
  const images = input.images.slice(0, 8).map((image) => ({
    kind: image.kind === "logo" ? "logo" as const : "screenshot" as const,
    path: assertMediaPath(image.path),
    alt: image.alt.trim(),
  }));
  if (images.some((image) => image.alt.length < 2 || image.alt.length > 140)) errors.push("Image alt text must be 2 to 140 characters.");
  const slug = input.proposedSlug ? assertSlug(input.proposedSlug) : uniqueSlug(title, (candidate) => slugTaken(candidate, exceptListingId));
  if (input.proposedSlug && slugTaken(slug, exceptListingId)) errors.push("That slug is already in use.");
  if (errors.length) throw new AppError(errors.join(" "), "listing");
  const canonical: CanonicalListing = {
    title,
    summary,
    body,
    website: website || null,
    kind: input.kind,
    categorySlug: category.slug,
    prices: [...prices].sort((a, b) => `${a.label}${a.model}${a.amountCents ?? ""}`.localeCompare(`${b.label}${b.model}${b.amountCents ?? ""}`)),
    tags: [...tagSlugs].sort(),
    attributes: attributes
      .map((attribute) => ({
        key: attribute.key,
        value: attribute.valueText ?? (attribute.valueNumber !== null ? String(attribute.valueNumber) : attribute.valueBoolean ? "true" : "false"),
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
  return { canonical, prices, attributes, tagIds, images, category, slug, title, summary, body, website: website || null };
}

function replaceChildren(revisionId: string, normalized: NormalizedListing): void {
  run("DELETE FROM listing_prices WHERE revision_id = ?", [revisionId]);
  run("DELETE FROM listing_attribute_values WHERE revision_id = ?", [revisionId]);
  run("DELETE FROM listing_tags WHERE revision_id = ?", [revisionId]);
  run("DELETE FROM listing_images WHERE revision_id = ?", [revisionId]);
  normalized.prices.forEach((price, index) => {
    run(
      `INSERT INTO listing_prices (id, revision_id, label, model, amount_cents, currency, billing_interval, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), revisionId, price.label, price.model, price.amountCents, price.currency, price.interval, price.notes, index],
    );
  });
  for (const attribute of normalized.attributes) {
    run(
      `INSERT INTO listing_attribute_values (id, revision_id, definition_id, value_text, value_number, value_boolean)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), revisionId, attribute.definitionId, attribute.valueText, attribute.valueNumber, attribute.valueBoolean],
    );
  }
  for (const tagId of normalized.tagIds) run("INSERT INTO listing_tags (revision_id, tag_id) VALUES (?, ?)", [revisionId, tagId]);
  normalized.images.forEach((image, index) => {
    run("INSERT INTO listing_images (id, revision_id, kind, path, alt, sort_order) VALUES (?, ?, ?, ?, ?, ?)", [
      randomUUID(),
      revisionId,
      image.kind,
      image.path,
      image.alt,
      index,
    ]);
  });
}

function writeRevision(listingId: string, number: number, normalized: NormalizedListing, status: RevisionRow["status"], actorId: string, changeNote: string): string {
  const id = randomUUID();
  const now = nowIso();
  run(
    `INSERT INTO listing_revisions
      (id, listing_id, revision_number, title, summary, body, website, category_id, kind, proposed_slug, status, change_note, submitted_by_user_id, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, listingId, number, normalized.title, normalized.summary, normalized.body, normalized.website, normalized.category.id, normalized.category.kind, normalized.slug, status, changeNote, actorId, listingContentHash(normalized.canonical), now, now],
  );
  replaceChildren(id, normalized);
  return id;
}

function updateRevision(revisionId: string, normalized: NormalizedListing, actorId: string, changeNote: string, status: RevisionRow["status"]): void {
  run(
    `UPDATE listing_revisions
     SET title = ?, summary = ?, body = ?, website = ?, category_id = ?, kind = ?, proposed_slug = ?, status = ?, change_note = ?, submitted_by_user_id = ?, content_hash = ?, updated_at = ?
     WHERE id = ?`,
    [normalized.title, normalized.summary, normalized.body, normalized.website, normalized.category.id, normalized.category.kind, normalized.slug, status, changeNote, actorId, listingContentHash(normalized.canonical), nowIso(), revisionId],
  );
  replaceChildren(revisionId, normalized);
}

function demoValue(actor: Actor, requested?: boolean): number {
  if (!requested) return 0;
  if (actor.role === "administrator" || process.env.QUIRE_SEED === "1") return 1;
  return 0;
}

function attachOrganization(actor: Actor, listingId: string, organizationId: string | null | undefined): void {
  if (!organizationId) return;
  const membership = get<{ role: string }>("SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ?", [organizationId, actor.id]);
  if (!membership || (membership.role !== "owner" && membership.role !== "editor")) {
    throw new AppError("You can attach a listing only to an organization you edit.", "org");
  }
  run("UPDATE listings SET organization_id = ? WHERE id = ?", [organizationId, listingId]);
  run(
    `INSERT INTO listing_ownerships (id, listing_id, owner_type, owner_id, granted_via, granted_by_user_id, created_at)
     VALUES (?, ?, 'organization', ?, 'submission', ?, ?)`,
    [randomUUID(), listingId, organizationId, actor.id, nowIso()],
  );
}

export function createListing(
  actor: Actor,
  input: ListingInput & { organizationId?: string | null; demo?: boolean; providerLabel?: string },
): { listingId: string; revisionId: string; slug: string } {
  const normalized = normalizeListing(input, "draft");
  return withTransaction(() => {
    const listingId = randomUUID();
    const now = nowIso();
    run(
      `INSERT INTO listings
        (id, slug, kind, status, organization_id, category_id, submitted_by_user_id, external_key, provider_label, is_demo, indexable, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', NULL, ?, ?, NULL, ?, ?, 0, ?, ?)`,
      [listingId, normalized.slug, normalized.category.kind, normalized.category.id, actor.id, input.providerLabel?.trim() || null, demoValue(actor, input.demo), now, now],
    );
    const revisionId = writeRevision(listingId, 1, normalized, "draft", actor.id, "");
    attachOrganization(actor, listingId, input.organizationId);
    audit(actor.id, "listing.create", "listing", listingId, `Drafted ${normalized.title}.`);
    return { listingId, revisionId, slug: normalized.slug };
  });
}

export function updateUnpublished(actor: Actor, listingId: string, input: ListingInput): void {
  const listing = mustListing(listingId);
  if (listing.published_revision_id || listing.status === "published" || listing.status === "archived") {
    throw new AppError("Published listings change through a revision.", "state");
  }
  const grant = getListingGrant(actor, listingId);
  if (!grant.canEditContent) throw new AppError("You do not have permission to edit this listing.", "forbidden");
  const normalized = normalizeListing({ ...input, proposedSlug: input.proposedSlug || listing.slug }, "draft", listingId);
  const revision = get<RevisionRow>("SELECT * FROM listing_revisions WHERE listing_id = ? ORDER BY revision_number DESC LIMIT 1", [listingId]);
  if (!revision) throw new AppError("Revision not found.", "missing");
  withTransaction(() => {
    updateRevision(revision.id, normalized, actor.id, input.changeNote?.trim().slice(0, 500) || revision.change_note, revision.status === "rejected" ? "draft" : revision.status);
    run("UPDATE listings SET slug = ?, kind = ?, category_id = ?, status = ?, updated_at = ? WHERE id = ?", [
      normalized.slug,
      normalized.category.kind,
      normalized.category.id,
      listing.status === "rejected" ? "draft" : listing.status,
      nowIso(),
      listingId,
    ]);
    audit(actor.id, "listing.update", "listing", listingId, `Updated unpublished listing ${normalized.title}.`);
  });
}

export function submitListing(actor: Actor, listingId: string): void {
  const listing = mustListing(listingId);
  if (listing.status === "published" || listing.published_revision_id) throw new AppError("Submit a revision for a published listing.", "state");
  const grant = getListingGrant(actor, listingId);
  if (!grant.canEditContent && actor.id !== listing.submitted_by_user_id) throw new AppError("You do not have permission to submit this listing.", "forbidden");
  const revision = get<RevisionRow>("SELECT * FROM listing_revisions WHERE listing_id = ? ORDER BY revision_number DESC LIMIT 1", [listingId]);
  if (!revision) throw new AppError("Revision not found.", "missing");
  const input = inputFromRevision(revision.id, listing.slug);
  const normalized = normalizeListing(input, "submit", listingId);
  withTransaction(() => {
    updateRevision(revision.id, normalized, actor.id, revision.change_note, "submitted");
    run("UPDATE listings SET status = 'submitted', rejection_reason = NULL, kind = ?, category_id = ?, updated_at = ? WHERE id = ?", [
      normalized.category.kind,
      normalized.category.id,
      nowIso(),
      listingId,
    ]);
    audit(actor.id, "listing.submit", "listing", listingId, `Submitted ${normalized.title} for review.`);
  });
}

export function proposeRevision(actor: Actor, listingId: string, input: ListingInput, options?: { viaImport?: boolean }): { revisionId: string } {
  const listing = mustListing(listingId);
  if (listing.status !== "published" || !listing.published_revision_id) throw new AppError("Only a published listing can take a revision.", "state");
  if (options?.viaImport) {
    if (actor.role !== "administrator") throw new AppError("Only an administrator can open an import revision.", "forbidden");
  } else if (!getListingGrant(actor, listingId).canEditContent) {
    throw new AppError("You do not have permission to edit this listing.", "forbidden");
  }
  const note = (input.changeNote ?? "").trim();
  if (note.length < 10) throw new AppError("Describe what changed in at least 10 characters.", "note");
  const normalized = normalizeListing({ ...input, proposedSlug: input.proposedSlug || listing.slug }, "submit", listingId);
  return withTransaction(() => {
    const open = get<RevisionRow>("SELECT * FROM listing_revisions WHERE listing_id = ? AND status IN ('draft', 'submitted') ORDER BY revision_number DESC LIMIT 1", [listingId]);
    let revisionId: string;
    if (open) {
      updateRevision(open.id, normalized, actor.id, note, "submitted");
      revisionId = open.id;
    } else {
      const latest = get<{ revision_number: number }>("SELECT revision_number FROM listing_revisions WHERE listing_id = ? ORDER BY revision_number DESC LIMIT 1", [listingId]);
      revisionId = writeRevision(listingId, (latest?.revision_number ?? 0) + 1, normalized, "submitted", actor.id, note);
    }
    audit(actor.id, "revision.submit", "listing_revision", revisionId, `Proposed a revision for ${listing.slug}. Published copy stays live.`);
    return { revisionId };
  });
}

function grantSubmissionOwnership(listingId: string, submitterId: string | null, actorId: string): void {
  const existing = get<{ count: number }>("SELECT COUNT(*) AS count FROM listing_ownerships WHERE listing_id = ?", [listingId]);
  if ((existing?.count ?? 0) > 0 || !submitterId) return;
  const submitter = getUser(submitterId);
  if (!submitter || submitter.role !== "user") return;
  run(
    `INSERT INTO listing_ownerships (id, listing_id, owner_type, owner_id, granted_via, granted_by_user_id, created_at)
     VALUES (?, ?, 'user', ?, 'submission', ?, ?)`,
    [randomUUID(), listingId, submitterId, actorId, nowIso()],
  );
}

export function approveRevision(actor: Actor, revisionId: string, note: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const reason = note.trim();
  if (reason.length < 5) throw new AppError("Add a short approval note.", "note");
  const revision = mustRevision(revisionId);
  if (revision.status !== "submitted") throw new AppError("Only a submitted revision can be approved.", "state");
  if (revision.submitted_by_user_id === actor.id) throw new AppError("You cannot approve your own revision.", "self_approval");
  const listing = mustListing(revision.listing_id);
  withTransaction(() => {
    assertPublishAllowed(listing.id);
    if (revision.proposed_slug !== listing.slug) {
      if (slugTaken(revision.proposed_slug, listing.id)) throw new AppError("That slug is already in use.", "slug");
      retargetRedirect("listing", listing.id, `/listings/${listing.slug}`, `/listings/${revision.proposed_slug}`);
    }
    const now = nowIso();
    run(
      `UPDATE listing_revisions
       SET status = 'approved', reviewed_by_user_id = ?, review_note = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ?`,
      [actor.id, reason, now, now, revision.id],
    );
    run(
      `UPDATE listings
       SET slug = ?, kind = ?, category_id = ?, status = 'published', published_revision_id = ?, indexable = 1, rejection_reason = NULL, updated_at = ?
       WHERE id = ?`,
      [revision.proposed_slug, revision.kind, revision.category_id, revision.id, now, listing.id],
    );
    grantSubmissionOwnership(listing.id, listing.submitted_by_user_id, actor.id);
    reindexListing(listing.id);
    audit(actor.id, "listing.approve", "listing", listing.id, `Approved revision ${revision.revision_number}. ${reason}`);
  });
}

export function rejectRevision(actor: Actor, revisionId: string, note: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const reason = note.trim();
  if (reason.length < 5) throw new AppError("Add the reason for rejection.", "note");
  const revision = mustRevision(revisionId);
  if (revision.status !== "submitted") throw new AppError("Only a submitted revision can be rejected.", "state");
  if (revision.submitted_by_user_id === actor.id) throw new AppError("You cannot review your own revision.", "self_approval");
  const listing = mustListing(revision.listing_id);
  withTransaction(() => {
    const now = nowIso();
    run("UPDATE listing_revisions SET status = 'rejected', reviewed_by_user_id = ?, review_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?", [
      actor.id,
      reason,
      now,
      now,
      revision.id,
    ]);
    if (!listing.published_revision_id) {
      run("UPDATE listings SET status = 'rejected', rejection_reason = ?, indexable = 0, updated_at = ? WHERE id = ?", [reason, now, listing.id]);
      reindexListing(listing.id);
    }
    audit(actor.id, listing.published_revision_id ? "revision.reject" : "listing.reject", "listing", listing.id, reason);
  });
}

export function archiveListing(actor: Actor, listingId: string, reason: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  if (reason.trim().length < 5) throw new AppError("Add the reason for archiving.", "note");
  const listing = mustListing(listingId);
  if (listing.status !== "published") throw new AppError("Only a published listing can be archived.", "state");
  withTransaction(() => {
    run("UPDATE listings SET status = 'archived', indexable = 0, updated_at = ? WHERE id = ?", [nowIso(), listingId]);
    reindexListing(listingId);
    audit(actor.id, "listing.archive", "listing", listingId, reason.trim());
  });
}

export function restoreListing(actor: Actor, listingId: string, reason: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const listing = mustListing(listingId);
  if (listing.status !== "archived" || !listing.published_revision_id) throw new AppError("This listing cannot be restored.", "state");
  withTransaction(() => {
    run("UPDATE listings SET status = 'published', indexable = 1, updated_at = ? WHERE id = ?", [nowIso(), listingId]);
    reindexListing(listingId);
    audit(actor.id, "listing.restore", "listing", listingId, reason.trim());
  });
}

export function createImportedListing(
  actor: Actor,
  input: ListingInput & { externalKey: string; providerLabel?: string; organizationId?: string | null },
): { listingId: string; revisionId: string } {
  if (actor.role !== "administrator") throw new AppError("Administrator permission required.", "forbidden");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(input.externalKey)) throw new AppError("Dedupe key is invalid.", "dedupe");
  const normalized = normalizeListing(input, "submit");
  return withTransaction(() => {
    const listingId = randomUUID();
    const now = nowIso();
    run(
      `INSERT INTO listings
        (id, slug, kind, status, organization_id, category_id, submitted_by_user_id, external_key, provider_label, is_demo, indexable, created_at, updated_at)
       VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [listingId, normalized.slug, normalized.category.kind, input.organizationId ?? null, normalized.category.id, actor.id, input.externalKey, input.providerLabel?.trim() || null, now, now],
    );
    const revisionId = writeRevision(listingId, 1, normalized, "submitted", actor.id, "Imported from CSV. Awaiting review.");
    audit(actor.id, "listing.import", "listing", listingId, `Imported ${input.externalKey} without ownership.`);
    return { listingId, revisionId };
  });
}

function inputFromRevision(revisionId: string, slug: string): ListingInput {
  const revision = mustRevision(revisionId);
  const prices = all<{ label: string; model: PriceModel; amount_cents: number | null; currency: string; billing_interval: "" | "month" | "year" | null; notes: string }>(
    "SELECT label, model, amount_cents, currency, billing_interval, notes FROM listing_prices WHERE revision_id = ? ORDER BY sort_order",
    [revisionId],
  );
  const tags = all<{ slug: string }>("SELECT t.slug FROM listing_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.revision_id = ?", [revisionId]);
  const attributes = all<{ key: string; value_text: string | null; value_number: number | null; value_boolean: number | null }>(
    `SELECT d.key, v.value_text, v.value_number, v.value_boolean
     FROM listing_attribute_values v JOIN attribute_definitions d ON d.id = v.definition_id
     WHERE v.revision_id = ?`,
    [revisionId],
  );
  const images = all<ImageInput>("SELECT kind, path, alt FROM listing_images WHERE revision_id = ? ORDER BY sort_order", [revisionId]);
  const attributeMap: Record<string, string> = {};
  for (const attribute of attributes) {
    if (attribute.value_text !== null) attributeMap[attribute.key] = attribute.value_text;
    else if (attribute.value_number !== null) attributeMap[attribute.key] = String(attribute.value_number);
    else attributeMap[attribute.key] = attribute.value_boolean ? "true" : "false";
  }
  return {
    title: revision.title,
    summary: revision.summary,
    body: revision.body,
    website: revision.website ?? "",
    kind: revision.kind,
    categoryId: revision.category_id,
    proposedSlug: slug,
    prices: prices.map((price) => ({
      label: price.label,
      model: price.model,
      amount: price.amount_cents === null ? "" : (price.amount_cents / 100).toFixed(2),
      currency: price.currency,
      interval: price.billing_interval ?? "",
      notes: price.notes,
    })),
    tags: tags.map((tag) => tag.slug),
    attributes: attributeMap,
    images,
  };
}

export function canonicalHashForRevision(revisionId: string): string {
  const revision = mustRevision(revisionId);
  return revision.content_hash;
}

function attributeDisplay(row: { value_type: string; value_text: string | null; value_number: number | null; value_boolean: number | null; unit: string | null }): string {
  if (row.value_type === "boolean") return row.value_boolean ? "Yes" : "No";
  if (row.value_number !== null) return `${row.value_number}${row.unit ? ` ${row.unit}` : ""}`;
  return row.value_text ?? "";
}

export function getPublicListing(slug: string): PublicListing | null {
  const listing = get<ListingRow>("SELECT * FROM listings WHERE slug = ?", [slug]);
  if (!listing || !listing.published_revision_id) return null;
  if (listing.status !== "published" && listing.status !== "archived") return null;
  const revision = mustRevision(listing.published_revision_id);
  const category = get<{ name: string; slug: string; parent_id: string | null }>("SELECT name, slug, parent_id FROM categories WHERE id = ?", [revision.category_id]);
  const parent = category?.parent_id ? get<{ name: string; slug: string }>("SELECT name, slug FROM categories WHERE id = ?", [category.parent_id]) : undefined;
  const organization = listing.organization_id
    ? get<{ name: string; slug: string }>("SELECT name, slug FROM organizations WHERE id = ?", [listing.organization_id])
    : undefined;
  const ownership = get<{ count: number }>("SELECT COUNT(*) AS count FROM listing_ownerships WHERE listing_id = ?", [listing.id]);
  const prices = all<{ label: string; model: PriceModel; amount_cents: number | null; currency: string; billing_interval: "month" | "year" | null }>(
    "SELECT label, model, amount_cents, currency, billing_interval FROM listing_prices WHERE revision_id = ? ORDER BY sort_order",
    [revision.id],
  );
  const attributes = all<{ key: string; label: string; value_type: string; unit: string | null; value_text: string | null; value_number: number | null; value_boolean: number | null }>(
    `SELECT d.key, d.label, d.value_type, d.unit, v.value_text, v.value_number, v.value_boolean
     FROM listing_attribute_values v JOIN attribute_definitions d ON d.id = v.definition_id
     WHERE v.revision_id = ? ORDER BY d.sort_order, d.key`,
    [revision.id],
  );
  const tags = all<{ name: string; slug: string }>(
    "SELECT t.name, t.slug FROM listing_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.revision_id = ? ORDER BY t.name",
    [revision.id],
  );
  const images = all<ImageInput>("SELECT kind, path, alt FROM listing_images WHERE revision_id = ? ORDER BY sort_order", [revision.id]);
  const reviews = all<{ id: string; rating: number; title: string; body: string; author_name: string; created_at: string; relationship: string; verification_note: string | null; verified_by_user_id: string | null }>(
    `SELECT r.id, r.rating, r.title, r.body, u.name AS author_name, r.created_at, r.relationship, r.verification_note, r.verified_by_user_id
     FROM reviews r JOIN users u ON u.id = r.author_user_id
     WHERE r.listing_id = ? AND r.status = 'published'
     ORDER BY r.created_at DESC`,
    [listing.id],
  );
  const articles = all<{ title: string; slug: string }>(
    `SELECT a.title, a.slug FROM articles a
     JOIN article_listings al ON al.article_id = a.id
     WHERE al.listing_id = ? AND a.status = 'published'
     ORDER BY a.published_at DESC`,
    [listing.id],
  );
  return {
    id: listing.id,
    slug: listing.slug,
    status: listing.status,
    kind: revision.kind,
    isDemo: listing.is_demo === 1,
    indexable: listing.indexable === 1 && listing.status === "published",
    updatedAt: listing.updated_at,
    title: revision.title,
    summary: revision.summary,
    body: revision.body,
    website: revision.website,
    ownershipClaimed: (ownership?.count ?? 0) > 0,
    providerName: organization?.name ?? listing.provider_label,
    providerSlug: organization?.slug ?? null,
    categoryName: category?.name ?? "",
    categorySlug: category?.slug ?? "",
    parentName: parent?.name ?? null,
    parentSlug: parent?.slug ?? null,
    prices: prices.map((price) => ({
      label: price.label,
      model: price.model,
      amountCents: price.amount_cents,
      currency: price.currency,
      interval: price.billing_interval,
      text: priceLabel({ model: price.model, amountCents: price.amount_cents, currency: price.currency, interval: price.billing_interval, label: price.label }),
    })),
    attributes: attributes.map((attribute) => ({ key: attribute.key, label: attribute.label, display: attributeDisplay(attribute) })),
    tags,
    images,
    reviews: reviews.map((review) => {
      const verified = review.relationship === "verified_customer" && Boolean(review.verification_note) && Boolean(review.verified_by_user_id);
      return {
        id: review.id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        authorName: review.author_name,
        createdAt: review.created_at,
        relationship: verified ? "verified_customer" : "ordinary",
        verificationNote: verified ? review.verification_note : null,
      };
    }),
    articles,
  };
}

export function revisionDiff(beforeId: string, afterId: string): Array<{ field: string; before: string; after: string }> {
  const before = inputFromRevision(beforeId, mustRevision(beforeId).proposed_slug);
  const after = inputFromRevision(afterId, mustRevision(afterId).proposed_slug);
  const rows: Array<{ field: string; before: string; after: string }> = [];
  const fields: Array<[string, string, string]> = [
    ["Title", before.title, after.title],
    ["Summary", before.summary, after.summary],
    ["Body", before.body, after.body],
    ["Website", before.website, after.website],
    ["Kind", before.kind, after.kind],
    ["Slug", before.proposedSlug ?? "", after.proposedSlug ?? ""],
    ["Tags", before.tags.join(", "), after.tags.join(", ")],
    ["Prices", JSON.stringify(before.prices), JSON.stringify(after.prices)],
    ["Attributes", JSON.stringify(before.attributes), JSON.stringify(after.attributes)],
  ];
  for (const [field, left, right] of fields) if (left !== right) rows.push({ field, before: left, after: right });
  return rows;
}

export function listProviderListings(userId: string): Array<{ id: string; slug: string; status: ListingStatus; title: string; updated_at: string }> {
  return all(
    `SELECT l.id, l.slug, l.status, l.updated_at, r.title
     FROM listings l
     JOIN listing_revisions r ON r.id = (
       SELECT rr.id FROM listing_revisions rr
       WHERE rr.listing_id = l.id
       ORDER BY CASE WHEN rr.status IN ('draft', 'submitted') THEN 0 ELSE 1 END, rr.revision_number DESC
       LIMIT 1
     )
     WHERE l.id IN (
       SELECT listing_id FROM listing_ownerships WHERE owner_type = 'user' AND owner_id = ?
       UNION
       SELECT o.listing_id FROM listing_ownerships o
       JOIN organization_memberships m ON m.organization_id = o.owner_id AND o.owner_type = 'organization' AND m.user_id = ?
     )
     OR (l.submitted_by_user_id = ? AND l.status IN ('draft', 'submitted', 'rejected'))
     ORDER BY l.updated_at DESC`,
    [userId, userId, userId],
  );
}

export function getListing(id: string): ListingRow | undefined {
  return get<ListingRow>("SELECT * FROM listings WHERE id = ?", [id]);
}

export function findListingByExternalKey(externalKey: string): ListingRow | undefined {
  return get<ListingRow>("SELECT * FROM listings WHERE external_key = ?", [externalKey]);
}

export function contentHashForInput(input: ListingInput): string {
  return listingContentHash(normalizeListing(input, "submit").canonical);
}

export function editorState(listingId: string): { input: ListingInput; published: boolean; pending: boolean; slug: string; status: ListingStatus } | null {
  const listing = getListing(listingId);
  if (!listing) return null;
  const open = get<RevisionRow>("SELECT * FROM listing_revisions WHERE listing_id = ? AND status IN ('draft', 'submitted') ORDER BY revision_number DESC LIMIT 1", [listingId]);
  const revisionId = open?.id ?? listing.published_revision_id;
  if (!revisionId) return null;
  const revision = mustRevision(revisionId);
  return {
    input: inputFromRevision(revisionId, revision.proposed_slug),
    published: listing.status === "published",
    pending: Boolean(open && listing.published_revision_id),
    slug: listing.slug,
    status: listing.status,
  };
}
