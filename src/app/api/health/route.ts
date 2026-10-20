import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  const row = get<{ count: number }>("SELECT COUNT(*) AS count FROM listings");
  return Response.json({ ok: true, listings: row?.count ?? 0 });
}
