import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import { all, get, run, withTransaction } from "./db";
import { AppError } from "./errors";
import { canModerate } from "./permissions";
import { isHttpUrl, nowIso } from "./text";
import type { Actor } from "./types";

export function fileClaim(actor: Actor, input: { listingId: string; evidence: string; evidenceUrl?: string; organizationId?: string | null }): { id: string } {
  const listing = get<{ id: string; status: string }>("SELECT id, status FROM listings WHERE id = ?", [input.listingId]);
  if (!listing || listing.status !== "published") throw new AppError("Claims can be filed on published listings.", "state");
  const evidence = input.evidence.trim();
  if (evidence.length < 40 || evidence.length > 4000) {
    throw new AppError("Describe the evidence for this claim in 40 to 4,000 characters.", "evidence");
  }
  const evidenceUrl = input.evidenceUrl?.trim() || "";
  if (evidenceUrl && !isHttpUrl(evidenceUrl)) throw new AppError("Evidence links must start with http:// or https://.", "url");
  if (input.organizationId) {
    const membership = get<{ role: string }>("SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ?", [
      input.organizationId,
      actor.id,
    ]);
    if (!membership || (membership.role !== "owner" && membership.role !== "editor")) {
      throw new AppError("File an organization claim only for an organization you edit.", "org");
    }
  }
  const owned = get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM listing_ownerships o
     LEFT JOIN organization_memberships m ON o.owner_type = 'organization' AND m.organization_id = o.owner_id AND m.user_id = ?
     WHERE o.listing_id = ? AND ((o.owner_type = 'user' AND o.owner_id = ?) OR m.role IN ('owner', 'editor'))`,
    [actor.id, input.listingId, actor.id],
  );
  if ((owned?.count ?? 0) > 0) throw new AppError("You already have access to this listing.", "claim");
  const pending = get("SELECT id FROM ownership_claims WHERE listing_id = ? AND claimant_user_id = ? AND status = 'pending'", [input.listingId, actor.id]);
  if (pending) throw new AppError("You already have a pending claim on this listing.", "claim");
  const id = randomUUID();
  run(
    `INSERT INTO ownership_claims
      (id, listing_id, claimant_user_id, organization_id, status, evidence_text, evidence_url, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [id, input.listingId, actor.id, input.organizationId ?? null, evidence, evidenceUrl || null, nowIso()],
  );
  audit(actor.id, "claim.file", "ownership_claim", id, "Filed an ownership claim. Email was not treated as verification.");
  return { id };
}

export function decideClaim(actor: Actor, claimId: string, decision: "approved" | "rejected", note: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const reason = note.trim();
  if (reason.length < 5) throw new AppError("Add a review note.", "note");
  const claim = get<{ id: string; listing_id: string; claimant_user_id: string; organization_id: string | null; status: string }>(
    "SELECT id, listing_id, claimant_user_id, organization_id, status FROM ownership_claims WHERE id = ?",
    [claimId],
  );
  if (!claim || claim.status !== "pending") throw new AppError("This claim is not pending.", "state");
  if (claim.claimant_user_id === actor.id) throw new AppError("You cannot review your own claim.", "self_approval");
  withTransaction(() => {
    if (decision === "approved") {
      const existing = get<{ count: number }>("SELECT COUNT(*) AS count FROM listing_ownerships WHERE listing_id = ?", [claim.listing_id]);
      if ((existing?.count ?? 0) > 0) throw new AppError("Revoke the current owner before approving another claim.", "ownership");
      const ownerType = claim.organization_id ? "organization" : "user";
      const ownerId = claim.organization_id ?? claim.claimant_user_id;
      run(
        `INSERT INTO listing_ownerships (id, listing_id, owner_type, owner_id, granted_via, granted_by_user_id, created_at)
         VALUES (?, ?, ?, ?, 'claim', ?, ?)`,
        [randomUUID(), claim.listing_id, ownerType, ownerId, actor.id, nowIso()],
      );
      if (claim.organization_id) run("UPDATE listings SET organization_id = ?, updated_at = ? WHERE id = ?", [claim.organization_id, nowIso(), claim.listing_id]);
    }
    run(
      `UPDATE ownership_claims
       SET status = ?, reviewer_user_id = ?, review_note = ?, decided_at = ?
       WHERE id = ?`,
      [decision, actor.id, reason, nowIso(), claim.id],
    );
    audit(actor.id, decision === "approved" ? "claim.approve" : "claim.reject", "ownership_claim", claim.id, reason);
  });
}

