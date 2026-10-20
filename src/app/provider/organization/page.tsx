import { Notice } from "@/components/notice";
import { takeNotice } from "@/lib/notices";
import { listMembers, listOrganizationsForUser } from "@/lib/orgs";
import { organizationAction } from "@/server/actions";
import { currentActor } from "@/server/session";

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor) return null;
  const raw = await searchParams;
  const organizations = listOrganizationsForUser(actor.id);
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <form className="form" action={organizationAction}>
        <input type="hidden" name="intent" value="create" />
        <h2>New organization</h2>
        <label>Name<input name="name" required /></label>
        <label>Website<input name="website" type="url" /></label>
        <label>Description<textarea name="description" /></label>
        <button type="submit">Create organization</button>
      </form>
      {organizations.map((org) => (
        <section className="panel" key={org.id}>
          <h2>{org.name}</h2>
          <p>Your membership: {org.role}. This does not attach existing listings.</p>
          <ul>{listMembers(org.id).map((member) => <li key={member.email}>{member.name} · {member.email} · {member.role}</li>)}</ul>
          {org.role === "owner" ? (
            <form className="form" action={organizationAction}>
              <input type="hidden" name="organizationId" value={org.id} />
              <label>Member email<input name="email" type="email" required /></label>
              <label>Role
                <select name="role" defaultValue="editor">
                  <option value="editor">Editor</option>
                  <option value="billing">Billing</option>
                  <option value="owner">Owner</option>
                  <option value="remove">Remove</option>
                </select>
              </label>
              <button type="submit">Update member</button>
            </form>
          ) : null}
        </section>
      ))}
    </>
  );
}
