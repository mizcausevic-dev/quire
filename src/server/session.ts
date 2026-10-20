import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { actorFromSession, createSession, destroySession } from "@/lib/auth";
import { createNotice } from "@/lib/notices";
import { canAdminister, canModerate } from "@/lib/permissions";
import { safeNextPath } from "@/lib/text";
import type { Actor } from "@/lib/types";

const COOKIE = "quire_session";

export async function currentActor(): Promise<Actor | null> {
  const jar = await cookies();
  return actorFromSession(jar.get(COOKIE)?.value);
}

export async function requireActor(next = "/account"): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(safeNextPath(next, "/account"))}`);
  return actor;
}

export async function requireModerator(): Promise<Actor> {
  const actor = await requireActor("/admin");
  if (!canModerate(actor)) redirect("/account");
  return actor;
}

export async function requireAdmin(): Promise<Actor> {
  const actor = await requireActor("/admin");
  if (!canAdminister(actor)) redirect("/admin");
  return actor;
}

export async function startSession(userId: string): Promise<void> {
  const token = createSession(userId);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  destroySession(token);
  jar.delete(COOKIE);
}

export function go(path: string, tone: "ok" | "err", message: string): never {
  const id = createNotice(tone, message);
  const glue = path.includes("?") ? "&" : "?";
  redirect(`${path}${glue}notice=${id}`);
}