export function revokeClaim(actor: Actor, claimId: string, note: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const reason = note.trim();
  if (reason.length < 5) throw new AppError("Add a revocation note.", "note");
  const claim = get<{ id: string; listing_id: string; claimant_user_id: string; organization_id: string | null; status: string }>(
    "SELECT * FROM ownership_claims WHERE id = ?",
    [claimId],
  );
  if (!claim || claim.status !== "approved") throw new AppError("Only an approved claim can be revoked.", "state");
  const ownerType = claim.organization_id ? "organization" : "user";
  const ownerId = claim.organization_id ?? claim.claimant_user_id;
  withTransaction(() => {
    run("DELETE FROM listing_ownerships WHERE listing_id = ? AND owner_type = ? AND owner_id = ? AND granted_via = 'claim'", [
      claim.listing_id,
      ownerType,
      ownerId,
    ]);
    if (claim.organization_id) {
      const still = get("SELECT id FROM listing_ownerships WHERE listing_id = ? AND owner_type = 'organization' AND owner_id = ?", [
        claim.listing_id,
        claim.organization_id,
      ]);
      if (!still) run("UPDATE listings SET organization_id = NULL, updated_at = ? WHERE organization_id = ? AND id = ?", [nowIso(), claim.organization_id, claim.listing_id]);
    }
    run("UPDATE ownership_claims SET status = 'revoked', reviewer_user_id = ?, review_note = ?, decided_at = ? WHERE id = ?", [
      actor.id,
      reason,
      nowIso(),
      claim.id,
    ]);
    audit(actor.id, "claim.revoke", "ownership_claim", claim.id, reason);
  });
}

export function submitReview(actor: Actor, input: { listingId: string; rating: number; title: string; body: string }): { id: string } {
  const listing = get<{ status: string }>("SELECT status FROM listings WHERE id = ?", [input.listingId]);
  if (!listing || listing.status !== "published") throw new AppError("Reviews are accepted on published listings.", "state");
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new AppError("Choose a rating from 1 to 5.", "rating");
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 4 || title.length > 120) throw new AppError("Review titles must be 4 to 120 characters.", "review");
  if (body.length < 20 || body.length > 4000) throw new AppError("Review text must be 20 to 4,000 characters.", "review");
  const existing = get<{ id: string }>("SELECT id FROM reviews WHERE listing_id = ? AND author_user_id = ?", [input.listingId, actor.id]);
  const now = nowIso();
  if (existing) {
    run(
      `UPDATE reviews
       SET rating = ?, title = ?, body = ?, status = 'pending', relationship = 'ordinary', verification_note = NULL, verified_by_user_id = NULL, updated_at = ?
       WHERE id = ?`,
      [input.rating, title, body, now, existing.id],
    );
    audit(actor.id, "review.submit", "review", existing.id, "Updated a review and returned it to moderation.");
    return { id: existing.id };
  }
  const id = randomUUID();
  run(
    `INSERT INTO reviews
      (id, listing_id, author_user_id, rating, title, body, status, relationship, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 'ordinary', ?, ?)`,
    [id, input.listingId, actor.id, input.rating, title, body, now, now],
  );
  audit(actor.id, "review.submit", "review", id, "Submitted an ordinary review.");
  return { id };
}

export function decideReview(actor: Actor, reviewId: string, decision: "published" | "rejected", note: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const review = get<{ id: string; author_user_id: string; status: string }>("SELECT id, author_user_id, status FROM reviews WHERE id = ?", [reviewId]);
  if (!review || (review.status !== "pending" && review.status !== "published")) throw new AppError("This review cannot be moderated.", "state");
  if (review.author_user_id === actor.id) throw new AppError("You cannot moderate your own review.", "self_approval");
  const reason = note.trim();
  if (decision === "rejected" && reason.length < 5) throw new AppError("Add the reason for rejection.", "note");
  run(
    `UPDATE reviews SET status = ?, moderator_note = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`,
    [decision, reason, nowIso(), nowIso(), reviewId],
  );
  audit(actor.id, decision === "published" ? "review.publish" : "review.reject", "review", reviewId, reason || "Published without a public note.");
}

export function verifyCustomerReview(actor: Actor, reviewId: string, note: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const verification = note.trim();
  if (verification.length < 15) throw new AppError("Describe the verification check in at least 15 characters.", "note");
  const review = get<{ id: string; author_user_id: string; status: string }>("SELECT id, author_user_id, status FROM reviews WHERE id = ?", [reviewId]);
  if (!review || review.status !== "published") throw new AppError("Verify a review only after it is published.", "state");
  if (review.author_user_id === actor.id) throw new AppError("You cannot verify your own review.", "self_approval");
  run(
    `UPDATE reviews
     SET relationship = 'verified_customer', verification_note = ?, verified_by_user_id = ?, updated_at = ?
     WHERE id = ?`,
    [verification, actor.id, nowIso(), reviewId],
  );
  audit(actor.id, "review.verify", "review", reviewId, verification);
}

