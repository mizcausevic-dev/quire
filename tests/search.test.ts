import assert from "node:assert/strict";
import test from "node:test";
import { confirmMockSubscription } from "../src/lib/billing.ts";
import { getPublicListing, proposeRevision } from "../src/lib/listings.ts";
import { createOrganization } from "../src/lib/orgs.ts";
import { searchListings } from "../src/lib/search.ts";
import { buildTaxonomy, makeUser, publishSoftware, withDb } from "./helpers.ts";

test("search and filters return matching published records", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const author = makeUser("user");
    const org = createOrganization(author, { name: "Gauge Works" });
    confirmMockSubscription(author, org.id, "signal");
    const taxonomy = buildTaxonomy(admin);
    publishSoftware(author, moderator, taxonomy.analytics.id, "Kitefold Monitor", "cloud", org.id);
    publishSoftware(author, moderator, taxonomy.analytics.id, "Rootbinder", "self-hosted", org.id);
    const bodyMatch = publishSoftware(author, moderator, taxonomy.analytics.id, "Plain Gauge", "cloud", org.id);
    const input = {
      title: "Plain Gauge",
      summary: "Fictional catalog entry for Plain Gauge, written long enough to submit.",
      body: "The published body does not mention the secret token.",
      website: "https://example.test/product",
      kind: "software" as const,
      categoryId: taxonomy.analytics.id,
      proposedSlug: "plain-gauge",
      prices: [{ label: "Team", model: "subscription" as const, amount: "20", currency: "USD", interval: "month" as const, notes: "" }],
      tags: ["api"],
      attributes: { deployment: "cloud", has_api: "true" },
      images: [],
    };
    proposeRevision(author, bodyMatch, { ...input, body: "A pending revision mentions xylophone-token and must stay hidden.", changeNote: "Pending body should not be searchable." });
    const ranked = searchListings({ q: "kitefold", sort: "relevance" });
    assert.equal(ranked.hits[0]?.slug, "kitefold-monitor");
    assert.ok(ranked.hits.every((hit) => hit.slug !== "plain-gauge" || !hit.summary.includes("xylophone")));
    const cloud = searchListings({ category: "analytics", attributes: { deployment: "cloud" }, sort: "name" });
    assert.deepEqual(cloud.hits.map((hit) => hit.slug).sort(), ["kitefold-monitor", "plain-gauge"].sort());
    assert.equal(cloud.ignoredAttributeFilters.length, 0);
    const ignored = searchListings({ attributes: { deployment: "cloud" } });
    assert.ok(ignored.ignoredAttributeFilters.includes("deployment"));
    assert.ok(ignored.hits.length >= 3);
    const none = searchListings({ q: "xylophone" });
    assert.equal(none.hits.length, 0);
    assert.equal(getPublicListing("plain-gauge")?.body.includes("xylophone"), false);
  });
});

test("category pages paginate published matches", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const author = makeUser("user");
    const org = createOrganization(author, { name: "Gauge Works" });
    confirmMockSubscription(author, org.id, "signal");
    const taxonomy = buildTaxonomy(admin);
    for (let index = 1; index <= 13; index += 1) publishSoftware(author, moderator, taxonomy.analytics.id, `Sample Gauge ${index}`, "cloud", org.id);
    const first = searchListings({ category: "analytics", sort: "name", page: 1 });
    const second = searchListings({ category: "analytics", sort: "name", page: 2 });
    assert.equal(first.hits.length, 12);
    assert.equal(first.total, 13);
    assert.equal(second.hits.length, 1);
    assert.equal(second.page, 2);
  });
});
