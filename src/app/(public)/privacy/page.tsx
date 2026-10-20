import type { Metadata } from "next";
import { canonicalUrl, robotsFor } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Quire stores when you create an account or submit a listing.",
  alternates: { canonical: canonicalUrl("/privacy") },
  robots: robotsFor({ indexable: true }),
};

export default function PrivacyPage() {
  return (
    <div className="wrap prose">
      <p className="kicker">Privacy</p>
      <h1>What this catalog stores.</h1>
      <p>Account creation stores your name, email address, a password hash, and the time you accepted this notice. A signed-in session uses an HTTP-only cookie. Listings, claims, reviews, and reports store the text you submit and the account that submitted it.</p>
      <p>The public site shows your display name on a published review. It does not show your email address. Demonstration records are fictional and marked in the interface.</p>
      <p>This build does not load a third-party analytics tag. There is no checkout and no sale of contact lists.</p>
      <p>To ask for access or deletion of an account in a real deployment, write to the operator named in that deployment's notice. The demonstration address privacy@quire.example is not a monitored mailbox.</p>
      <p>Keeping a checkbox is a record that this page was accepted. It is not, by itself, a claim that the notice meets every legal test.</p>
    </div>
  );
}
