import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit } from "./audit";
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "./constants";
import { parseCsv, serializeCsv } from "./csv";
import { all, get, run, withTransaction } from "./db";
import { AppError } from "./errors";
import { contentHashForInput, createImportedListing, findListingByExternalKey, proposeRevision } from "./listings";
import { getOrganizationBySlug } from "./orgs";
import { canAdminister } from "./permissions";
import { getCategoryBySlug } from "./taxonomy";
import { nowIso } from "./text";
import type { Actor, ListingInput, PriceModel } from "./types";

export type ColumnMapping = {
  title: string;
  dedupe_key: string;
  category_slug: string;
  kind: string;
  summary: string;
  body?: string;
  website?: string;
  provider_name?: string;
  organization_slug?: string;
  price_model?: string;
  price_amount?: string;
  price_currency?: string;
  price_interval?: string;
  price_label?: string;
  tags?: string;
  attributes?: Record<string, string>;
};

export type ImportResult = {
  batchId: string;
  imported: number;
  duplicates: number;
  invalid: number;
  rows: Array<{ rowNumber: number; dedupeKey: string; status: string; errors: string; message: string }>;
};

type Classified = {
  rowNumber: number;
  dedupeKey: string;
  status: string;
  errors: string;
  message: string;
  listingId?: string;
  input?: ListingInput & { externalKey: string; providerLabel?: string; organizationId?: string | null };
};

function assertAdmin(actor: Actor): void {
  if (!canAdminister(actor)) throw new AppError("Administrator permission required.", "forbidden");
}

function cell(row: string[], headers: string[], header?: string): string {
  if (!header) return "";
  const index = headers.indexOf(header);
  if (index < 0) return "";
  return (row[index] ?? "").trim();
}

function failBatch(actor: Actor, filename: string, byteSize: number, summary: string): void {
  run(
    `INSERT INTO import_batches
      (id, filename, mode, strategy, on_duplicate, status, created_by_user_id, byte_size, summary, created_at)
     VALUES (?, ?, 'commit', 'all_or_nothing', 'skip', 'failed', ?, ?, ?, ?)`,
    [randomUUID(), filename.slice(0, 180), actor.id, byteSize, summary, nowIso()],
  );
}

export function saveImportUpload(actor: Actor, filename: string, bytes: Buffer): { id: string } {
  assertAdmin(actor);
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    failBatch(actor, filename, bytes.byteLength, "File exceeds 1 MB.");
    throw new AppError("CSV files must be 1 MB or smaller.", "file_size");
  }
  const id = randomUUID();
  const dir = path.join(process.cwd(), "data", "imports");
  fs.mkdirSync(dir, { recursive: true });
  const stored = path.join(dir, `${id}.csv`);
  fs.writeFileSync(stored, bytes);
  run(
    `INSERT INTO import_batches
      (id, filename, stored_path, mode, strategy, on_duplicate, status, created_by_user_id, byte_size, summary, created_at)
     VALUES (?, ?, ?, 'dry_run', 'all_or_nothing', 'skip', 'preview', ?, ?, 'Uploaded. Mapping has not run.', ?)`,
    [id, path.basename(filename).slice(0, 180), stored, actor.id, bytes.byteLength, nowIso()],
  );
  return { id };
}

export function readImportUpload(id: string): string {
  const row = get<{ stored_path: string | null }>("SELECT stored_path FROM import_batches WHERE id = ?", [id]);
  const root = path.join(process.cwd(), "data", "imports");
  if (!row?.stored_path || path.dirname(row.stored_path) !== root) throw new AppError("Import file not found.", "missing");
  return fs.readFileSync(row.stored_path, "utf8");
}

