import Link from "next/link";
import { demoBanner } from "@/lib/settings";
import { logoutAction } from "@/server/actions";
import { currentActor } from "@/server/session";
import type { ReactNode } from "react";

export async function PublicFrame({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  const banner = demoBanner();
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      {banner ? <p className="banner">{banner}</p> : null}
      <header className="mast">
        <div className="wrap">
          <p className="issue">Vol. 01 · Edited catalog</p>
          <div className="mast-row">
            <div>
              <Link className="wordmark" href="/">Qu<span className="mark">i</span>re</Link>
              <p className="mast-dek">An edited catalog of software products and service providers. Listings are published by editors, not by a checkout.</p>
            </div>
          </div>
          <nav className="nav" aria-label="Primary">
            <Link href="/categories/software">Software</Link>
            <Link href="/categories/services">Services</Link>
            <Link href="/articles">Journal</Link>
            <Link href="/compare">Compare</Link>
            <Link href="/search">Search</Link>
            <Link href="/submit">Submit</Link>
            {actor ? <Link href="/account">Account</Link> : <Link href="/login">Sign in</Link>}
            {actor ? <Link href="/provider">Provider</Link> : null}
            {actor && (actor.role === "moderator" || actor.role === "administrator") ? <Link href="/admin">Desk</Link> : null}
            <form className="searchline" action="/search" method="get" role="search">
              <label className="vh" htmlFor="mast-q">Search the catalog</label>
              <input id="mast-q" name="q" type="search" placeholder="Search the catalog" />
              <button type="submit">Search</button>
            </form>
          </nav>
        </div>
      </header>
      <main id="content">{children}</main>
      <footer className="footer wrap">
        <p>Quire is a Kinetic Gain demonstration of an editorial directory. It does not sell buyer-seller checkout.</p>
        <nav aria-label="Footer">
          <Link href="/about">About</Link>
          {" · "}
          <Link href="/editorial-standards">Standards</Link>
          {" · "}
          <Link href="/privacy">Privacy</Link>
        </nav>
        {actor ? (
          <form action={logoutAction}>
            <button className="secondary" type="submit">Sign out {actor.name}</button>
          </form>
        ) : null}
      </footer>
    </>
  );
}
