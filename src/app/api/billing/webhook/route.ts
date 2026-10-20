import { applySignedBillingEvent, billingReturnEffect } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const header = request.headers.get("quire-signature") ?? request.headers.get("stripe-signature");
  try {
    const result = applySignedBillingEvent(header, raw);
    return Response.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing event rejected.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

export function GET() {
  return Response.json(billingReturnEffect(), { status: 405 });
}
