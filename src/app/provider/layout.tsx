import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ConsoleFrame } from "@/components/console-frame";
import { currentActor } from "@/server/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ProviderLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/login?next=/provider");
  return <ConsoleFrame title="Provider" area="provider">{children}</ConsoleFrame>;
}
