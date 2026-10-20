import { billingMode, getBillingSnapshot, listPlans } from "@/lib/billing";
import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { listOrganizationsForUser } from "@/lib/orgs";
import { mockBillingAction } from "@/server/actions";
import { currentActor } from "@/server/session";

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor) return null;
  const raw = await searchParams;
  const organizations = listOrganizationsForUser(actor.id).filter((org) => org.role === "owner" || org.role === "billing");
  const plans = listPlans();
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p>Billing mode: {billingMode() === "mock" ? "mock. A signed webhook secret is not configured." : "live. Entitlements change only after a verified webhook."}</p>
      <p>Opening <a href="/provider/billing/return?status=success">a success redirect</a> does not activate a plan.</p>
      {organizations.map((org) => {
        const snapshot = getBillingSnapshot(org.id);
        return (
          <section className="panel" key={org.id}>
            <h2>{org.name}</h2>
            <p>{snapshot.planName} · status {snapshot.status} · provider confirmed: {snapshot.providerConfirmed ? "yes" : "no"} · sponsor: {snapshot.canSponsor ? "yes" : "no"}</p>
            {billingMode() === "mock" ? (
              <form action={mockBillingAction}>
                <input type="hidden" name="organizationId" value={org.id} />
                <label>Plan
                  <select name="planCode">
                    {plans.filter((plan) => plan.code !== "free").map((plan) => <option key={plan.code} value={plan.code}>{plan.name} · {(plan.price_cents / 100).toFixed(2)} {plan.currency}</option>)}
                  </select>
                </label>
                <button type="submit">Confirm mock subscription</button>
              </form>
            ) : <p>Use the billing provider. This page will not infer payment from the query string.</p>}
          </section>
        );
      })}
    </>
  );
}
