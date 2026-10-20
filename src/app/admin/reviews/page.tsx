import { all } from "@/lib/db";
import { decideReviewAction, resolveReportAction } from "@/server/actions";

export default async function ReviewsAdminPage() {
  const reviews = all<{ id: string; title: string; body: string; status: string; relationship: string; slug: string; name: string }>(
    `SELECT r.id, r.title, r.body, r.status, r.relationship, l.slug, u.name
     FROM reviews r JOIN listings l ON l.id = r.listing_id JOIN users u ON u.id = r.author_user_id
     ORDER BY r.created_at DESC LIMIT 40`,
  );
  const reports = all<{ id: string; reason: string; details: string; title: string }>(
    `SELECT rr.id, rr.reason, rr.details, r.title FROM review_reports rr JOIN reviews r ON r.id = rr.review_id WHERE rr.status = 'open'`,
  );
  return (
    <>
      <h2>Reports</h2>
      {reports.map((report) => (
        <form className="panel" action={resolveReportAction} key={report.id}>
          <p>{report.title} · {report.reason}</p>
          <p>{report.details}</p>
          <input type="hidden" name="reportId" value={report.id} />
          <label>Note<textarea name="note" required minLength={5} /></label>
          <button name="decision" value="actioned" type="submit">Remove review</button>
          <button name="decision" value="dismissed" className="secondary" type="submit">Dismiss</button>
        </form>
      ))}
      <h2>Reviews</h2>
      {reviews.map((review) => (
        <article className="panel" key={review.id}>
          <p className="status">{review.status} · {review.relationship} · {review.slug}</p>
          <h3>{review.title}</h3>
          <p>{review.body}</p>
          <p>{review.name}</p>
          {review.status === "pending" ? (
            <form action={decideReviewAction}>
              <input type="hidden" name="reviewId" value={review.id} />
              <label>Note<textarea name="note" /></label>
              <button name="decision" value="published" type="submit">Publish as ordinary</button>
              <button name="decision" value="rejected" className="secondary" type="submit">Reject</button>
            </form>
          ) : null}
          {review.status === "published" && review.relationship !== "verified_customer" ? (
            <form action={decideReviewAction}>
              <input type="hidden" name="reviewId" value={review.id} />
              <input type="hidden" name="decision" value="verify" />
              <label>Verification note<textarea name="note" required minLength={15} placeholder="What was checked?" /></label>
              <button type="submit">Mark verified customer</button>
            </form>
          ) : null}
        </article>
      ))}
    </>
  );
}
