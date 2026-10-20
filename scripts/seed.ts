process.env.QUIRE_SEED = "1";

import { randomUUID } from "node:crypto";
import { createUser } from "../src/lib/auth.ts";
import { grantEditorialEntitlement } from "../src/lib/billing.ts";
import { createCollection, addToCollection } from "../src/lib/collections.ts";
import { closeDatabase, get, migrate, run } from "../src/lib/db.ts";
import { archiveListing, approveRevision, createImportedListing, createListing, proposeRevision, rejectRevision, submitListing } from "../src/lib/listings.ts";
import { decideReview, fileClaim, submitReview, verifyCustomerReview } from "../src/lib/moderation.ts";
import { createOrganization, setMembership } from "../src/lib/orgs.ts";
import { saveArticle, setArticleStatus } from "../src/lib/articles.ts";
import { setSetting } from "../src/lib/settings.ts";
import { createPlacement, cancelPlacement } from "../src/lib/sponsorship.ts";
import { saveAttributeDefinition, saveCategory, saveTag } from "../src/lib/taxonomy.ts";
import type { Actor, ListingInput } from "../src/lib/types.ts";

function shift(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function publish(actor: Actor, moderator: Actor, input: ListingInput, organizationId?: string): string {
  const created = createListing(actor, { ...input, organizationId, demo: true, images: input.images.length ? input.images : [{ kind: "screenshot", path: "/media/mark.svg", alt: `Fictional monogram for ${input.title}` }] });
  submitListing(actor, created.listingId);
  const revision = get<{ id: string }>("SELECT id FROM listing_revisions WHERE listing_id = ? AND status = 'submitted'", [created.listingId]);
  if (!revision) throw new Error(`Missing revision for ${input.title}`);
  approveRevision(moderator, revision.id, "Approved for the demonstration issue.");
  return created.listingId;
}

function software(categoryId: string, title: string, deployment: string, hasApi = true): ListingInput {
  return {
    title,
    summary: `Fictional catalog entry for ${title}, written so the demonstration stays obvious.`,
    body: `${title} is an invented product. Nothing in this description refers to a real company, customer, or certification.`,
    website: "https://example.test/fictional",
    kind: "software",
    categoryId,
    prices: [{ label: "Team", model: "subscription", amount: deployment === "self-hosted" ? "40" : "18", currency: "USD", interval: "month", notes: "" }],
    tags: hasApi ? ["api"] : ["onboarding"],
    attributes: { deployment, has_api: hasApi ? "true" : "false" },
    images: [],
  };
}

function main() {
  migrate();
  if (get("SELECT id FROM users WHERE email = ?", ["ada.editor@quire.example"])) {
    console.log("Seed already present.");
    closeDatabase();
    return;
  }
  const password = "demo-quire-2026";
  const ada = createUser({ email: "ada.editor@quire.example", name: "Ada Editor", password, role: "administrator", acceptPrivacy: true });
  const max = createUser({ email: "max.mod@quire.example", name: "Max Moderator", password, role: "moderator", acceptPrivacy: true });
  const lina = createUser({ email: "lina.northwind@quire.example", name: "Lina North", password, role: "user", acceptPrivacy: true });
  const jules = createUser({ email: "jules.paper@quire.example", name: "Jules Paper", password, role: "user", acceptPrivacy: true });
  const sam = createUser({ email: "sam.reader@quire.example", name: "Sam Reader", password, role: "user", acceptPrivacy: true });
  const rory = createUser({ email: "rory.claim@quire.example", name: "Rory Claim", password, role: "user", acceptPrivacy: true });

  const northwind = createOrganization(lina, { name: "Northwind Loom", website: "https://northwind.example", description: "Fictional studio that publishes analytics products." });
  const paper = createOrganization(jules, { name: "Paperplane Ledger", website: "https://paperplane.example", description: "Fictional studio for workplace software." });
  const blue = createOrganization(ada, { name: "Bluebottle and Co", website: "https://bluebottle.example", description: "Fictional metrics practice. Ada created the org record for the seed." });
  setMembership(ada, blue.id, lina.email, "editor");
  const harbor = createOrganization(lina, { name: "Harbor Hex", website: "https://harborhex.example", description: "Fictional implementation practice on the free tier." });
  grantEditorialEntitlement(ada, northwind.id, "signal", "2027-12-31T00:00:00.000Z");
  grantEditorialEntitlement(ada, paper.id, "studio", "2027-12-31T00:00:00.000Z");
  grantEditorialEntitlement(ada, blue.id, "signal", "2027-12-31T00:00:00.000Z");
  grantEditorialEntitlement(ada, harbor.id, "studio", "2027-12-31T00:00:00.000Z");

  const softwareCat = saveCategory(ada, { name: "Software", kind: "software", description: "Software products filed by the desk.", sortOrder: 1 });
  const analytics = saveCategory(ada, { name: "Analytics", kind: "software", parentId: softwareCat.id, description: "Measurement, reporting, and census tools.", sortOrder: 2 });
  const devtools = saveCategory(ada, { name: "Developer tools", kind: "software", parentId: softwareCat.id, description: "Tools for building and shipping software.", sortOrder: 3 });
  const workplace = saveCategory(ada, { name: "Workplace software", kind: "software", parentId: softwareCat.id, description: "Desks, calendars, and shared rooms.", sortOrder: 4 });
  const services = saveCategory(ada, { name: "Services", kind: "service", description: "Service practices filed separately from software.", sortOrder: 5 });
  const implementation = saveCategory(ada, { name: "Implementation", kind: "service", parentId: services.id, description: "Rollouts, migrations, and handoffs.", sortOrder: 6 });
  const advisory = saveCategory(ada, { name: "Advisory", kind: "service", parentId: services.id, description: "Workshops and written critiques.", sortOrder: 7 });
  saveAttributeDefinition(ada, { categoryId: softwareCat.id, key: "deployment", label: "Deployment", valueType: "enum", enumOptions: ["cloud", "self-hosted", "hybrid"], required: true, filterable: true });
  saveAttributeDefinition(ada, { categoryId: softwareCat.id, key: "has_api", label: "Has API", valueType: "boolean", filterable: true });
  saveAttributeDefinition(ada, { categoryId: implementation.id, key: "typical_weeks", label: "Typical weeks", valueType: "number", filterable: true, unit: "weeks" });
  saveAttributeDefinition(ada, { categoryId: services.id, key: "engagement", label: "Engagement", valueType: "enum", enumOptions: ["project", "retainer", "workshop"], required: true, filterable: true });
  for (const tag of ["API", "Onboarding", "Migration"]) saveTag(ada, tag);

  const analyticsTitles: Array<[string, string, string]> = [
    ["Loomline Census", "cloud", northwind.id],
    ["Bottleglass Metrics", "cloud", blue.id],
    ["Kitefold Reports", "hybrid", northwind.id],
    ["Stillwater Counts", "self-hosted", northwind.id],
    ["Ficta Pane", "cloud", blue.id],
    ["Marrow Chart", "cloud", northwind.id],
    ["Octave Samples", "hybrid", blue.id],
    ["Quillheat Maps", "cloud", northwind.id],
    ["Pebble Index", "self-hosted", northwind.id],
    ["Quarry Signals", "cloud", blue.id],
    ["Reed Counter", "hybrid", northwind.id],
    ["Sable Pane", "cloud", blue.id],
    ["Thimble Reports", "self-hosted", northwind.id],
    ["Umber Census", "cloud", northwind.id],
  ];
  const ids = new Map<string, string>();
  for (const [title, deployment, orgId] of analyticsTitles) {
    ids.set(title, publish(orgId === northwind.id ? lina : ada, max, software(analytics.id, title, deployment), orgId));
  }
  for (const title of ["Spool Compiler", "Drydock CLI", "Inkdiff", "Patchglass CI", "Quietmerge", "Vellum Testbed"]) {
    ids.set(title, publish(lina, max, { ...software(devtools.id, title, "cloud"), tags: ["api"] }, northwind.id));
  }
  for (const title of ["Commonroom Desk", "Hourglass Tasks", "Linen Calendar", "Mossboard"]) {
    ids.set(title, publish(jules, max, { ...software(workplace.id, title, "cloud", false), tags: ["onboarding"], prices: [{ label: "Seat", model: "subscription", amount: "8", currency: "USD", interval: "month", notes: "" }] }, paper.id));
  }
  const service = (categoryId: string, title: string, weeks: string): ListingInput => ({
    title,
    summary: `Fictional service entry for ${title}. The practice does not exist outside this catalog.`,
    body: `${title} is an invented engagement. The weeks figure is a demonstration attribute, not a quote.`,
    website: "https://example.test/services",
    kind: "service",
    categoryId,
    prices: [{ label: "Engagement", model: "contact", amount: "", currency: "USD", interval: "", notes: "" }],
    tags: ["migration"],
    attributes: { engagement: "project", typical_weeks: weeks },
    images: [],
  });
  ids.set("Harbor Hex Cutover", publish(lina, max, service(implementation.id, "Harbor Hex Cutover", "6"), harbor.id));
  ids.set("Kindling Room Onboarding", publish(lina, max, service(implementation.id, "Kindling Room Onboarding", "3"), harbor.id));
  ids.set("Dovetail Rollout", publish(lina, max, service(implementation.id, "Dovetail Rollout", "10"), harbor.id));
  ids.set("Evenfall Handoff", publish(lina, max, { ...service(implementation.id, "Evenfall Handoff", "4"), attributes: { engagement: "retainer", typical_weeks: "4" } }, harbor.id));
  ids.set("Glassacre Review", publish(ada, max, { ...service(advisory.id, "Glassacre Review", ""), attributes: { engagement: "workshop" }, tags: ["onboarding"] }, blue.id));
  ids.set("Halogen Office Hours", publish(ada, max, { ...service(advisory.id, "Halogen Office Hours", ""), attributes: { engagement: "retainer" } }, blue.id));
  ids.set("Lowtide Workshops", publish(ada, max, { ...service(advisory.id, "Lowtide Workshops", ""), attributes: { engagement: "workshop" } }, blue.id));

  const draft = createListing(lina, { ...software(devtools.id, "Unsent Map", "cloud"), organizationId: northwind.id, demo: true });
  const waiting = createListing(lina, { ...software(devtools.id, "Copper Notebook", "hybrid"), organizationId: northwind.id, demo: true });
  submitListing(lina, waiting.listingId);
  const rejected = createListing(lina, { ...software(workplace.id, "Instant Badge", "cloud"), summary: "Fictional catalog entry that implies a certification the desk will not grant.", organizationId: northwind.id, demo: true });
  submitListing(lina, rejected.listingId);
  const rejectedRevision = get<{ id: string }>("SELECT id FROM listing_revisions WHERE listing_id = ?", [rejected.listingId]);
  if (!rejectedRevision) throw new Error("missing rejected revision");
  rejectRevision(max, rejectedRevision.id, "Positioning implied a certification this catalog does not grant.");
  archiveListing(max, ids.get("Umber Census") ?? "", "Retired from the demonstration issue.");

  const loom = ids.get("Loomline Census");
  if (!loom) throw new Error("missing loomline");
  proposeRevision(lina, loom, {
    ...software(analytics.id, "Loomline Census", "cloud"),
    summary: "Fictional catalog entry with a revised summary that must stay hidden until approval.",
    proposedSlug: "loomline-census",
    changeNote: "Clarified the summary. The published sentence should remain visible.",
  });

  const imported = createImportedListing(ada, { ...software(analytics.id, "Wren Index", "cloud"), externalKey: "wren-index", providerLabel: "Unclaimed fictional studio" });
  const importedRevision = get<{ id: string }>("SELECT id FROM listing_revisions WHERE listing_id = ?", [imported.listingId]);
  if (!importedRevision) throw new Error("missing import revision");
  approveRevision(max, importedRevision.id, "Catalogued without an owner so a claim can be reviewed.");
  run("UPDATE listings SET is_demo = 1 WHERE id = ?", [imported.listingId]);

  createPlacement(ada, { listingId: loom, placement: "homepage", startsAt: shift(-2), endsAt: shift(20), disclosure: "Sponsored" });
  createPlacement(ada, { listingId: ids.get("Bottleglass Metrics") ?? loom, placement: "search", startsAt: shift(15), endsAt: shift(45), disclosure: "Sponsored" });
  createPlacement(ada, { listingId: ids.get("Kitefold Reports") ?? loom, placement: "category", startsAt: shift(-40), endsAt: shift(-1), disclosure: "Sponsored" });
  const canceled = createPlacement(ada, { listingId: ids.get("Stillwater Counts") ?? loom, placement: "homepage", startsAt: shift(-2), endsAt: shift(10), disclosure: "Sponsored" });
  cancelPlacement(ada, canceled.id);

  const review = submitReview(sam, { listingId: loom, rating: 4, title: "Clear fictional filing", body: "A fictional reader note about a fictional analytics product. It should not be read as a customer story." });
  decideReview(max, review.id, "published", "Ordinary demonstration review.");
  const verified = submitReview(rory, { listingId: ids.get("Bottleglass Metrics") ?? loom, rating: 5, title: "Checked against a fake order", body: "This fictional note exists so the verified-customer label has a visible verification sentence." });
  decideReview(max, verified.id, "published", "Publish first, then verify.");
  verifyCustomerReview(max, verified.id, "Demo moderator checked fictional order Q-1001. This is not a real customer.");
  submitReview(jules, { listingId: ids.get("Commonroom Desk") ?? loom, rating: 3, title: "Waiting in the queue", body: "A fictional review that should remain hidden until a moderator publishes it." });

  fileClaim(rory, {
    listingId: imported.listingId,
    evidence: "Fictional evidence packet Q-2002. Rory attached a made-up letter and a sample invoice. Email was not used as proof.",
    evidenceUrl: "https://evidence.example/q-2002",
  });

  const article = saveArticle(max, {
    title: "How to read a listing",
    dek: "A short guide to prices, attributes, ownership, and the sponsored label.",
    body: "Start with the category, then the price model, then the attributes that belong to that category.\n\nOwnership is a separate fact from the provider name. If the page says ownership is not claimed, the name is only a label.\n\nSponsored entries say so, and they carry an end date.",
    listingSlugs: ["loomline-census", "bottleglass-metrics"],
  });
  setArticleStatus(max, article.id, "published");
  const second = saveArticle(ada, {
    title: "A service is not software with a calendar",
    dek: "Why implementation entries use engagement and weeks instead of deployment.",
    body: "Software listings carry deployment and API fields. Service listings carry engagement type.\n\nComparing them is useful only where the fields overlap: price, provider, and whether ownership has been recorded.",
    listingSlugs: ["harbor-hex-cutover", "loomline-census"],
  });
  setArticleStatus(ada, second.id, "published");
  saveArticle(ada, { title: "Unpublished desk note", dek: "This draft should not appear on the public journal.", body: "Internal demonstration draft.\n\nIt has no public URL.", listingSlugs: [] });

  const collection = createCollection(sam, "Short list");
  addToCollection(sam, collection.id, loom);
  addToCollection(sam, collection.id, ids.get("Harbor Hex Cutover") ?? loom);

  setSetting("demo_banner", "1");
  setSetting("demo_banner_text", "Demonstration catalog. Every organization, listing, and review in this database is fictional.");
  run("INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, 'seed.complete', 'catalog', 'quire', 'Loaded the fictional demonstration issue.', ?)", [randomUUID(), ada.id, new Date().toISOString()]);
  console.log("Seeded Quire. Sign in with demo-quire-2026.");
  console.log("Unused draft id", draft.listingId);
  closeDatabase();
}

main();
