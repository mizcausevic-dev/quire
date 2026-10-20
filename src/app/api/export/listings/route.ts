import { exportPublishedListingsCsv } from "@/lib/imports";
import { canAdminister } from "@/lib/permissions";
import { currentActor } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await currentActor();
  if (!canAdminister(actor)) return new Response("Administrator permission required.", { status: 403 });
  return new Response(exportPublishedListingsCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=\"quire-listings.csv\"",
      "x-content-type-options": "nosniff",
    },
  });
}
