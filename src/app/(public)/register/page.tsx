import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { robotsFor } from "@/lib/seo";
import { safeNextPath } from "@/lib/text";
import { registerAction } from "@/server/actions";

export const metadata: Metadata = { title: "Create account", robots: robotsFor({ indexable: false }) };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const next = safeNextPath(typeof raw.next === "string" ? raw.next : "/account", "/account");
  return (
    <div className="wrap">
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <h1>Create an account</h1>
      <p>Registration makes a reader account. It does not make you a provider owner, a moderator, or a paid subscriber.</p>
      <form className="form" action={registerAction}>
        <input type="hidden" name="next" value={next} />
        <label>Name<input name="name" required autoComplete="name" /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required autoComplete="new-password" minLength={10} /></label>
        <label className="check"><input type="checkbox" name="privacy" value="yes" required /> I have read the <Link href="/privacy">privacy notice</Link>.</label>
        <button type="submit">Create account</button>
      </form>
    </div>
  );
}
