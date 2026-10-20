import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { listImportBatches } from "@/lib/imports";
import { takeNotice } from "@/lib/notices";
import { canAdminister } from "@/lib/permissions";
import { uploadImportAction } from "@/server/actions";
import { currentActor } from "@/server/session";

export default async function ImportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor || !canAdminister(actor)) redirect("/admin");
  const raw = await searchParams;
  const batches = listImportBatches();
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p>CSV uploads are limited to 1 MB and 500 rows. Imports create submitted listings. They do not publish and they do not grant ownership.</p>
      <p><a href="/api/export/listings">Download a formula-safe CSV of published listings</a></p>
      <form className="form" action={uploadImportAction}>
        <label>CSV file<input name="file" type="file" accept=".csv,text/csv" required /></label>
        <button type="submit">Upload and map columns</button>
      </form>
      <h2>History</h2>
      <ul>
        {batches.map((batch) => (
          <li key={String(batch.id)}>
            <Link href={`/admin/imports/${String(batch.id)}`}>{String(batch.filename)}</Link>
            {" · "}{String(batch.mode)} · {String(batch.status)} · imported {String(batch.imported_count)} · duplicates {String(batch.duplicate_count)} · invalid {String(batch.invalid_count)}
          </li>
        ))}
      </ul>
    </>
  );
}
