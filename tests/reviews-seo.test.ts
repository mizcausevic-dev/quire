import assert from "node:assert/strict";
import test from "node:test";
import { articleJsonLd, jsonLdScript, listingJsonLd } from "../src/lib/jsonld.ts";
import { decideReview, submitReview, verifyCustomerReview } from "../src/lib/moderation.ts";
import { getPublicListing } from "../src/lib/listings.ts";
import { robotsDisallowRules, robotsFor } from "../src/lib/seo.ts";
import { collectSitemapPaths } from "../src/lib/sitemap-data.ts";
import { buildTaxonomy, makeUser, publishSoftware, withDb } from "./helpers.ts";

test("reviews stay ordinary until a moderator records a verification", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const author = makeUser("user");
    const reader = makeUser("user", "reader@quire.test");
    const taxonomy = buildTaxonomy(admin);
    const listingId = publishSoftware(author, moderator, taxonomy.analytics.id, "Marrow Chart");
    const review = submitReview(reader, { listingId, rating: 4, title: "Useful fiction", body: "A fictional review of a fictional analytics product." });
    assert.equal(getPublicListing("marrow-chart")?.reviews.length, 0);
    decideReview(moderator, review.id, "published", "Nothing to remove.");
    const ordinary = getPublicListing("marrow-chart")?.reviews[0];
    assert.equal(ordinary?.relationship, "ordinary");
    verifyCustomerReview(moderator, review.id, "Checked fictional order Q-1001 against the demonstration ledger.");
    const verified = getPublicListing("marrow-chart")?.reviews[0];
    assert.equal(verified?.relationship, "verified_customer");
    assert.match(verified?.verificationNote ?? "", /Q-1001/);
    const ld = jsonLdScript(listingJsonLd({
      origin: "http://localhost:3000",
      path: "/listings/marrow-chart",
      kind: "software",
      title: "Marrow Chart",
      summary: "A fictional summary long enough for schema.",
      categoryName: "Analytics",
      providerName: null,
      offers: [],
    }));
    assert.equal(ld.includes("AggregateRating"), false);
    assert.equal(ld.includes('"Person"'), false);
    const article = jsonLdScript(articleJsonLd({ origin: "http://localhost:3000", path: "/articles/how-to-read", title: "How to read a listing", description: "A guide.", publishedAt: null }));
    assert.equal(article.includes('"Person"'), false);
    assert.match(article, /Quire editorial desk/);
  });
});

test("robots and sitemap keep filtered and private URLs distinct", () => {
  withDb(() => {
    const rules = robotsDisallowRules();
    for (const path of ["/search", "/listings", "/categories", "/compare", "/articles"]) {
      assert.equal(rules.includes(path), false);
    }
    assert.equal(robotsFor({ filtered: true }).index, false);
    assert.equal(robotsFor({ page: 2 }).index, false);
    assert.equal(robotsFor({ indexable: true }).index, true);
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const author = makeUser("user");
    const taxonomy = buildTaxonomy(admin);
    publishSoftware(author, moderator, taxonomy.analytics.id, "Octave Samples");
    const paths = collectSitemapPaths().map((entry) => entry.path);
    assert.ok(paths.includes("/listings/octave-samples"));
    assert.ok(paths.includes("/categories/analytics"));
    assert.equal(paths.some((path) => path.startsWith("/search")), false);
    process.env.QUIRE_DEMO_NOINDEX = "1";
    assert.equal(robotsFor({ indexable: true }).index, false);
    assert.equal(collectSitemapPaths().length, 0);
  });
});
