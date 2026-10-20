import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { collectionForUser } from "@/lib/collections";
import { collectionAction } from "@/server/actions";
import { currentActor } from "@/server/session";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) redirect("/login?next=/account/collections");
  const { id } = await params;
  const collection = collectionForUser(actor, id);
  if (!collection) notFound();
  return (
    <div className="wrap">
      <h1>{collection.name}</h1>
      <ul>
        {collection.items.map((item) => (
          <li key={item.listing_id}>
            <Link href={`/listings/${item.slug}`}>{item.title}</Link>
            <form action={collectionAction}>
              <input type="hidden" name="intent" value="remove" />
              <input type="hidden" name="collectionId" value={collection.id} />
              <input type="hidden" name="listingId" value={item.listing_id} />
              <button className="secondary" type="submit">Remove</button>
            </form>
          </li>
        ))}
        {collection.items.length === 0 ? <li>Nothing saved yet.</li> : null}
      </ul>
    </div>
  );
}
