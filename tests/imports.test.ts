import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, neutralizeSpreadsheetFormula } from "../src/lib/csv.ts";
import { get } from "../src/lib/db.ts";
import { AppError } from "../src/lib/errors.ts";
import { exportPublishedListingsCsv, runImport, type ColumnMapping } from "../src/lib/imports.ts";
import { approveRevision, getPublicListing } from "../src/lib/listings.ts";
import { buildTaxonomy, makeUser, publishSoftware, withDb } from "./helpers.ts";

const mapping: ColumnMapping = {
  title: "title",
  dedupe_key: "dedupe_key",
  category_slug: "category_slug",
  kind: "kind",
  summary: "summary",
  price_model: "price_model",
  price_amount: "price_amount",
  price_currency: "price_currency",
  price_interval: "price_interval",
  tags: "tags",
  attributes: { deployment: "deployment" },
};

function csv(rows: string[][]): string {
  return [["title", "dedupe_key", "category_slug", "kind", "summary", "price_model", "price_amount", "price_currency", "price_interval", "tags", "deployment"], ...rows]
    .map((row) => row.join(","))
    .join("\n");
}

const valid = ["Valid Tool", "key-1", "analytics", "software", "Fictional catalog entry with enough summary text.", "subscription", "15", "USD", "month", "api", "cloud"];
const invalid = ["Bad Tool", "key-2", "missing", "software", "Fictional catalog entry with enough summary text.", "free", "", "USD", "", "api", "cloud"];
const repeat = ["Valid Tool Again", "key-1", "analytics", "software", "Fictional catalog entry with enough summary text.", "subscription", "15", "USD", "month", "api", "cloud"];

test("csv parsing keeps quoted commas and doubled quotes", () => {
  const rows = parseCsv('name,note\n"Loom, Inc","She said ""hello"""\n');
  assert.deepEqual(rows, [["name", "note"], ["Loom, Inc", 'She said "hello"']]);
});

test("import reports invalid and duplicate rows and does not publish them", () => {
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    buildTaxonomy(admin);
    const blocked = runImport(admin, {
      filename: "batch.csv",
      csv: csv([valid, invalid, repeat]),
      mapping,
      mode: "commit",
      strategy: "all_or_nothing",
      onDuplicate: "skip",
    });
    assert.equal(blocked.imported, 0);
    assert.equal(blocked.invalid, 1);
    assert.equal(blocked.duplicates, 1);
    assert.equal(blocked.rows.find((row) => row.dedupeKey === "key-2")?.status, "invalid");
    assert.match(blocked.rows.find((row) => row.dedupeKey === "key-2")?.errors ?? "", /Category/);
    assert.equal(blocked.rows.find((row) => row.rowNumber === 2)?.status, "skipped");
    assert.equal(blocked.rows.find((row) => row.rowNumber === 4)?.status, "duplicate");
    assert.equal(get<{ count: number }>("SELECT COUNT(*) AS count FROM listings")?.count, 0);

    const partial = runImport(admin, {
      filename: "partial.csv",
      csv: csv([valid, invalid]),
      mapping,
      mode: "commit",
      strategy: "partial",
      onDuplicate: "skip",
    });
    assert.equal(partial.imported, 1);
    assert.equal(partial.invalid, 1);
    const listing = get<{ status: string; slug: string }>("SELECT status, slug FROM listings WHERE external_key = 'key-1'");
    assert.equal(listing?.status, "submitted");
    assert.equal(getPublicListing(listing?.slug ?? ""), null);

    const dry = runImport(admin, {
      filename: "dry.csv",
      csv: csv([["Second Tool", "key-9", "analytics", "software", "Fictional catalog entry with enough summary text.", "free", "", "USD", "", "api", "cloud"]]),
      mapping,
      mode: "dry_run",
      strategy: "partial",
      onDuplicate: "skip",
    });
    assert.equal(dry.imported, 0);
    assert.equal(dry.rows[0]?.status, "valid");
    assert.equal(get<{ count: number }>("SELECT COUNT(*) AS count FROM listings WHERE external_key = 'key-9'")?.count, 0);

    const again = runImport(admin, {
      filename: "again.csv",
      csv: csv([valid]),
      mapping,
      mode: "commit",
      strategy: "partial",
      onDuplicate: "skip",
    });
    assert.equal(again.duplicates, 1);
    assert.equal(again.imported, 0);
    assert.match(again.rows[0]?.message ?? "", /unchanged/);

    const revisionId = get<{ id: string }>("SELECT id FROM listing_revisions WHERE listing_id = (SELECT id FROM listings WHERE external_key = 'key-1')");
    assert.ok(revisionId);
    approveRevision(moderator, revisionId.id, "Imported entry is publishable.");
    const changed = csv([["Valid Tool", "key-1", "analytics", "software", "Fictional catalog entry with a changed summary now.", "subscription", "15", "USD", "month", "api", "cloud"]]);
    const revised = runImport(admin, { filename: "revise.csv", csv: changed, mapping, mode: "commit", strategy: "partial", onDuplicate: "revise" });
    assert.equal(revised.imported, 1);
    const live = getPublicListing("valid-tool");
    assert.match(live?.summary ?? "", /enough summary text/);
    assert.equal(live?.status, "published");

    assert.throws(() => runImport(admin, { filename: "big.csv", csv: "a".repeat(1_000_001), mapping, mode: "dry_run", strategy: "partial", onDuplicate: "skip" }), (error: unknown) => error instanceof AppError && error.code === "file_size");
  });
});

test("csv export neutralizes spreadsheet formulas", () => {
  assert.equal(neutralizeSpreadsheetFormula("=1+1"), "'=1+1");
  withDb(() => {
    const admin = makeUser("administrator");
    const moderator = makeUser("moderator");
    const author = makeUser("user");
    const taxonomy = buildTaxonomy(admin);
    publishSoftware(author, moderator, taxonomy.analytics.id, "=1+1 Command");
    const exported = exportPublishedListingsCsv();
    assert.match(exported, /'=1\+1 Command/);
  });
});