export function reportReview(actor: Actor, reviewId: string, reason: "spam" | "conflict" | "personal_data" | "other", details: string): { id: string } {
  const review = get<{ status: string }>("SELECT status FROM reviews WHERE id = ?", [reviewId]);
  if (!review || review.status !== "published") throw new AppError("Only a published review can be reported.", "state");
  const open = get("SELECT id FROM review_reports WHERE review_id = ? AND reporter_user_id = ? AND status = 'open'", [reviewId, actor.id]);
  if (open) throw new AppError("You already have an open report on this review.", "report");
  const id = randomUUID();
  run(
    `INSERT INTO review_reports (id, review_id, reporter_user_id, reason, details, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    [id, reviewId, actor.id, reason, details.trim().slice(0, 1000), nowIso()],
  );
  audit(actor.id, "review.report", "review_report", id, reason);
  return { id };
}

export function resolveReport(actor: Actor, reportId: string, decision: "dismissed" | "actioned", note: string): void {
  if (!canModerate(actor)) throw new AppError("Moderator permission required.", "forbidden");
  const report = get<{ id: string; review_id: string; status: string }>("SELECT id, review_id, status FROM review_reports WHERE id = ?", [reportId]);
  if (!report || report.status !== "open") throw new AppError("This report is not open.", "state");
  const reason = note.trim();
  if (reason.length < 5) throw new AppError("Add a resolution note.", "note");
  withTransaction(() => {
    if (decision === "actioned") {
      run("UPDATE reviews SET status = 'removed', updated_at = ? WHERE id = ?", [nowIso(), report.review_id]);
    }
    run("UPDATE review_reports SET status = ?, resolved_by_user_id = ?, resolution_note = ?, resolved_at = ? WHERE id = ?", [
      decision,
      actor.id,
      reason,
      nowIso(),
      report.id,
    ]);
    audit(actor.id, "review.report.resolve", "review_report", report.id, `${decision}: ${reason}`);
  });
}

export function moderationQueue() {
  return {
    submissions: all<{ listing_id: string; slug: string; status: string; revision_id: string; title: string; created_at: string }>(
      `SELECT l.id AS listing_id, l.slug, l.status, r.id AS revision_id, r.title, r.created_at
       FROM listings l
       JOIN listing_revisions r ON r.listing_id = l.id AND r.status = 'submitted'
       WHERE l.published_revision_id IS NULL
       ORDER BY r.created_at ASC`,
    ),
    revisions: all<{ listing_id: string; slug: string; revision_id: string; title: string; change_note: string; created_at: string; published_revision_id: string }>(
      `SELECT l.id AS listing_id, l.slug, r.id AS revision_id, r.title, r.change_note, r.created_at, p.id AS published_revision_id
       FROM listing_revisions r
       JOIN listings l ON l.id = r.listing_id
       JOIN listing_revisions p ON p.id = l.published_revision_id
       WHERE r.status = 'submitted' AND l.status = 'published'
       ORDER BY r.created_at ASC`,
    ),
    claims: all<{ id: string; listing_id: string; evidence_text: string; created_at: string; claimant_email: string; slug: string }>(
      `SELECT c.id, c.listing_id, c.evidence_text, c.created_at, u.email AS claimant_email, l.slug
       FROM ownership_claims c
       JOIN users u ON u.id = c.claimant_user_id
       JOIN listings l ON l.id = c.listing_id
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`,
    ),
    reviews: all<{ id: string; listing_id: string; title: string; body: string; rating: number; created_at: string; slug: string; author_name: string }>(
      `SELECT r.id, r.listing_id, r.title, r.body, r.rating, r.created_at, l.slug, u.name AS author_name
       FROM reviews r
       JOIN listings l ON l.id = r.listing_id
       JOIN users u ON u.id = r.author_user_id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC`,
    ),
    reports: all<{ id: string; reason: string; details: string; created_at: string; title: string; slug: string }>(
      `SELECT rr.id, rr.reason, rr.details, rr.created_at, r.title, l.slug
       FROM review_reports rr
       JOIN reviews r ON r.id = rr.review_id
       JOIN listings l ON l.id = r.listing_id
       WHERE rr.status = 'open'
       ORDER BY rr.created_at ASC`,
    ),
  };
}
