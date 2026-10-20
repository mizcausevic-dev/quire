import { all } from "@/lib/db";
import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { decideClaimAction } from "@/server/actions";

export default async function ClaimsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const claims = all<{ id: string; status: string; evidence_text: string; slug: string; email: string; review_note: string | null }>(
    `SELECT c.id, c.status, c.evidence_text, c.review_note, l.slug, u.email
     FROM ownership_claims c
     JOIN listings l ON l.id = c.listing_id
     JOIN users u ON u.id = c.claimant_user_id
     ORDER BY c.created_at DESC LIMIT 50`,
  );
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      {claims.map((claim) => (
        <article className="panel" key={claim.id}>
          <h2>{claim.slug}</h2>
          <p className="status">{claim.status} · {claim.email}</p>
          <p>{claim.evidence_text}</p>
          {claim.status === "pending" ? (
            <form action={decideClaimAction}>
              <input type="hidden" name="claimId" value={claim.id} />
              <label>Note<textarea name="note" required minLength={5} /></label>
              <button name="decision" value="approved" type="submit">Approve</button>
              <button name="decision" value="rejected" className="secondary" type="submit">Reject</button>
            </form>
          ) : null}
          {claim.status === "approved" ? (
            <form action={decideClaimAction}>
              <input type="hidden" name="claimId" value={claim.id} />
              <input type="hidden" name="decision" value="revoke" />
              <label>Revocation note<textarea name="note" required minLength={5} /></label>
              <button className="secondary" type="submit">Revoke</button>
            </form>
          ) : null}
        </article>
      ))}
    </>
  );
}
