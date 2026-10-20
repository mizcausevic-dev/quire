import assert from "node:assert/strict";
import test from "node:test";
import { get } from "../src/lib/db.ts";
import { approveRevision, createListing, getPublicListing, submitListing } from "../src/lib/listings.ts";
import { createOrganization, setMembership } from "../src/lib/orgs.ts";
import { getListingGrant } from "../src/lib/permissions.ts";
import { searchListings } from "../src/lib/search.ts";
import { buildTaxonomy, makeUser, softwareInput, withDb } from "./helpers.ts";

test("a user submission stays private until a moderator publishes it", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const author = makeUser("user", "author@quire.test");
    const taxonomy = buildTaxonomy(admin);
    const created = createListing(author, softwareInput(taxonomy.analytics.id, "Copper Notebook"));
    submitListing(author, created.listingId);
    assert.equal(getPublicListing(created.slug), null);
    assert.equal(searchListings({ q: "Copper" }).hits.length, 0);
    const revision = get<{ id: string }>("SELECT id FROM listing_revisions WHERE listing_id = ?", [created.listingId]);
    assert.ok(revision);
    approveRevision(moderator, revision.id, "The entry is ready.");
    const published = getPublicListing(created.slug);
    assert.equal(published?.title, "Copper Notebook");
    assert.equal(published?.status, "published");
    assert.equal(searchListings({ q: "Copper" }).hits.length, 1);
    assert.equal(getListingGrant(author, created.listingId).hasOwnership, true);
  });
});

test("publishing does not give a provider member ownership of an unrelated listing", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const owner = makeUser("user", "owner@quire.test");
    const stranger = makeUser("user", "stranger@quire.test");
    const org = createOrganization(owner, { name: "Northwind Loom", website: "https://northwind.example" });
    const other = createOrganization(stranger, { name: "Elsewhere Bench" });
    const billing = makeUser("user", "billing-only@quire.test");
    setMembership(owner, org.id, billing.email, "billing");
    const taxonomy = buildTaxonomy(admin);
    const created = createListing(owner, { ...softwareInput(taxonomy.analytics.id, "Bottleglass Metrics"), organizationId: org.id });
    submitListing(owner, created.listingId);
    const revision = get<{ id: string }>("SELECT id FROM listing_revisions WHERE listing_id = ?", [created.listingId]);
    assert.ok(revision);
    approveRevision(moderator, revision.id, "Approved for the owning organization.");
    assert.equal(getListingGrant(owner, created.listingId).canEditContent, true);
    assert.equal(getListingGrant(stranger, created.listingId).canEditContent, false);
    assert.equal(getListingGrant(billing, created.listingId).canEditContent, false);
    assert.equal(getListingGrant(billing, created.listingId).canViewInProvider, true);
    const unrelated = createListing(stranger, { ...softwareInput(taxonomy.analytics.id, "Elsewhere Gauge"), organizationId: other.id });
    assert.equal(getListingGrant(owner, unrelated.listingId).canEditContent, false);
  });
});
