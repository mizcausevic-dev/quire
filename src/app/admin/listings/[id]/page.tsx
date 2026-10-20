import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/notice";
import { getListing, listRevisions, revisionDiff } from "@/lib/listings";
import { takeNotice } from "@/lib/notices";
import { approveAction, archiveAction, rejectAction } from "@/server/actions";

export default async function AdminListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const listing = getListing(id);
  if (!listing) notFound();
  const revisions = listRevisions(id);
  const pending = revisions.find((revision) => revision.status === "submitted");
  const published = revisions.find((revision) => revision.id === listing.published_revision_id);
  const diff = pending && published ? revisionDiff(published.id, pending.id) : [];
  const raw = await searchParams;
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p className="status">{listing.status}</p>
      <h2>{pending?.title ?? published?.title ?? listing.slug}</h2>
      {listing.status === "published" ? <p><Link href={`/listings/${listing.slug}`}>Public page</Link></p> : null}
      {listing.rejection_reason ? <p>Last rejection: {listing.rejection_reason}</p> : null}
      {diff.length > 0 ? (
        <table>
          <caption>Changes waiting on the published version</caption>
          <thead><tr><th>Field</th><th>Published</th><th>Proposed</th></tr></thead>
          <tbody>
            {diff.map((row) => <tr key={row.field}><th scope="row">{row.field}</th><td>{row.before}</td><td>{row.after}</td></tr>)}
          </tbody>
        </table>
      ) : null}
      {pending ? (
        <form className="form" action={approveAction}>
          <input type="hidden" name="listingId" value={listing.id} />
          <input type="hidden" name="revisionId" value={pending.id} />
          <label>Approval note<textarea name="note" required minLength={5} /></label>
          <button type="submit">Approve</button>
        </form>
      ) : null}
      {pending ? (
        <form className="form" action={rejectAction}>
          <input type="hidden" name="listingId" value={listing.id} />
          <input type="hidden" name="revisionId" value={pending.id} />
          <label>Rejection reason<textarea name="note" required minLength={5} /></label>
          <button className="secondary" type="submit">Reject</button>
        </form>
      ) : null}
      {listing.status === "published" || listing.status === "archived" ? (
        <form className="form" action={archiveAction}>
          <input type="hidden" name="listingId" value={listing.id} />
          <input type="hidden" name="intent" value={listing.status === "archived" ? "restore" : "archive"} />
          <label>Note<textarea name="note" required minLength={5} /></label>
          <button className="secondary" type="submit">{listing.status === "archived" ? "Restore" : "Archive"}</button>
        </form>
      ) : null}
      <h3>History</h3>
      <ul>{revisions.map((revision) => <li key={revision.id}>r{revision.revision_number} · {revision.status} · {revision.title}</li>)}</ul>
    </>
  );
}
