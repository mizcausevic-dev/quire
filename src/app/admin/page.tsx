import Link from "next/link";
import { Notice } from "@/components/notice";
import { moderationQueue } from "@/lib/moderation";
import { takeNotice } from "@/lib/notices";

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const queue = moderationQueue();
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <div className="panel">
        <h2>New submissions</h2>
        <ul>{queue.submissions.map((item) => <li key={item.revision_id}><Link href={`/admin/listings/${item.listing_id}`}>{item.title}</Link></li>)}</ul>
      </div>
      <div className="panel">
        <h2>Revisions to published listings</h2>
        <p>The public copy stays up while these wait.</p>
        <ul>{queue.revisions.map((item) => <li key={item.revision_id}><Link href={`/admin/listings/${item.listing_id}`}>{item.title}</Link> · {item.change_note}</li>)}</ul>
      </div>
      <div className="panel">
        <h2>Other queues</h2>
        <p><Link href="/admin/claims">{queue.claims.length} claims</Link> · <Link href="/admin/reviews">{queue.reviews.length} reviews, {queue.reports.length} reports</Link></p>
      </div>
    </>
  );
}
