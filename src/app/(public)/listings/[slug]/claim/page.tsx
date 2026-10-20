import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { getPublicListing } from "@/lib/listings";
import { takeNotice } from "@/lib/notices";
import { listOrganizationsForUser } from "@/lib/orgs";
import { robotsFor } from "@/lib/seo";
import { claimAction } from "@/server/actions";
import { currentActor } from "@/server/session";

export const metadata: Metadata = { title: "Claim a listing", robots: robotsFor({ indexable: false }) };

export default async function ClaimPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const actor = await currentActor();
  if (!actor) redirect(`/login?next=/listings/${slug}/claim`);
  const listing = getPublicListing(slug);
  if (!listing || listing.status !== "published") notFound();
  const raw = await searchParams;
  const organizations = listOrganizationsForUser(actor.id).filter((org) => org.role === "owner" || org.role === "editor");
  return (
    <div className="wrap">
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <h1>Claim {listing.title}</h1>
      <p>This stays pending until a moderator reviews the evidence. An email address is not accepted as proof, even when it resembles the provider's domain.</p>
      <form className="form" action={claimAction}>
        <input type="hidden" name="listingId" value={listing.id} />
        <input type="hidden" name="slug" value={listing.slug} />
        {organizations.length > 0 ? (
          <label>
            Organization
            <select name="organizationId" defaultValue="">
              <option value="">Claim as yourself</option>
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
        ) : null}
        <label>Evidence<textarea name="evidence" required minLength={40} /></label>
        <label>Evidence link<input name="evidenceUrl" type="url" placeholder="https://" /></label>
        <button type="submit">File claim</button>
      </form>
    </div>
  );
}
