import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { getPublicArticle } from "@/lib/articles";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/jsonld";
import { findRedirect } from "@/lib/redirects";
import { canonicalUrl, robotsFor } from "@/lib/seo";
import { siteOrigin } from "@/lib/settings";
import { paragraphs } from "@/lib/text";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getPublicArticle(slug);
  return {
    title: article?.title ?? "Article",
    description: article?.dek ?? "Journal note.",
    alternates: { canonical: canonicalUrl(`/articles/${article?.slug ?? slug}`) },
    robots: robotsFor({ indexable: Boolean(article && article.indexable === 1) }),
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getPublicArticle(slug);
  if (!article) {
    const target = findRedirect(`/articles/${slug}`);
    if (target) permanentRedirect(target);
    notFound();
  }
  const origin = siteOrigin();
  return (
    <div className="wrap detail">
      <JsonLd data={[
        breadcrumbJsonLd(origin, [{ name: "Quire", path: "/" }, { name: "Journal", path: "/articles" }, { name: article.title, path: `/articles/${article.slug}` }]),
        articleJsonLd({ origin, path: `/articles/${article.slug}`, title: article.title, description: article.dek, publishedAt: article.published_at }),
      ]} />
      <article>
        <p className="kicker">Quire editorial desk{article.published_at ? ` · ${article.published_at.slice(0, 10)}` : ""}</p>
        <h1>{article.title}</h1>
        <p className="dek">{article.dek}</p>
        <div className="prose">{paragraphs(article.body).map((paragraph) => <p key={paragraph.slice(0, 32)}>{paragraph}</p>)}</div>
        {article.listings.length > 0 ? (
          <>
            <h2>Entries discussed</h2>
            <ul>{article.listings.map((listing) => <li key={listing.id}><Link href={`/listings/${listing.slug}`}>{listing.title}</Link></li>)}</ul>
          </>
        ) : null}
      </article>
    </div>
  );
}
