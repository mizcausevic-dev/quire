import type { Metadata } from "next";
import { FilterFields } from "@/components/filter-fields";
import { FilterForm } from "@/components/filter-form";
import { Pager, ResultList, SponsoredBand } from "@/components/results";
import { parseQuery } from "@/lib/query";
import { canonicalUrl, robotsFor } from "@/lib/seo";
import { searchListings } from "@/lib/search";
import { listCategories, listTags } from "@/lib/taxonomy";
import { definitionsForCategory, getCategoryBySlug } from "@/lib/taxonomy";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Search",
    description: "Search published Quire listings.",
    alternates: { canonical: canonicalUrl("/search") },
    robots: robotsFor({ filtered: true }),
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const state = parseQuery(await searchParams);
  const category = state.category ? getCategoryBySlug(state.category) : undefined;
  const definitions = category ? definitionsForCategory(category.id).filter((item) => item.filterable === 1) : [];
  const result = searchListings({ ...state, placement: "search" });
  return (
    <div className="wrap">
      <p className="kicker">Search</p>
      <h1>Search the published catalog</h1>
      <p>Results come from stored listing records. This page is not indexed. Category-specific filters apply only after you choose a category.</p>
      {result.ignoredAttributeFilters.length > 0 ? <p className="meta">These filters were ignored: {result.ignoredAttributeFilters.join(", ")}.</p> : null}
      <SponsoredBand hits={result.sponsored} />
      <div className="layout">
        <FilterForm action="/search">
          <FilterFields state={state} categories={listCategories()} tags={listTags()} definitions={definitions} />
        </FilterForm>
        <div>
          <p className="meta">{result.total} catalog entries{result.sponsored.length ? ` plus ${result.sponsored.length} sponsored` : ""}.</p>
          <ResultList hits={result.hits} />
          <Pager pathname="/search" state={state} total={result.total} pageSize={result.pageSize} />
        </div>
      </div>
    </div>
  );
}
