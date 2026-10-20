import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { audit } from "./audit";
import { get, run, withTransaction } from "./db";
import { AppError } from "./errors";
import { canAdminister } from "./permissions";
import { sha256, nowIso } from "./text";
import type { Actor } from "./types";
import { getUser } from "./auth";

export type BillingMode = "mock" | "live";

export type PlanRecord = {
  code: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  listing_limit: number;
  allows_sponsorship: number;
};

const PLAN_SEED: PlanRecord[] = [
  {
    code: "free",
    name: "Free",
    description: "One published listing. Sponsored placement is not included.",
    price_cents: 0,
    currency: "USD",
    listing_limit: 1,
    allows_sponsorship: 0,
  },
  {
    code: "studio",
    name: "Studio",
    description: "Up to eight published listings. Sponsored placement is not included.",
    price_cents: 3900,
    currency: "USD",
    listing_limit: 8,
    allows_sponsorship: 0,
  },
  {
    code: "signal",
    name: "Signal",
    description: "Up to thirty published listings, with scheduled sponsored placement.",
    price_cents: 9900,
    currency: "USD",
    listing_limit: 30,
    allows_sponsorship: 1,
  },
];

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"]),
  data: z.object({
    organization_id: z.string().min(1),
    plan_code: z.string().min(1).optional(),
    current_period_end: z.string().datetime().optional(),
  }),
});

export function billingMode(): BillingMode {
  return process.env.BILLING_WEBHOOK_SECRET ? "live" : "mock";
}

export function billingReturnEffect(): { changed: false; reason: string } {
  return { changed: false, reason: "Browser redirects do not confirm payment." };
}

export function ensurePlans(): void {
  for (const plan of PLAN_SEED) {
    run(
      `INSERT INTO plans (code, name, description, price_cents, currency, listing_limit, allows_sponsorship)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         price_cents = excluded.price_cents,
         currency = excluded.currency,
         listing_limit = excluded.listing_limit,
         allows_sponsorship = excluded.allows_sponsorship`,
      [plan.code, plan.name, plan.description, plan.price_cents, plan.currency, plan.listing_limit, plan.allows_sponsorship],
    );
  }
}

export function listPlans(): PlanRecord[] {
  ensurePlans();
  return PLAN_SEED.map((plan) => get<PlanRecord>("SELECT * FROM plans WHERE code = ?", [plan.code])!).filter(Boolean);
}

type EntitlementRow = {
  id: string;
  organization_id: string;
  plan_code: string;
  status: string;
  source: string;
  provider_confirmed: number;
  current_period_end: string | null;
  listing_limit: number;
  allows_sponsorship: number;
  plan_name: string;
};

function latestEntitlement(organizationId: string): EntitlementRow | undefined {
  return get<EntitlementRow>(
    `SELECT e.id, e.organization_id, e.plan_code, e.status, e.source, e.provider_confirmed, e.current_period_end,
            p.listing_limit, p.allows_sponsorship, p.name AS plan_name
     FROM entitlements e
     JOIN plans p ON p.code = e.plan_code
     WHERE e.organization_id = ?
     ORDER BY e.updated_at DESC
     LIMIT 1`,
    [organizationId],
  );
}

export function entitlementIsActive(row: EntitlementRow | undefined, now = new Date()): boolean {
  if (!row) return false;
  if (row.status !== "active" || row.provider_confirmed !== 1) return false;
  if (row.current_period_end && row.current_period_end <= now.toISOString()) return false;
  return true;
}

export function listingLimitForOrg(organizationId: string, now = new Date()): { limit: number; planCode: string; confirmed: boolean } {
  ensurePlans();
  const row = latestEntitlement(organizationId);
  if (!entitlementIsActive(row, now) || !row) return { limit: 1, planCode: "free", confirmed: false };
  return { limit: row.listing_limit, planCode: row.plan_code, confirmed: true };
}

export function organizationCanSponsor(organizationId: string | null, now = new Date()): boolean {
  if (!organizationId) return false;
  const row = latestEntitlement(organizationId);
  return Boolean(row && entitlementIsActive(row, now) && row.allows_sponsorship === 1);
}

export function getBillingSnapshot(organizationId: string, now = new Date()) {
  ensurePlans();
  const row = latestEntitlement(organizationId);
  const active = entitlementIsActive(row, now);
  return {
    mode: billingMode(),
    planCode: active && row ? row.plan_code : "free",
    planName: active && row ? row.plan_name : "Free",
    status: row?.status ?? "none",
    source: row?.source ?? "none",
    providerConfirmed: row?.provider_confirmed === 1,
    active,
    periodEnd: row?.current_period_end ?? null,
    canSponsor: Boolean(active && row?.allows_sponsorship === 1),
    listingLimit: active && row ? row.listing_limit : 1,
  };
}

