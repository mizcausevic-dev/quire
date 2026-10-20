import Link from "next/link";
import { all } from "@/lib/db";
import { currentActor } from "@/server/session";

export default async function ProviderClaimsPage() {
  const actor = await currentActor();
  if (!actor) return null;
  const claims = all<{ id: string; status: string; slug: string; created_at: string }>(
    `SELECT c.id, c.status, c.created_at, l.slug
     FROM ownership_claims c JOIN listings l ON l.id = c.listing_id
     WHERE c.claimant_user_id = ? ORDER BY c.created_at DESC`,
    [actor.id],
  );
  return (
    <>
      <h2>Your claims</h2>
      <ul>
        {claims.map((claim) => <li key={claim.id}><Link href={`/listings/${claim.slug}`}>{claim.slug}</Link> · {claim.status}</li>)}
        {claims.length === 0 ? <li>No claims filed.</li> : null}
      </ul>
    </>
  );
}
