import Link from "next/link";
import { canAdminister } from "@/lib/permissions";
import { currentActor } from "@/server/session";
import type { ReactNode } from "react";
import { ThemePicker } from "./theme-picker";

export async function ConsoleFrame({ title, area, children }: { title: string; area: "admin" | "provider" | "account"; children: ReactNode }) {
  const actor = await currentActor();
  const admin = canAdminister(actor);
  return (
    <div className="console">
      <a className="skip" href="#content">Skip to content</a>
      <header className="wrap">
        <p className="kicker">{area === "admin" ? "Editorial desk" : area === "provider" ? "Provider desk" : "Your account"}</p>
        <h1>{title}</h1>
        <nav className="conav" aria-label="Desk">
          {area === "admin" ? (
            <>
              <Link href="/admin">Queue</Link>
              <Link href="/admin/claims">Claims</Link>
              <Link href="/admin/reviews">Reviews</Link>
              {admin ? <Link href="/admin/taxonomy">Taxonomy</Link> : null}
              {admin ? <Link href="/admin/imports">Imports</Link> : null}
              {admin ? <Link href="/admin/sponsorships">Sponsorships</Link> : null}
              {admin ? <Link href="/admin/users">Users</Link> : null}
              <Link href="/admin/articles">Journal</Link>
              <Link href="/admin/audit">Audit</Link>
            </>
          ) : null}
          {area === "provider" ? (
            <>
              <Link href="/provider">Listings</Link>
              <Link href="/provider/organization">Organization</Link>
              <Link href="/provider/claims">Claims</Link>
              <Link href="/provider/billing">Billing</Link>
              <Link href="/submit">New listing</Link>
            </>
          ) : null}
          {area === "account" ? (
            <>
              <Link href="/account">Home</Link>
              <Link href="/account/collections">Collections</Link>
              <Link href="/account/reviews">Reviews</Link>
            </>
          ) : null}
          <Link href="/">Public site</Link>
        </nav>
        {area === "account" ? null : <ThemePicker />}
        <p className="meta">{actor ? `${actor.name} · ${actor.role}` : "Signed out"}</p>
      </header>
      <main id="content" className="wrap">{children}</main>
    </div>
  );
}
