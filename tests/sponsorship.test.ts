import assert from "node:assert/strict";
import test from "node:test";
import { confirmMockSubscription } from "../src/lib/billing.ts";
import { createOrganization } from "../src/lib/orgs.ts";
import { searchListings } from "../src/lib/search.ts";
import { cancelPlacement, createPlacement, placementIsLive } from "../src/lib/sponsorship.ts";
import { buildTaxonomy, makeUser, publishSoftware, withDb } from "./helpers.ts";
import { get, run } from "../src/lib/db.ts";

test("sponsored placement follows stored dates, cancellation, and entitlement", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const owner = makeUser("user", "sponsor@quire.test");
    const org = createOrganization(owner, { name: "Bluebottle and Co" });
    const taxonomy = buildTaxonomy(admin);
    const listingId = publishSoftware(owner, moderator, taxonomy.analytics.id, "Bottleglass Metrics");
    run("INSERT INTO listing_ownerships (id, listing_id, owner_type, owner_id, granted_via, created_at) VALUES ('own-1', ?, 'organization', ?, 'admin', '2026-01-01T00:00:00.000Z')", [listingId, org.id]);
    run("UPDATE listings SET organization_id = ? WHERE id = ?", [org.id, listingId]);
    const placement = createPlacement(admin, {
      listingId,
      placement: "search",
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-31T00:00:00.000Z",
    });
    const row = get<{ status: string; starts_at: string; ends_at: string; requires_entitlement: number }>("SELECT * FROM sponsored_placements WHERE id = ?", [placement.id]);
    assert.ok(row);
    const liveRow = { ...row, organization_id: org.id };
    assert.equal(placementIsLive(liveRow, new Date("2026-10-20T00:00:00.000Z")), false);
    confirmMockSubscription(owner, org.id, "signal", new Date("2026-10-20T00:00:00.000Z"));
    assert.equal(placementIsLive(liveRow, new Date("2026-09-01T00:00:00.000Z")), false);
    assert.equal(placementIsLive(liveRow, new Date("2026-10-20T00:00:00.000Z")), true);
    assert.equal(placementIsLive(liveRow, new Date("2026-10-31T00:00:00.000Z")), false);
    const during = searchListings({ q: "Bottleglass", placement: "search", now: new Date("2026-10-20T00:00:00.000Z") });
    assert.equal(during.sponsored.length, 1);
    assert.equal(during.sponsored[0]?.disclosure?.toLowerCase().includes("sponsored"), true);
    assert.equal(during.hits.some((hit) => hit.slug === "bottleglass-metrics"), false);
    const after = searchListings({ q: "Bottleglass", placement: "search", now: new Date("2026-11-01T00:00:00.000Z") });
    assert.equal(after.sponsored.length, 0);
    assert.equal(after.hits.some((hit) => hit.slug === "bottleglass-metrics"), true);
    assert.equal(get<{ status: string }>("SELECT status FROM sponsored_placements WHERE id = ?", [placement.id])?.status, "scheduled");
    cancelPlacement(admin, placement.id);
    assert.equal(placementIsLive({ ...liveRow, status: "canceled" }, new Date("2026-10-20T00:00:00.000Z")), false);
  });
});
