import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ConsoleFrame } from "@/components/console-frame";
import { canModerate } from "@/lib/permissions";
import { currentActor } from "@/server/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/login?next=/admin");
  if (!canModerate(actor)) redirect("/account");
  return <ConsoleFrame title="Desk" area="admin">{children}</ConsoleFrame>;
}
