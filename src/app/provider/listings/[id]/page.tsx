import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListingEditor } from "@/components/listing-editor";
import { Notice } from "@/components/notice";
import { editorState } from "@/lib/listings";
import { takeNotice } from "@/lib/notices";
import { listOrganizationsForUser } from "@/lib/orgs";
import { getListingGrant } from "@/lib/permissions";
import { definitionsForCategory, listCategories, listTags } from "@/lib/taxonomy";
import { currentActor } from "@/server/session";

export default async function ProviderListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor) redirect("/login?next=/provider");
  const { id } = await params;
  const grant = getListingGrant(actor, id);
  if (!grant.canViewInProvider && !grant.canEditContent) notFound();
  const state = editorState(id);
  if (!state) notFound();
  const raw = await searchParams;
  const categoryId = typeof raw.category === "string" ? raw.category : state.input.categoryId;
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p className="status">{state.status}{state.pending ? " · revision in review, public copy unchanged" : ""}</p>
      {state.status === "published" ? <p><Link href={`/listings/${state.slug}`}>View public page</Link></p> : null}
      <nav className="conav">
        {listCategories().map((category) => <Link key={category.id} href={`/provider/listings/${id}?category=${category.id}`}>{category.name}</Link>)}
      </nav>
      {grant.canEditContent ? (
        <ListingEditor
          listingId={id}
          published={state.published}
          categories={listCategories()}
          tags={listTags()}
          definitions={definitionsForCategory(categoryId)}
          organizations={listOrganizationsForUser(actor.id)}
          values={{ ...state.input, categoryId }}
        />
      ) : <p>You can view this listing's billing relationship, but you cannot edit it.</p>}
    </>
  );
}
