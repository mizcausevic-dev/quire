import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { ResultList, SponsoredBand } from "@/components/results";
import { breadcrumbJsonLd, websiteJsonLd } from "@/lib/jsonld";
import { listPublicArticles } from "@/lib/articles";
import { searchListings } from "@/lib/search";
import { canonicalUrl, robotsFor } from "@/lib/seo";
import { siteOrigin } from "@/lib/settings";
import { categoryTree } from "@/lib/taxonomy";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: "Quire · An edited catalog of software and services" },
    description: "Browse software products and service providers by category, compare entries, and read the desk notes that cite them.",
    alternates: { canonical: canonicalUrl("/") },
    robots: robotsFor({ indexable: true }),
  };
}

export default function HomePage() {
  const origin = siteOrigin();
  const tree = categoryTree();
  const newest = searchListings({ sort: "newest", page: 1, placement: "homepage" });
  const articles = listPublicArticles();
  return (
    <div className="wrap">
      <JsonLd data={[websiteJsonLd(origin), breadcrumbJsonLd(origin, [{ name: "Quire", path: "/" }])]} />
      <section className="hero">
        <div>
          <p className="kicker">Discovery</p>
          <h1>Find software and services the way a desk editor would file them.</h1>
          <p>Browse a category, compare a short list, or read a journal note that points at the entries it discusses. Sponsored rows are labeled and expire on the dates stored for them.</p>
        </div>
        <div className="contents" aria-label="Categories">
          {tree.map((category) => (
            <Link key={category.id} href={`/categories/${category.slug}`}>
              <span className="index">{String(category.sort_order).padStart(2, "0")}</span>
              <span>{category.name}</span>
              <span className="count">{category.publishedCount}</span>
            </Link>
          ))}
          {tree.length === 0 ? <p>The taxonomy is empty. Seed the catalog or add categories in the desk.</p> : null}
        </div>
      </section>
      <SponsoredBand hits={newest.sponsored} />
      <h2 className="section-title">New entries</h2>
      <ResultList hits={newest.hits.slice(0, 6)} />
      <h2 className="section-title">From the journal</h2>
      <div className="contents">
        {articles.map((article) => (
          <Link key={article.slug} href={`/articles/${article.slug}`}>
            <span className="index">Note</span>
            <span>{article.title}</span>
            <span className="count">{article.published_at?.slice(0, 10)}</span>
          </Link>
        ))}
        {articles.length === 0 ? <p>No published articles yet.</p> : null}
      </div>
    </div>
  );
}
