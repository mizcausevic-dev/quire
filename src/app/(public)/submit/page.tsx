import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListingEditor } from "@/components/listing-editor";
import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { listOrganizationsForUser } from "@/lib/orgs";
import { robotsFor } from "@/lib/seo";
import { definitionsForCategory, listCategories, listTags } from "@/lib/taxonomy";
import { currentActor } from "@/server/session";

export const metadata: Metadata = { title: "Submit a listing", robots: robotsFor({ indexable: false }) };

export default async function SubmitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor) redirect("/login?next=/submit");
  const raw = await searchParams;
  const categories = listCategories();
  const selected = categories.find((category) => category.id === raw.category || category.slug === raw.category) ?? categories[0];
  return (
    <div className="wrap">
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p className="kicker">Submission</p>
      <h1>Offer an entry to the desk</h1>
      <p>A submission is not public. A moderator publishes it. Saving a draft does not either.</p>
      <nav className="nav" aria-label="Choose a category">
        {categories.map((category) => <Link key={category.id} href={`/submit?category=${category.slug}`}>{category.name}</Link>)}
      </nav>
      {selected ? (
        <ListingEditor
          categories={categories}
          tags={listTags()}
          definitions={definitionsForCategory(selected.id)}
          organizations={listOrganizationsForUser(actor.id)}
          values={{
            title: "",
            summary: "",
            body: "",
            website: "",
            kind: selected.kind,
            categoryId: selected.id,
            prices: [{ label: "Price", model: "contact", amount: "", currency: "USD", interval: "", notes: "" }],
            tags: [],
            attributes: {},
            images: [],
          }}
        />
      ) : <p>Add a category before accepting submissions.</p>}
    </div>
  );
}
