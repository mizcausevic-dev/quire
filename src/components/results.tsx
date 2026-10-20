import Link from "next/link";
import type { SearchHit } from "@/lib/search";
import { buildHref, type QueryState } from "@/lib/query";

export function SponsoredBand({ hits }: { hits: SearchHit[] }) {
  if (hits.length === 0) return null;
  return (
    <aside className="sponsored" aria-label="Sponsored placements">
      {hits.map((hit) => (
        <p key={hit.id}>
          <strong>{hit.disclosure ?? "Sponsored"}</strong>
          {" · "}
          <Link href={`/listings/${hit.slug}`}>{hit.title}</Link>
          {" · "}
          <span>{hit.providerName ?? "Provider not named"}</span>
          {hit.sponsorshipEnds ? <span> · through {hit.sponsorshipEnds.slice(0, 10)}</span> : null}
        </p>
      ))}
    </aside>
  );
}

export function ResultList({ hits }: { hits: SearchHit[] }) {
  if (hits.length === 0) return <p>No published listings match these filters.</p>;
  return (
    <div className="grid">
      {hits.map((hit) => (
        <article className="entry" key={hit.id}>
          <p className="kicker">{hit.parentName ? `${hit.parentName} / ` : ""}{hit.categoryName} · {hit.kind}</p>
          <h3><Link href={`/listings/${hit.slug}`}>{hit.title}</Link></h3>
          <p>{hit.summary}</p>
          <p className="meta">
            {hit.providerName ?? "Ownership not claimed"}
            {" · "}
            {hit.priceLabel}
            {hit.isDemo ? " · Fictional" : ""}
            {" · "}
            <Link href={`/compare?ids=${hit.slug}`}>Compare</Link>
          </p>
        </article>
      ))}
    </div>
  );
}

export function Pager({ pathname, state, total, pageSize }: { pathname: string; state: QueryState; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages < 2) return null;
  return (
    <nav className="pager" aria-label="Pagination">
      {state.page > 1 ? <Link href={buildHref(pathname, state, { page: state.page - 1 })}>Previous</Link> : <span>Previous</span>}
      <span>Page {state.page} of {pages}</span>
      {state.page < pages ? <Link href={buildHref(pathname, state, { page: state.page + 1 })}>Next</Link> : <span>Next</span>}
    </nav>
  );
}
