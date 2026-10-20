import type { Metadata } from "next";
import Link from "next/link";
import { listPublicArticles } from "@/lib/articles";
import { canonicalUrl, robotsFor } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Journal",
    description: "Editorial notes linked to Quire listings.",
    alternates: { canonical: canonicalUrl("/articles") },
    robots: robotsFor({ indexable: true }),
  };
}

export default function ArticlesPage() {
  const articles = listPublicArticles();
  return (
    <div className="wrap">
      <p className="kicker">Journal</p>
      <h1>Notes from the desk</h1>
      <div className="contents">
        {articles.map((article) => (
          <Link key={article.slug} href={`/articles/${article.slug}`}>
            <span className="index">{article.published_at?.slice(0, 10) ?? "Draft"}</span>
            <span>{article.title}<br /><span className="meta">{article.dek}</span></span>
          </Link>
        ))}
        {articles.length === 0 ? <p>No published articles yet.</p> : null}
      </div>
    </div>
  );
}
