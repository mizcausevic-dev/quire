import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { Notice } from "@/components/notice";
import { listCollections } from "@/lib/collections";
import { breadcrumbJsonLd, listingJsonLd } from "@/lib/jsonld";
import { getPublicListing } from "@/lib/listings";
import { takeNotice } from "@/lib/notices";
import { findRedirect } from "@/lib/redirects";
import { reportAction, reviewAction, collectionAction } from "@/server/actions";
import { canonicalUrl, robotsFor } from "@/lib/seo";
import { siteOrigin } from "@/lib/settings";
import { livePlacementForListing } from "@/lib/sponsorship";
import { paragraphs } from "@/lib/text";
import { currentActor } from "@/server/session";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const listing = getPublicListing(slug);
  return {
    title: listing?.title ?? "Listing",
    description: listing?.summary ?? "Catalog listing.",
    alternates: { canonical: canonicalUrl(`/listings/${listing?.slug ?? slug}`) },
    robots: robotsFor({ indexable: Boolean(listing?.indexable) }),
  };
}

export default async function ListingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const listing = getPublicListing(slug);
  if (!listing) {
    const target = findRedirect(`/listings/${slug}`);
    if (target) permanentRedirect(target);
    notFound();
  }
  const raw = await searchParams;
  const actor = await currentActor();
  const sponsorship = listing.status === "published" ? livePlacementForListing(listing.id) : null;
  const origin = siteOrigin();
  const crumbs = [
    { name: "Quire", path: "/" },
    ...(listing.parentSlug ? [{ name: listing.parentName ?? "Category", path: `/categories/${listing.parentSlug}` }] : []),
    { name: listing.categoryName, path: `/categories/${listing.categorySlug}` },
    { name: listing.title, path: `/listings/${listing.slug}` },
  ];
  const collections = actor ? listCollections(actor.id) : [];
  return (
    <div className="wrap">
      <JsonLd data={[
        breadcrumbJsonLd(origin, crumbs),
        listingJsonLd({
          origin,
          path: `/listings/${listing.slug}`,
          kind: listing.kind,
          title: listing.title,
          summary: listing.summary,
          categoryName: listing.categoryName,
          providerName: listing.providerName,
          offers: listing.prices.map((price) => ({ name: price.label, model: price.model, price: price.amountCents ?? undefined, currency: price.currency })),
        }),
      ]} />
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <article className="detail">
        <div>
          <p className="crumbs">{crumbs.slice(0, -1).map((crumb) => <span key={crumb.path}><Link href={crumb.path}>{crumb.name}</Link> / </span>)}</p>
          <p className="kicker">{listing.kind} · {listing.categoryName}{listing.isDemo ? " · Fictional" : ""}</p>
          <h1>{listing.title}</h1>
          <p className="dek">{listing.summary}</p>
          {listing.status === "archived" ? <p className="notice">This entry is archived. It stays at this address for reference and is excluded from search and the sitemap.</p> : null}
          {sponsorship ? <p className="sponsored"><strong>{sponsorship.disclosure}</strong> · scheduled through {sponsorship.ends_at.slice(0, 10)} · placement: {sponsorship.placement}</p> : null}
          <div className="prose">{paragraphs(listing.body).map((paragraph) => <p key={paragraph.slice(0, 24)}>{paragraph}</p>)}</div>
          {listing.images.map((image) => (
            <figure className="shot" key={image.path}>
              <img src={image.path} alt={image.alt} />
            </figure>
          ))}
          <h2>Reviews</h2>
          {listing.reviews.length === 0 ? <p>No published reviews.</p> : listing.reviews.map((review) => (
            <article className="review" key={review.id}>
              <p className="kicker">{review.relationship === "verified_customer" ? "Verified customer" : "Review"} · {review.rating}/5</p>
              <h3>{review.title}</h3>
              <p>{review.body}</p>
              <p className="meta">{review.authorName}</p>
              {review.verificationNote ? <p className="verified">{review.verificationNote}</p> : null}
              {actor ? (
                <form action={reportAction}>
                  <input type="hidden" name="reviewId" value={review.id} />
                  <input type="hidden" name="slug" value={listing.slug} />
                  <label>
                    Report
                    <select name="reason" defaultValue="spam">
                      <option value="spam">Spam</option>
                      <option value="conflict">Conflict of interest</option>
                      <option value="personal_data">Personal data</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label>Details<input name="details" /></label>
                  <button className="secondary" type="submit">Report review</button>
                </form>
              ) : null}
            </article>
          ))}
          {actor && listing.status === "published" ? (
            <form className="form" action={reviewAction}>
              <h2>Write a review</h2>
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="slug" value={listing.slug} />
              <label>Rating
                <select name="rating" defaultValue="5">
                  {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating}</option>)}
                </select>
              </label>
              <label>Title<input name="title" required /></label>
              <label>Review<textarea name="body" required /></label>
              <p className="meta">Your review is ordinary until a moderator checks it. You cannot mark it verified.</p>
              <button type="submit">Submit review</button>
            </form>
          ) : null}
        </div>
        <aside>
          <dl className="facts">
          <div><dt>Provider</dt><dd>{listing.providerName ?? "Not named"}</dd></div>
          <div><dt>Ownership</dt><dd>{listing.ownershipClaimed ? "Recorded" : "Not claimed"}</dd></div>
          {listing.prices.map((price) => <div key={price.label}><dt>{price.label}</dt><dd>{price.text}</dd></div>)}
          {listing.attributes.map((attribute) => <div key={attribute.key}><dt>{attribute.label}</dt><dd>{attribute.display}</dd></div>)}
          <div><dt>Tags</dt><dd>{listing.tags.map((tag) => tag.name).join(", ") || "None"}</dd></div>
          {listing.website ? <div><dt>Website</dt><dd><a href={listing.website}>{listing.website}</a></dd></div> : null}
          <div><dt>Compare</dt><dd><Link href={`/compare?ids=${listing.slug}`}>Add this entry</Link></dd></div>
          {listing.status === "published" ? <div><dt>Claim</dt><dd><Link href={`/listings/${listing.slug}/claim`}>Request ownership</Link></dd></div> : null}
          {listing.articles.length > 0 ? (
            <div>
              <dt>Journal</dt>
              <dd>{listing.articles.map((article) => <span key={article.slug}><Link href={`/articles/${article.slug}`}>{article.title}</Link><br /></span>)}</dd>
            </div>
          ) : null}
          </dl>
          {actor && collections.length > 0 ? (
            <form action={collectionAction}>
              <input type="hidden" name="intent" value="add" />
              <input type="hidden" name="listingId" value={listing.id} />
              <label>Save to collection
                <select name="collectionId">{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select>
              </label>
              <button className="secondary" type="submit">Save</button>
            </form>
          ) : null}
        </aside>
      </article>
    </div>
  );
}
