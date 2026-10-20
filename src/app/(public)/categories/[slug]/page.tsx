import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { FilterFields } from "@/components/filter-fields";
import { FilterForm } from "@/components/filter-form";
import { JsonLd } from "@/components/json-ld";
import { Notice } from "@/components/notice";
import { Pager, ResultList, SponsoredBand } from "@/components/results";
import { breadcrumbJsonLd, itemListJsonLd } from "@/lib/jsonld";
import { filteredState, parseQuery } from "@/lib/query";
import { findRedirect } from "@/lib/redirects";
import { searchListings } from "@/lib/search";
import { canonicalUrl, robotsFor } from "@/lib/seo";
import { siteOrigin } from "@/lib/settings";
import { definitionsForCategory, getCategory, getCategoryBySlug, listCategories, listTags } from "@/lib/taxonomy";
import { takeNotice } from "@/lib/notices";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  const state = parseQuery(await searchParams);
  const filtered = filteredState(state, slug);
  return {
    title: category ? category.name : "Category",
    description: category?.description || "Catalog category.",
    alternates: { canonical: canonicalUrl(`/categories/${slug}`) },
    robots: robotsFor({ indexable: Boolean(category), filtered }),
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) {
    const target = findRedirect(`/categories/${slug}`);
    if (target) permanentRedirect(target);
    notFound();
  }
  const raw = await searchParams;
  const parsed = parseQuery(raw);
  const state = { ...parsed, category: "" };
  const parent = category.parent_id ? getCategory(category.parent_id) : undefined;
  const children = listCategories().filter((item) => item.parent_id === category.id);
  const result = searchListings({ ...parsed, category: slug, placement: "category" });
  const origin = siteOrigin();
  const crumbs = [
    { name: "Quire", path: "/" },
    ...(parent ? [{ name: parent.name, path: `/categories/${parent.slug}` }] : []),
    { name: category.name, path: `/categories/${category.slug}` },
  ];
  return (
    <div className="wrap">
      <JsonLd data={[
        breadcrumbJsonLd(origin, crumbs),
        itemListJsonLd(origin, category.name, result.hits.map((hit) => ({ name: hit.title, path: `/listings/${hit.slug}` }))),
      ]} />
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p className="crumbs">{crumbs.map((crumb, index) => <span key={crumb.path}>{index ? " / " : ""}<Link href={crumb.path}>{crumb.name}</Link></span>)}</p>
      <p className="kicker">{parent ? parent.name : category.kind}</p>
      <h1>{category.name}</h1>
      <p className="dek">{category.description}</p>
      {children.length > 0 ? (
        <nav className="nav" aria-label="Subcategories">
          {children.map((child) => <Link key={child.id} href={`/categories/${child.slug}`}>{child.name}</Link>)}
        </nav>
      ) : null}
      {result.ignoredAttributeFilters.length > 0 ? <p className="meta">Ignored filters that do not apply to this category: {result.ignoredAttributeFilters.join(", ")}.</p> : null}
      <SponsoredBand hits={result.sponsored} />
      <div className="layout">
        <FilterForm action={`/categories/${category.slug}`}>
          <FilterFields state={state} categories={[]} tags={listTags()} definitions={definitionsForCategory(category.id).filter((item) => item.filterable === 1)} hideCategory />
        </FilterForm>
        <div>
          <ResultList hits={result.hits} />
          <Pager pathname={`/categories/${category.slug}`} state={state} total={result.total} pageSize={result.pageSize} />
        </div>
      </div>
    </div>
  );
}
