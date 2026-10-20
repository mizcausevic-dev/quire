import { billingReturnEffect, getBillingSnapshot } from "@/lib/billing";
import { listOrganizationsForUser } from "@/lib/orgs";
import { currentActor } from "@/server/session";

export default async function BillingReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  const raw = await searchParams;
  const effect = billingReturnEffect();
  const organizations = actor ? listOrganizationsForUser(actor.id) : [];
  return (
    <>
      <h2>Billing return</h2>
      <p>{effect.reason}</p>
      <p>Query status: {typeof raw.status === "string" ? raw.status : "none"}. Entitlements were not changed by opening this page.</p>
      <ul>
        {organizations.map((org) => {
          const snapshot = getBillingSnapshot(org.id);
          return <li key={org.id}>{org.name}: {snapshot.planName}, confirmed {snapshot.providerConfirmed ? "yes" : "no"}</li>;
        })}
      </ul>
    </>
  );
}
