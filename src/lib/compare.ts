import { MAX_COMPARE } from "./constants";
import { getPublicListing, type PublicListing } from "./listings";

export type CompareRow = { label: string; values: string[]; differs: boolean };

export function compareListings(slugs: string[]): { listings: PublicListing[]; rows: CompareRow[]; missing: string[] } {
  const unique = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))].slice(0, MAX_COMPARE);
  const missing: string[] = [];
  const listings: PublicListing[] = [];
  for (const slug of unique) {
    const listing = getPublicListing(slug);
    if (!listing || listing.status !== "published") missing.push(slug);
    else listings.push(listing);
  }
  const attributeKeys = [...new Set(listings.flatMap((listing) => listing.attributes.map((attribute) => attribute.key)))];
  const rows: CompareRow[] = [];
  const add = (label: string, values: string[]) => {
    rows.push({ label, values, differs: new Set(values).size > 1 });
  };
  if (listings.length > 0) {
    add("Kind", listings.map((listing) => listing.kind));
    add("Category", listings.map((listing) => listing.parentName ? `${listing.parentName} / ${listing.categoryName}` : listing.categoryName));
    add("Provider", listings.map((listing) => listing.providerName ?? "Not named"));
    add("Ownership", listings.map((listing) => (listing.ownershipClaimed ? "Recorded" : "Not claimed")));
    add("Price", listings.map((listing) => listing.prices.map((price) => price.text).join("; ") || "Not listed"));
    add("Tags", listings.map((listing) => listing.tags.map((tag) => tag.name).join(", ") || "None"));
    add("Website", listings.map((listing) => listing.website ?? "None"));
    for (const key of attributeKeys) {
      const label = listings.find((listing) => listing.attributes.some((attribute) => attribute.key === key))?.attributes.find((attribute) => attribute.key === key)?.label ?? key;
      add(label, listings.map((listing) => listing.attributes.find((attribute) => attribute.key === key)?.display ?? "n/a"));
    }
  }
  return { listings, rows, missing };
}
