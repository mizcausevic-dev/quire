import type { Metadata } from "next";
import Link from "next/link";
import { compareListings } from "@/lib/compare";
import { canonicalUrl, robotsFor } from "@/lib/seo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Compare",
    description: "Compare published Quire listings.",
    alternates: { canonical: canonicalUrl("/compare") },
    robots: robotsFor({ filtered: true }),
  };
}

export default async function ComparePage({ searchParams }: Props) {
  const raw = await searchParams;
  const ids = typeof raw.ids === "string" ? raw.ids.split(",") : Array.isArray(raw.ids) ? raw.ids : [];
  const result = compareListings(ids);
  return (
    <div className="wrap">
      <p className="kicker">Comparison</p>
      <h1>Set entries side by side</h1>
      <p>Add up to four published slugs. The address keeps the selection.</p>
      <form className="form" action="/compare" method="get">
        <label>
          Slugs
          <input name="ids" defaultValue={ids.join(",")} placeholder="loomline-census,bottleglass-metrics" />
        </label>
        <button type="submit">Compare</button>
      </form>
      {result.missing.length > 0 ? <p className="notice err">Not available: {result.missing.join(", ")}.</p> : null}
      {result.listings.length > 0 ? (
        <div className="compare-wrap">
          <table>
            <caption className="vh">Comparison of {result.listings.map((listing) => listing.title).join(", ")}</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                {result.listings.map((listing) => <th scope="col" key={listing.id}><Link href={`/listings/${listing.slug}`}>{listing.title}</Link></th>)}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className={row.differs ? "differs" : undefined}>{row.label}</th>
                  {row.values.map((value, index) => <td key={`${row.label}-${index}`} className={row.differs ? "differs" : undefined}>{value}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>Choose at least one published listing.</p>}
    </div>
  );
}
