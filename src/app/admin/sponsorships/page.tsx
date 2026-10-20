import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { canAdminister } from "@/lib/permissions";
import { listPlacements } from "@/lib/sponsorship";
import { placementIsLive } from "@/lib/sponsorship";
import { sponsorshipAction } from "@/server/actions";
import { currentActor } from "@/server/session";

export default async function SponsorshipsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor || !canAdminister(actor)) redirect("/admin");
  const raw = await searchParams;
  const listings = all<{ id: string; slug: string }>("SELECT id, slug FROM listings WHERE status = 'published' ORDER BY slug");
  const placements = listPlacements();
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p>A placement is visible only between its start and end, and only when a required entitlement is provider-confirmed. The stored status stays scheduled until you cancel it.</p>
      <form className="form" action={sponsorshipAction}>
        <label>Listing
          <select name="listingId">{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.slug}</option>)}</select>
        </label>
        <label>Surface
          <select name="placement"><option value="homepage">Homepage</option><option value="category">Category</option><option value="search">Search</option></select>
        </label>
        <label>Starts<input name="startsAt" type="datetime-local" required /></label>
        <label>Ends<input name="endsAt" type="datetime-local" required /></label>
        <label>Disclosure<input name="disclosure" defaultValue="Sponsored" /></label>
        <label className="check"><input type="checkbox" name="requiresEntitlement" value="no" /> Editorial comp, still labeled Sponsored</label>
        <button type="submit">Schedule</button>
      </form>
      <ul>
        {placements.map((placement) => {
          const live = placementIsLive({
            status: String(placement.status),
            starts_at: String(placement.starts_at),
            ends_at: String(placement.ends_at),
            requires_entitlement: Number(placement.requires_entitlement),
            organization_id: placement.organization_id ? String(placement.organization_id) : null,
          });
          return (
            <li key={String(placement.id)}>
              {String(placement.slug)} · {String(placement.placement)} · {String(placement.starts_at).slice(0, 16)} to {String(placement.ends_at).slice(0, 16)} · {live ? "live" : "not live"} · {String(placement.status)}
              {String(placement.status) !== "canceled" ? (
                <form action={sponsorshipAction}>
                  <input type="hidden" name="intent" value="cancel" />
                  <input type="hidden" name="placementId" value={String(placement.id)} />
                  <button className="secondary" type="submit">Cancel</button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
