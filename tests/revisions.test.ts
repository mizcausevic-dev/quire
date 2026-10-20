import assert from "node:assert/strict";
import test from "node:test";
import { get } from "../src/lib/db.ts";
import { approveRevision, getPublicListing, proposeRevision, rejectRevision } from "../src/lib/listings.ts";
import { findRedirect } from "../src/lib/redirects.ts";
import { searchListings } from "../src/lib/search.ts";
import { buildTaxonomy, makeUser, publishSoftware, softwareInput, withDb } from "./helpers.ts";

test("a revision stays invisible until approval and cannot be self-approved", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const author = makeUser("user");
    const taxonomy = buildTaxonomy(admin);
    const listingId = publishSoftware(author, moderator, taxonomy.analytics.id, "Loomline Census");
    const published = getPublicListing("loomline-census");
    assert.ok(published);
    const next = softwareInput(taxonomy.analytics.id, "Loomline Census");
    next.summary = "Fictional catalog entry with a revised summary for review.";
    next.proposedSlug = "loomline-census";
    const { revisionId } = proposeRevision(author, listingId, { ...next, changeNote: "Clarified the summary." });
    assert.equal(getPublicListing("loomline-census")?.summary, published.summary);
    assert.equal(searchListings({ q: "revised" }).hits.length, 0);
    assert.equal(searchListings({ q: "Loomline" }).hits[0]?.summary, published.summary);
    assert.throws(() => approveRevision(author, revisionId, "Approving myself."), /Moderator permission required/);
    const amended = proposeRevision(admin, listingId, { ...next, changeNote: "Clarified the summary." }, { viaImport: true });
    assert.throws(() => approveRevision(admin, amended.revisionId, "Approving my import."), /cannot approve your own revision/);
    approveRevision(moderator, amended.revisionId, "The revision is accurate.");
    assert.match(getPublicListing("loomline-census")?.summary ?? "", /revised summary/);
  });
});

test("rejecting a revision keeps the published version, and slug changes redirect after approval", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const author = makeUser("user");
    const taxonomy = buildTaxonomy(admin);
    const listingId = publishSoftware(author, moderator, taxonomy.analytics.id, "Stillwater Counts");
    const rejected = softwareInput(taxonomy.analytics.id, "Stillwater Counts");
    rejected.summary = "Fictional catalog entry that should not replace the live one.";
    const first = proposeRevision(author, listingId, { ...rejected, changeNote: "Tried a new summary." });
    rejectRevision(moderator, first.revisionId, "The summary overclaims coverage.");
    assert.match(getPublicListing("stillwater-counts")?.summary ?? "", /Stillwater Counts/);
    const renamed = softwareInput(taxonomy.analytics.id, "Stillwater Counts");
    renamed.proposedSlug = "stillwater-census";
    const second = proposeRevision(author, listingId, { ...renamed, changeNote: "Renamed the public slug." });
    assert.equal(findRedirect("/listings/stillwater-counts"), null);
    approveRevision(moderator, second.revisionId, "Slug change is fine.");
    assert.equal(getPublicListing("stillwater-census")?.title, "Stillwater Counts");
    assert.equal(findRedirect("/listings/stillwater-counts"), "/listings/stillwater-census");
    const row = get<{ status: string }>("SELECT status FROM listings WHERE id = ?", [listingId]);
    assert.equal(row?.status, "published");
  });
});
