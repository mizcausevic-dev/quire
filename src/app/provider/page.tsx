import Link from "next/link";
import { Notice } from "@/components/notice";
import { getBillingSnapshot } from "@/lib/billing";
import { listProviderListings } from "@/lib/listings";
import { takeNotice } from "@/lib/notices";
import { listOrganizationsForUser } from "@/lib/orgs";
import { currentActor } from "@/server/session";

export default async function ProviderHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor) return null;
  const raw = await searchParams;
  const listings = listProviderListings(actor.id);
  const organizations = listOrganizationsForUser(actor.id);
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p>You see listings you submitted or that an organization you belong to owns. Membership alone does not list anyone else's catalog.</p>
      <div className="panel">
        <h2>Organizations</h2>
        <ul>
          {organizations.map((org) => {
            const billing = org.role === "owner" || org.role === "billing" ? getBillingSnapshot(org.id) : null;
            return <li key={org.id}>{org.name} · {org.role}{billing ? ` · ${billing.planName}${billing.active ? "" : " (free capacity)"}` : ""}</li>;
          })}
          {organizations.length === 0 ? <li>No organization yet. Create one before attaching new listings to a provider.</li> : null}
        </ul>
      </div>
      <div className="panel">
        <h2>Listings</h2>
        <ul>
          {listings.map((listing) => <li key={listing.id}><Link href={`/provider/listings/${listing.id}`}>{listing.title}</Link> · <span className="status">{listing.status}</span></li>)}
        </ul>
      </div>
    </>
  );
}
