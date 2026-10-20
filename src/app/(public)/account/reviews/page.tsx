import Link from "next/link";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { currentActor } from "@/server/session";

export default async function ReviewsPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login?next=/account/reviews");
  const reviews = all<{ title: string; status: string; slug: string; relationship: string }>(
    `SELECT r.title, r.status, r.relationship, l.slug
     FROM reviews r JOIN listings l ON l.id = r.listing_id
     WHERE r.author_user_id = ? ORDER BY r.updated_at DESC`,
    [actor.id],
  );
  return (
    <div className="wrap">
      <h1>Your reviews</h1>
      <ul>
        {reviews.map((review) => (
          <li key={`${review.slug}-${review.title}`}>
            <Link href={`/listings/${review.slug}`}>{review.title}</Link> · {review.status} · {review.relationship === "verified_customer" ? "verified customer" : "ordinary"}
          </li>
        ))}
        {reviews.length === 0 ? <li>You have not submitted a review.</li> : null}
      </ul>
    </div>
  );
}