export function runImport(
  actor: Actor,
  request: {
    filename: string;
    csv: string;
    mapping: ColumnMapping;
    mode: "dry_run" | "commit";
    strategy: "all_or_nothing" | "partial";
    onDuplicate: "skip" | "revise";
  },
): ImportResult {
  assertAdmin(actor);
  const byteSize = Buffer.byteLength(request.csv, "utf8");
  if (byteSize > MAX_IMPORT_BYTES) {
    failBatch(actor, request.filename, byteSize, "File exceeds 1 MB.");
    throw new AppError("CSV files must be 1 MB or smaller.", "file_size");
  }
  if (request.csv.includes("\u0000")) throw new AppError("The file is not valid CSV text.", "csv");
  const table = parseCsv(request.csv);
  if (table.length < 2) throw new AppError("The CSV needs a header and at least one row.", "csv");
  const headers = table[0].map((header) => header.trim());
  const required = [request.mapping.title, request.mapping.dedupe_key, request.mapping.category_slug, request.mapping.kind, request.mapping.summary];
  if (required.some((header) => !header || !headers.includes(header))) {
    throw new AppError("Map title, dedupe key, category slug, kind, and summary to CSV headers.", "mapping");
  }
  const data = table.slice(1);
  if (data.length > MAX_IMPORT_ROWS) {
    failBatch(actor, request.filename, byteSize, "Too many rows.");
    throw new AppError(`CSV imports are limited to ${MAX_IMPORT_ROWS} rows.`, "rows");
  }

  const seen = new Set<string>();
  const classified: Classified[] = data.map((row, index) => {
    const rowNumber = index + 2;
    const dedupeKey = cell(row, headers, request.mapping.dedupe_key);
    if (dedupeKey && seen.has(dedupeKey)) {
      return { rowNumber, dedupeKey, status: "duplicate", errors: "", message: "Repeated dedupe key in this file." };
    }
    if (dedupeKey) seen.add(dedupeKey);
    const problems: string[] = [];
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(dedupeKey)) problems.push("Dedupe key is missing or invalid.");
    const kindValue = cell(row, headers, request.mapping.kind);
    const category = getCategoryBySlug(cell(row, headers, request.mapping.category_slug));
    if (kindValue !== "software" && kindValue !== "service") problems.push("Kind must be software or service.");
    if (!category) problems.push("Category slug was not found.");
    const organizationSlug = cell(row, headers, request.mapping.organization_slug);
    const organization = organizationSlug ? getOrganizationBySlug(organizationSlug) : undefined;
    if (organizationSlug && !organization) problems.push("Organization slug was not found.");
    if (problems.length) return { rowNumber, dedupeKey, status: "invalid", errors: problems.join("; "), message: "Row failed validation." };

    const attributes: Record<string, string> = {};
    for (const [key, header] of Object.entries(request.mapping.attributes ?? {})) attributes[key] = cell(row, headers, header);
    const input: ListingInput & { externalKey: string; providerLabel?: string; organizationId?: string | null } = {
      title: cell(row, headers, request.mapping.title),
      summary: cell(row, headers, request.mapping.summary),
      body: cell(row, headers, request.mapping.body),
      website: cell(row, headers, request.mapping.website),
      kind: kindValue as "software" | "service",
      categoryId: category!.id,
      externalKey: dedupeKey,
      providerLabel: cell(row, headers, request.mapping.provider_name),
      organizationId: organization?.id ?? null,
      prices: [
        {
          label: cell(row, headers, request.mapping.price_label) || "Price",
          model: (cell(row, headers, request.mapping.price_model) || "contact") as PriceModel,
          amount: cell(row, headers, request.mapping.price_amount),
          currency: cell(row, headers, request.mapping.price_currency) || "USD",
          interval: (cell(row, headers, request.mapping.price_interval) || "") as "" | "month" | "year",
          notes: "",
        },
      ],
      tags: cell(row, headers, request.mapping.tags)
        .split(/[|,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      attributes,
      images: [],
    };
    try {
      const hash = contentHashForInput(input);
      const existing = findListingByExternalKey(dedupeKey);
      if (!existing) return { rowNumber, dedupeKey, status: "ready", errors: "", message: "Ready to import as a submitted listing.", input };
      const current = get<{ content_hash: string }>(
        existing.published_revision_id
          ? "SELECT content_hash FROM listing_revisions WHERE id = ?"
          : "SELECT content_hash FROM listing_revisions WHERE listing_id = ? ORDER BY revision_number DESC LIMIT 1",
        [existing.published_revision_id ?? existing.id],
      );
      if (current?.content_hash === hash) {
        return { rowNumber, dedupeKey, status: "duplicate", errors: "", message: "Duplicate of an existing listing. Content is unchanged." };
      }
      const open = get("SELECT id FROM listing_revisions WHERE listing_id = ? AND status = 'submitted' AND id != COALESCE(?, '')", [
        existing.id,
        existing.published_revision_id,
      ]);
      if (request.onDuplicate === "revise" && existing.status === "published" && !open) {
        return { rowNumber, dedupeKey, status: "revise", errors: "", message: "Would open a revision. The published version stays visible.", input, listingId: existing.id };
      }
      return {
        rowNumber,
        dedupeKey,
        status: "duplicate",
        errors: "",
        message: open ? "Duplicate. A revision is already waiting for review." : "Duplicate of an existing listing. Content differs and was left unchanged.",
      };
    } catch (error) {
      return { rowNumber, dedupeKey, status: "invalid", errors: error instanceof Error ? error.message : "Invalid row.", message: "Row failed validation." };
    }
  });

  const invalidCount = classified.filter((row) => row.status === "invalid").length;
  const block = request.strategy === "all_or_nothing" && invalidCount > 0;
  const batchId = randomUUID();
  let imported = 0;
  let duplicates = 0;
  const written: Classified[] = [];
  withTransaction(() => {
    run(
      `INSERT INTO import_batches
        (id, filename, mode, strategy, on_duplicate, status, created_by_user_id, byte_size, row_count, imported_count, duplicate_count, invalid_count, summary, mapping_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, 0, 0, ?, 'Import started.', ?, ?)`,
      [
        batchId,
        request.filename.slice(0, 180),
        request.mode,
        request.strategy,
        request.onDuplicate,
        actor.id,
        byteSize,
        data.length,
        invalidCount,
        JSON.stringify(request.mapping),
        nowIso(),
      ],
    );
    for (const row of classified) {
      let status = row.status;
      let message = row.message;
      if (row.status === "duplicate") duplicates += 1;
      if (block && (row.status === "ready" || row.status === "revise")) {
        status = "skipped";
        message = "Skipped because the batch has invalid rows and the strategy is all-or-nothing.";
      } else if (request.mode === "dry_run" && (row.status === "ready" || row.status === "revise")) {
        status = "valid";
      } else if (request.mode === "commit" && row.status === "ready" && row.input) {
        createImportedListing(actor, row.input);
        status = "imported";
        message = "Imported as a submitted listing. It is not published.";
        imported += 1;
      } else if (request.mode === "commit" && row.status === "revise" && row.input && row.listingId) {
        proposeRevision(actor, row.listingId, { ...row.input, changeNote: "Imported update for an existing dedupe key." }, { viaImport: true });
        status = "imported";
        message = "Opened a revision for review. The published version is unchanged.";
        imported += 1;
      }
      written.push({ ...row, status, message });
      run("INSERT INTO import_rows (id, batch_id, row_number, dedupe_key, status, errors, message) VALUES (?, ?, ?, ?, ?, ?, ?)", [
        randomUUID(),
        batchId,
        row.rowNumber,
        row.dedupeKey,
        status,
        row.errors,
        message,
      ]);
    }
    run(
      `UPDATE import_batches
       SET imported_count = ?, duplicate_count = ?, invalid_count = ?, summary = ?
       WHERE id = ?`,
      [
        imported,
        duplicates,
        invalidCount,
        request.mode === "dry_run" ? "Dry run. No listings were written." : block ? "No listings were written because the batch contained invalid rows." : "Import finished.",
        batchId,
      ],
    );
    audit(actor.id, request.mode === "dry_run" ? "import.dry_run" : "import.commit", "import_batch", batchId, `${imported} imported, ${duplicates} duplicates, ${invalidCount} invalid.`);
  });
  return {
    batchId,
    imported,
    duplicates,
    invalid: invalidCount,
    rows: written.map((row) => ({ rowNumber: row.rowNumber, dedupeKey: row.dedupeKey, status: row.status, errors: row.errors, message: row.message })),
  };
}

export function listImportBatches(): Array<Record<string, unknown>> {
  return all("SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 50");
}

export function listImportRows(batchId: string): Array<Record<string, unknown>> {
  return all("SELECT * FROM import_rows WHERE batch_id = ? ORDER BY row_number", [batchId]);
}

export function exportPublishedListingsCsv(): string {
  const rows = all<{
    external_key: string | null;
    slug: string;
    title: string;
    summary: string;
    kind: string;
    category_slug: string;
    status: string;
    provider_label: string | null;
    organization_name: string | null;
    is_demo: number;
  }>(
    `SELECT l.external_key, l.slug, r.title, r.summary, l.kind, c.slug AS category_slug, l.status, l.provider_label, o.name AS organization_name, l.is_demo
     FROM listings l
     JOIN listing_revisions r ON r.id = l.published_revision_id
     JOIN categories c ON c.id = r.category_id
     LEFT JOIN organizations o ON o.id = l.organization_id
     WHERE l.status = 'published'
     ORDER BY r.title COLLATE NOCASE`,
  );
  return serializeCsv([
    ["dedupe_key", "slug", "title", "summary", "kind", "category_slug", "status", "provider", "is_demo"],
    ...rows.map((row) => [
      row.external_key ?? "",
      row.slug,
      row.title,
      row.summary,
      row.kind,
      row.category_slug,
      row.status,
      row.organization_name ?? row.provider_label ?? "",
      row.is_demo ? "1" : "0",
    ]),
  ]);
}
