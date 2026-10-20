import { redirect } from "next/navigation";
import { listUsers } from "@/lib/auth";
import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { canAdminister } from "@/lib/permissions";
import { roleAction } from "@/server/actions";
import { currentActor } from "@/server/session";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor || !canAdminister(actor)) redirect("/admin");
  const raw = await searchParams;
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <p>Changing a role does not transfer listings or start a subscription.</p>
      <ul>
        {listUsers().map((user) => (
          <li key={user.id}>
            {user.name} · {user.email} · {user.role}
            <form action={roleAction}>
              <input type="hidden" name="userId" value={user.id} />
              <select name="role" defaultValue={user.role}>
                <option value="user">User</option>
                <option value="moderator">Moderator</option>
                <option value="administrator">Administrator</option>
              </select>
              <button type="submit">Update role</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
