import type { Metadata } from "next";
import { canonicalUrl, robotsFor } from "@/lib/seo";

export const metadata: Metadata = {
  title: "About",
  description: "What Quire is, who it is for, and how a listing becomes public.",
  alternates: { canonical: canonicalUrl("/about") },
  robots: robotsFor({ indexable: true }),
};

export default function AboutPage() {
  return (
    <div className="wrap prose">
      <p className="kicker">About</p>
      <h1>A publishing desk, not a marketplace checkout.</h1>
      <p>Quire is a catalog for discovering software products and service providers. Editors decide what is public. Providers can subscribe for listing capacity and disclosed sponsorship. Buyers and sellers do not check out, escrow, or get paid through this product.</p>
      <p>It is for readers comparing tools, providers maintaining their own entries, and a small desk that moderates claims, reviews, and revisions.</p>
      <p>The demonstration database is fictional. Real deployments should replace it and turn off the demonstration noindex flag only after a person has reviewed the records.</p>
    </div>
  );
}
