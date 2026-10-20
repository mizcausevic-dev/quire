import assert from "node:assert/strict";
import test from "node:test";
import { get } from "../src/lib/db.ts";
import { createImportedListing, getPublicListing } from "../src/lib/listings.ts";
import { approveRevision } from "../src/lib/listings.ts";
import { decideClaim, fileClaim, revokeClaim } from "../src/lib/moderation.ts";
import { createOrganization } from "../src/lib/orgs.ts";
import { getListingGrant } from "../src/lib/permissions.ts";
import { buildTaxonomy, makeUser, softwareInput, withDb } from "./helpers.ts";

test("ownership is granted only after a moderator accepts evidence", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const claimant = makeUser("user", "person@northwind.example");
    const outsider = makeUser("user", "other@elsewhere.example");
    const org = createOrganization(claimant, { name: "Northwind Loom", website: "https://northwind.example" });
    createOrganization(outsider, { name: "Elsewhere Bench", website: "https://elsewhere.example" });
    const taxonomy = buildTaxonomy(admin);
    const created = createImportedListing(admin, {
      ...softwareInput(taxonomy.analytics.id, "Wren Index"),
      externalKey: "wren-index",
      organizationId: org.id,
      providerLabel: "Northwind Loom",
    });
    const revision = get<{ id: string }>("SELECT id FROM listing_revisions WHERE listing_id = ?", [created.listingId]);
    assert.ok(revision);
    approveRevision(moderator, revision.id, "Catalogued without an owner.");
    assert.equal(getListingGrant(claimant, created.listingId).canEditContent, false);
    const claim = fileClaim(claimant, {
      listingId: created.listingId,
      organizationId: org.id,
      evidence: "Fictional evidence packet Q-1001: the claimant submitted a signed letter and a sample invoice.",
      evidenceUrl: "https://evidence.example/q-1001",
    });
    const pending = get<{ status: string }>("SELECT status FROM ownership_claims WHERE id = ?", [claim.id]);
    assert.equal(pending?.status, "pending");
    assert.equal(getListingGrant(claimant, created.listingId).canEditContent, false);
    assert.equal(getPublicListing("wren-index")?.ownershipClaimed, false);
    decideClaim(moderator, claim.id, "approved", "Reviewed the fictional evidence packet.");
    assert.equal(getListingGrant(claimant, created.listingId).canEditContent, true);
    assert.equal(getListingGrant(outsider, created.listingId).canEditContent, false);
    revokeClaim(moderator, claim.id, "The evidence was withdrawn.");
    assert.equal(getListingGrant(claimant, created.listingId).canEditContent, false);
  });
});
