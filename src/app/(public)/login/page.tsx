import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { robotsFor } from "@/lib/seo";
import { safeNextPath } from "@/lib/text";
import { loginAction } from "@/server/actions";

export const metadata: Metadata = { title: "Sign in", robots: robotsFor({ indexable: false }) };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const next = safeNextPath(typeof raw.next === "string" ? raw.next : "/account", "/account");
  return (
    <div className="wrap">
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <h1>Sign in</h1>
      <form className="form" action={loginAction}>
        <input type="hidden" name="next" value={next} />
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit">Sign in</button>
      </form>
      <p><Link href={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </div>
  );
}
