import type { Metadata } from "next";
import { canonicalUrl, robotsFor } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Editorial standards",
  description: "How Quire handles publication, ownership, reviews, and sponsorship.",
  alternates: { canonical: canonicalUrl("/editorial-standards") },
  robots: robotsFor({ indexable: true }),
};

export default function StandardsPage() {
  return (
    <div className="wrap prose">
      <p className="kicker">Standards</p>
      <h1>What the desk will and will not publish.</h1>
      <h2>Publication</h2>
      <p>A new listing moves from draft to submitted, then to published only when a different moderator approves it. A change to a published listing is a revision. The current published revision stays on the public page until the new one is approved. Rejection of a revision does not unpublish the live entry.</p>
      <h2>Ownership</h2>
      <p>Membership in a provider organization does not grant rights to listings that organization does not own. A claim stays pending until a moderator reviews the evidence. An email address, including one that looks like a company domain, is not evidence.</p>
      <h2>Reviews</h2>
      <p>A review is ordinary unless a moderator records a verification note after a check. The author cannot apply the verified-customer label. Unpublished and removed reviews are not shown, and the page does not invent ratings.</p>
      <h2>Sponsorship</h2>
      <p>A sponsored placement has a start, an end, and the word Sponsored. It appears only inside that window, and only when a required entitlement is provider-confirmed. It is pinned above matching results and removed from the ordinary list so it is not counted twice.</p>
    </div>
  );
}
