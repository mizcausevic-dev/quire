import assert from "node:assert/strict";
import test from "node:test";
import { applySignedBillingEvent, billingReturnEffect, confirmMockSubscription, getBillingSnapshot, signBillingPayload } from "../src/lib/billing.ts";
import { get } from "../src/lib/db.ts";
import { AppError } from "../src/lib/errors.ts";
import { createOrganization } from "../src/lib/orgs.ts";
import { makeUser, withDb } from "./helpers.ts";

test("payment is not inferred from a browser return, and webhooks are signed and idempotent", () => {
  withDb(() => {
    const owner = makeUser("user", "billing@quire.test");
    const org = createOrganization(owner, { name: "Paperplane Ledger" });
    const before = get<{ count: number }>("SELECT COUNT(*) AS count FROM entitlements")?.count ?? 0;
    const effect = billingReturnEffect();
    assert.equal(effect.changed, false);
    assert.equal(get<{ count: number }>("SELECT COUNT(*) AS count FROM entitlements")?.count, before);
    assert.equal(getBillingSnapshot(org.id).active, false);

    confirmMockSubscription(owner, org.id, "studio", new Date("2026-10-20T00:00:00.000Z"));
    assert.equal(getBillingSnapshot(org.id, new Date("2026-10-21T00:00:00.000Z")).planCode, "studio");
    assert.equal(getBillingSnapshot(org.id).providerConfirmed, true);

    process.env.BILLING_WEBHOOK_SECRET = "test-secret";
    assert.throws(() => confirmMockSubscription(owner, org.id, "signal"), (error: unknown) => error instanceof AppError && error.code === "billing_mode");
    const raw = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { organization_id: org.id, plan_code: "signal", current_period_end: "2026-11-20T00:00:00.000Z" },
    });
    const header = signBillingPayload("test-secret", raw, Math.floor(Date.now() / 1000));
    const first = applySignedBillingEvent(header, raw);
    assert.equal(first.duplicate, false);
    assert.equal(getBillingSnapshot(org.id).planCode, "signal");
    const secondRaw = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { organization_id: org.id, plan_code: "studio", current_period_end: "2027-01-01T00:00:00.000Z" },
    });
    const second = applySignedBillingEvent(signBillingPayload("test-secret", secondRaw, Math.floor(Date.now() / 1000)), secondRaw);
    assert.equal(second.duplicate, true);
    assert.equal(getBillingSnapshot(org.id).planCode, "signal");
    assert.throws(() => applySignedBillingEvent("t=1,v1=deadbeef", raw), (error: unknown) => error instanceof AppError && error.code === "signature");
    delete process.env.BILLING_WEBHOOK_SECRET;
  });
});
