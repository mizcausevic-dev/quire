import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap" id="content">
      <p className="kicker">404</p>
      <h1>That page is not in the catalog.</h1>
      <p>The address may be mistyped, or the entry was never published. Archived entries keep their own addresses and say so.</p>
      <p><Link href="/">Return to the contents</Link></p>
    </main>
  );
}
