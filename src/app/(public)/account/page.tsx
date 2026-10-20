import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { listProviderListings } from "@/lib/listings";
import { currentActor } from "@/server/session";

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor) redirect("/login?next=/account");
  const raw = await searchParams;
  const listings = listProviderListings(actor.id);
  return (
    <div className="wrap">
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p className="kicker">Account</p>
      <h1>{actor.name}</h1>
      <p>Your role is {actor.role}. That role is separate from provider membership and from any paid plan.</p>
      <nav className="nav">
        <Link href="/account/collections">Collections</Link>
        <Link href="/account/reviews">Your reviews live on listing pages after moderation</Link>
        <Link href="/provider">Provider desk</Link>
        <Link href="/submit">Submit a listing</Link>
      </nav>
      <h2>Listings you can see</h2>
      <ul>
        {listings.map((listing) => <li key={listing.id}><Link href={`/provider/listings/${listing.id}`}>{listing.title}</Link> · {listing.status}</li>)}
        {listings.length === 0 ? <li>No drafts or owned listings yet.</li> : null}
      </ul>
    </div>
  );
}
