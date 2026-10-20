import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { listCollections } from "@/lib/collections";
import { takeNotice } from "@/lib/notices";
import { collectionAction } from "@/server/actions";
import { currentActor } from "@/server/session";

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor) redirect("/login?next=/account/collections");
  const raw = await searchParams;
  const collections = listCollections(actor.id);
  return (
    <div className="wrap">
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <h1>Collections</h1>
      <p>Collections are private. They are not in the sitemap.</p>
      <ul>{collections.map((collection) => <li key={collection.id}><Link href={`/account/collections/${collection.id}`}>{collection.name}</Link> · {collection.count}</li>)}</ul>
      <form className="form" action={collectionAction}>
        <input type="hidden" name="intent" value="create" />
        <label>New collection<input name="name" required /></label>
        <button type="submit">Create</button>
      </form>
    </div>
  );
}
