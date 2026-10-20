import { notFound, redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { previewCsv } from "@/lib/csv";
import { get } from "@/lib/db";
import { listImportRows, readImportUpload } from "@/lib/imports";
import { takeNotice } from "@/lib/notices";
import { canAdminister } from "@/lib/permissions";
import { runImportAction } from "@/server/actions";
import { currentActor } from "@/server/session";

const FIELDS = ["title", "dedupe_key", "category_slug", "kind", "summary", "body", "website", "provider_name", "organization_slug", "price_model", "price_amount", "price_currency", "price_interval", "price_label", "tags"];

export default async function ImportDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor || !canAdminister(actor)) redirect("/admin");
  const { id } = await params;
  const batch = get<{ id: string; status: string; filename: string; summary: string; stored_path: string | null }>("SELECT * FROM import_batches WHERE id = ?", [id]);
  if (!batch) notFound();
  const raw = await searchParams;
  const rows = listImportRows(id);
  let preview: { headers: string[]; sample: string[][] } | null = null;
  if (batch.stored_path) {
    try {
      preview = previewCsv(readImportUpload(id));
    } catch {
      preview = null;
    }
  }
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <h2>{batch.filename}</h2>
      <p>{batch.summary}</p>
      {preview ? (
        <form className="form" action={runImportAction}>
          <input type="hidden" name="uploadId" value={id} />
          {FIELDS.map((field) => (
            <label key={field}>{field}
              <select name={`map_${field}`} defaultValue={preview?.headers.includes(field) ? field : ""}>
                <option value="">Not mapped</option>
                {preview?.headers.map((header) => <option key={header}>{header}</option>)}
              </select>
            </label>
          ))}
          <label>Attribute key<input name="map_attribute_key" placeholder="deployment" /></label>
          <label>Attribute column
            <select name="map_attribute_header" defaultValue="">
              <option value="">Not mapped</option>
              {preview.headers.map((header) => <option key={header}>{header}</option>)}
            </select>
          </label>
          <label>If a row is invalid
            <select name="strategy" defaultValue="all_or_nothing">
              <option value="all_or_nothing">Write nothing</option>
              <option value="partial">Write the valid rows</option>
            </select>
          </label>
          <label>If the dedupe key exists
            <select name="onDuplicate" defaultValue="skip">
              <option value="skip">Skip</option>
              <option value="revise">Open a revision when the content changed</option>
            </select>
          </label>
          <button name="mode" value="dry_run" className="secondary" type="submit">Dry run</button>
          <button name="mode" value="commit" type="submit">Commit</button>
        </form>
      ) : null}
      {preview ? (
        <table>
          <caption>First rows</caption>
          <thead><tr>{preview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{preview.sample.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
        </table>
      ) : null}
      {rows.length > 0 ? (
        <table>
          <caption>Row results</caption>
          <thead><tr><th>Row</th><th>Key</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={String(row.id)}><td>{String(row.row_number)}</td><td>{String(row.dedupe_key ?? "")}</td><td>{String(row.status)}</td><td>{String(row.errors || row.message)}</td></tr>)}</tbody>
        </table>
      ) : null}
    </>
  );
}
