import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUser } from "../src/lib/auth.ts";
import { ensurePlans } from "../src/lib/billing.ts";
import { closeDatabase, get, migrate } from "../src/lib/db.ts";
import { approveRevision, createListing, submitListing } from "../src/lib/listings.ts";
import { saveAttributeDefinition, saveCategory, saveTag } from "../src/lib/taxonomy.ts";
import type { Actor, ListingInput } from "../src/lib/types.ts";

export function withDb(fn: () => void): void {
  const dir = mkdtempSync(join(tmpdir(), "quire-"));
  const previous = {
    QUIRE_DB_PATH: process.env.QUIRE_DB_PATH,
    QUIRE_DEMO_NOINDEX: process.env.QUIRE_DEMO_NOINDEX,
    BILLING_WEBHOOK_SECRET: process.env.BILLING_WEBHOOK_SECRET,
    QUIRE_SEED: process.env.QUIRE_SEED,
  };
  process.env.QUIRE_DB_PATH = join(dir, "quire.sqlite");
  process.env.QUIRE_DEMO_NOINDEX = "0";
  delete process.env.BILLING_WEBHOOK_SECRET;
  delete process.env.QUIRE_SEED;
  closeDatabase();
  try {
    migrate();
    ensurePlans();
    fn();
  } finally {
    closeDatabase();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

export function makeUser(role: Actor["role"], email?: string): Actor {
  return createUser({
    email: email ?? `${role}-${crypto.randomUUID().slice(0, 8)}@quire.test`,
    name: role === "administrator" ? "Ada Editor" : role === "moderator" ? "Max Moderator" : "Lina Provider",
    password: "demo-quire-2026",
    role,
    acceptPrivacy: true,
  });
}

export function buildTaxonomy(admin: Actor) {
  const software = saveCategory(admin, { name: "Software", kind: "software", description: "Software products in the catalog.", sortOrder: 1 });
  const analytics = saveCategory(admin, { name: "Analytics", kind: "software", parentId: software.id, description: "Measurement and reporting products.", sortOrder: 2 });
  const services = saveCategory(admin, { name: "Services", kind: "service", description: "Service practices in the catalog.", sortOrder: 3 });
  const implementation = saveCategory(admin, { name: "Implementation", kind: "service", parentId: services.id, description: "Rollout and migration practices.", sortOrder: 4 });
  saveAttributeDefinition(admin, {
    categoryId: software.id,
    key: "deployment",
    label: "Deployment",
    valueType: "enum",
    enumOptions: ["cloud", "self-hosted", "hybrid"],
    required: true,
    filterable: true,
  });
  saveAttributeDefinition(admin, { categoryId: software.id, key: "has_api", label: "Has API", valueType: "boolean", filterable: true });
  saveAttributeDefinition(admin, { categoryId: implementation.id, key: "typical_weeks", label: "Typical weeks", valueType: "number", filterable: true, unit: "weeks" });
  saveTag(admin, "API");
  return { software, analytics, services, implementation };
}

export function softwareInput(categoryId: string, title: string, deployment = "cloud"): ListingInput {
  return {
    title,
    summary: `Fictional catalog entry for ${title}, written long enough to submit.`,
    body: `${title} is a fictional product used to exercise the catalog.`,
    website: "https://example.test/product",
    kind: "software",
    categoryId,
    prices: [{ label: "Team", model: "subscription", amount: "20", currency: "USD", interval: "month", notes: "" }],
    tags: ["api"],
    attributes: { deployment, has_api: "true" },
    images: [],
  };
}

export function publishSoftware(submitter: Actor, moderator: Actor, categoryId: string, title: string, deployment = "cloud", organizationId?: string): string {
  const created = createListing(submitter, { ...softwareInput(categoryId, title, deployment), organizationId });
  submitListing(submitter, created.listingId);
  const revision = get<{ id: string }>("SELECT id FROM listing_revisions WHERE listing_id = ? AND status = 'submitted'", [created.listingId]);
  if (!revision) throw new Error("missing revision");
  approveRevision(moderator, revision.id, "Approved for the catalog.");
  return created.listingId;
}