function upsertEntitlement(input: {
  organizationId: string;
  planCode: string;
  status: "incomplete" | "active" | "past_due" | "canceled";
  source: "mock" | "stripe" | "editorial";
  providerConfirmed: boolean;
  periodEnd: string | null;
  externalId: string | null;
}): void {
  const plan = get("SELECT code FROM plans WHERE code = ?", [input.planCode]);
  if (!plan) throw new AppError("Unknown plan.", "plan");
  const org = get("SELECT id FROM organizations WHERE id = ?", [input.organizationId]);
  if (!org) throw new AppError("Organization not found.", "missing");
  const existing = get<{ id: string }>("SELECT id FROM entitlements WHERE organization_id = ? ORDER BY updated_at DESC LIMIT 1", [
    input.organizationId,
  ]);
  const now = nowIso();
  if (existing) {
    run(
      `UPDATE entitlements
       SET plan_code = ?, status = ?, source = ?, provider_confirmed = ?, current_period_end = ?, external_id = ?, updated_at = ?
       WHERE id = ?`,
      [input.planCode, input.status, input.source, input.providerConfirmed ? 1 : 0, input.periodEnd, input.externalId, now, existing.id],
    );
    return;
  }
  run(
    `INSERT INTO entitlements
      (id, organization_id, plan_code, status, source, provider_confirmed, current_period_end, external_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), input.organizationId, input.planCode, input.status, input.source, input.providerConfirmed ? 1 : 0, input.periodEnd, input.externalId, now, now],
  );
}

function assertBillingRole(actor: Actor, organizationId: string): void {
  if (canAdminister(actor)) return;
  const membership = get<{ role: string }>("SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ?", [
    organizationId,
    actor.id,
  ]);
  if (!membership || (membership.role !== "owner" && membership.role !== "billing")) {
    throw new AppError("Billing access is limited to organization owners, billing members, and administrators.", "forbidden");
  }
}

export function confirmMockSubscription(actor: Actor, organizationId: string, planCode: string, now = new Date()): void {
  if (billingMode() !== "mock") {
    throw new AppError("Mock confirmation is disabled while a billing webhook secret is configured.", "billing_mode");
  }
  if (planCode === "free") throw new AppError("The free tier does not require billing confirmation.", "plan");
  assertBillingRole(actor, organizationId);
  ensurePlans();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  withTransaction(() => {
    upsertEntitlement({
      organizationId,
      planCode,
      status: "active",
      source: "mock",
      providerConfirmed: true,
      periodEnd,
      externalId: `mock_${randomUUID()}`,
    });
    const eventId = `mock_${randomUUID()}`;
    run(
      `INSERT INTO billing_events (id, provider, external_event_id, event_type, payload_hash, processed_at)
       VALUES (?, 'mock', ?, 'mock.subscription.confirmed', ?, ?)`,
      [randomUUID(), eventId, sha256(planCode), nowIso()],
    );
    audit(actor.id, "billing.mock_confirm", "organization", organizationId, `Mock-confirmed plan ${planCode}.`);
  });
}

export function grantEditorialEntitlement(actor: Actor, organizationId: string, planCode: string, periodEnd: string): void {
  if (!canAdminister(actor)) throw new AppError("Administrator permission required.", "forbidden");
  ensurePlans();
  if (Number.isNaN(Date.parse(periodEnd))) throw new AppError("Enter a valid period end.", "billing");
  withTransaction(() => {
    upsertEntitlement({
      organizationId,
      planCode,
      status: "active",
      source: "editorial",
      providerConfirmed: true,
      periodEnd: new Date(periodEnd).toISOString(),
      externalId: null,
    });
    audit(actor.id, "billing.editorial_grant", "organization", organizationId, `Granted ${planCode} until ${periodEnd}.`);
  });
}

export function signBillingPayload(secret: string, raw: string, timestampSeconds: number): string {
  const mac = createHmac("sha256", secret).update(`${timestampSeconds}.${raw}`).digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

export function verifyBillingSignature(secret: string, header: string, raw: string, nowMs = Date.now()): void {
  const timestamp = /(?:^|,)\s*t=(\d+)/.exec(header)?.[1];
  const signature = /(?:^|,)\s*v1=([a-f0-9]+)/i.exec(header)?.[1];
  if (!timestamp || !signature) throw new AppError("Missing billing signature.", "signature");
  const skew = Math.abs(nowMs - Number(timestamp) * 1000);
  if (skew > 5 * 60 * 1000) throw new AppError("Billing signature is outside the allowed window.", "signature");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const left = Buffer.from(signature, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new AppError("Billing signature did not match.", "signature");
  }
}

export function applySignedBillingEvent(header: string | null, raw: string, now = new Date()): { duplicate: boolean } {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) throw new AppError("Billing webhook secret is not configured.", "billing_mode");
  if (!header) throw new AppError("Missing billing signature.", "signature");
  verifyBillingSignature(secret, header, raw, now.getTime());
  let parsed: z.infer<typeof eventSchema>;
  try {
    parsed = eventSchema.parse(JSON.parse(raw));
  } catch {
    throw new AppError("Billing event payload is invalid.", "payload");
  }
  const seen = get("SELECT id FROM billing_events WHERE provider = 'stripe' AND external_event_id = ?", [parsed.id]);
  if (seen) return { duplicate: true };
  ensurePlans();
  withTransaction(() => {
    const again = get("SELECT id FROM billing_events WHERE provider = 'stripe' AND external_event_id = ?", [parsed.id]);
    if (again) return;
    if (parsed.type === "customer.subscription.deleted") {
      const existing = latestEntitlement(parsed.data.organization_id);
      if (!existing) throw new AppError("Organization not found for billing event.", "missing");
      run("UPDATE entitlements SET status = 'canceled', updated_at = ? WHERE id = ?", [nowIso(), existing.id]);
    } else {
      if (!parsed.data.plan_code) throw new AppError("Billing event is missing a plan.", "payload");
      upsertEntitlement({
        organizationId: parsed.data.organization_id,
        planCode: parsed.data.plan_code,
        status: "active",
        source: "stripe",
        providerConfirmed: true,
        periodEnd: parsed.data.current_period_end ?? null,
        externalId: parsed.id,
      });
    }
    run(
      `INSERT INTO billing_events (id, provider, external_event_id, event_type, payload_hash, processed_at)
       VALUES (?, 'stripe', ?, ?, ?, ?)`,
      [randomUUID(), parsed.id, parsed.type, createHash("sha256").update(raw).digest("hex"), nowIso()],
    );
    audit(null, "billing.webhook", "organization", parsed.data.organization_id, `Processed ${parsed.type}.`);
  });
  const after = get("SELECT id FROM billing_events WHERE provider = 'stripe' AND external_event_id = ?", [parsed.id]);
  return { duplicate: !after ? false : Boolean(seen) };
}

export function assertPublishAllowed(listingId: string, now = new Date()): void {
  const listing = get<{ id: string; status: string; submitted_by_user_id: string | null }>(
    "SELECT id, status, submitted_by_user_id FROM listings WHERE id = ?",
    [listingId],
  );
  if (!listing) throw new AppError("Listing not found.", "missing");
  if (listing.status === "published") return;
  const orgOwner = get<{ owner_id: string }>(
    "SELECT owner_id FROM listing_ownerships WHERE listing_id = ? AND owner_type = 'organization' LIMIT 1",
    [listingId],
  );
  if (orgOwner) {
    const allowance = listingLimitForOrg(orgOwner.owner_id, now);
    const used = get<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM listings l
       JOIN listing_ownerships o ON o.listing_id = l.id
       WHERE o.owner_type = 'organization' AND o.owner_id = ? AND l.status = 'published' AND l.id != ?`,
      [orgOwner.owner_id, listingId],
    );
    if ((used?.count ?? 0) >= allowance.limit) {
      throw new AppError(`The ${allowance.planCode} plan allows ${allowance.limit} published listing${allowance.limit === 1 ? "" : "s"}.`, "limit");
    }
    return;
  }
  const userOwner = get<{ owner_id: string }>(
    "SELECT owner_id FROM listing_ownerships WHERE listing_id = ? AND owner_type = 'user' LIMIT 1",
    [listingId],
  );
  let userId = userOwner?.owner_id ?? null;
  if (!userId && listing.submitted_by_user_id) {
    const submitter = getUser(listing.submitted_by_user_id);
    if (submitter?.role === "user") userId = submitter.id;
  }
  if (!userId) return;
  const used = get<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM listings l
     JOIN listing_ownerships o ON o.listing_id = l.id
     WHERE o.owner_type = 'user' AND o.owner_id = ? AND l.status = 'published' AND l.id != ?`,
    [userId, listingId],
  );
  if ((used?.count ?? 0) >= 1) {
    throw new AppError("The free tier allows one published listing for an independent provider.", "limit");
  }
}
