import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import { all, get, run, withTransaction } from "./db";
import { AppError } from "./errors";
import { canAdminister } from "./permissions";
import { isHttpUrl, nowIso, uniqueSlug } from "./text";
import type { Actor, MembershipRole } from "./types";

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  description: string;
  role?: MembershipRole;
};

export function createOrganization(actor: Actor, input: { name: string; website?: string; description?: string }): { id: string; slug: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) throw new AppError("Enter an organization name between 2 and 120 characters.", "name");
  const website = input.website?.trim() || "";
  if (website && !isHttpUrl(website)) throw new AppError("Organization websites must start with http:// or https://.", "url");
  const description = (input.description ?? "").trim().slice(0, 2000);
  return withTransaction(() => {
    const slug = uniqueSlug(name, (candidate) => Boolean(get("SELECT id FROM organizations WHERE slug = ?", [candidate])));
    const id = randomUUID();
    const now = nowIso();
    run("INSERT INTO organizations (id, name, slug, website, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      id,
      name,
      slug,
      website || null,
      description,
      now,
      now,
    ]);
    run("INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)", [
      randomUUID(),
      id,
      actor.id,
      now,
    ]);
    audit(actor.id, "organization.create", "organization", id, `Created ${name}.`);
    return { id, slug };
  });
}

function membershipRole(actor: Actor, organizationId: string): MembershipRole | null {
  const row = get<{ role: MembershipRole }>("SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ?", [
    organizationId,
    actor.id,
  ]);
  return row?.role ?? null;
}

export function setMembership(actor: Actor, organizationId: string, email: string, role: MembershipRole | "remove"): void {
  const mine = membershipRole(actor, organizationId);
  if (!canAdminister(actor) && mine !== "owner") {
    throw new AppError("Only an organization owner or an administrator can change members.", "forbidden");
  }
  const user = get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email.trim().toLowerCase()]);
  if (!user) throw new AppError("No account uses that email.", "missing");
  const existing = get<{ role: MembershipRole }>("SELECT role FROM organization_memberships WHERE organization_id = ? AND user_id = ?", [
    organizationId,
    user.id,
  ]);
  if (role === "remove" || (existing && role !== existing.role && existing.role === "owner")) {
    const owners = get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM organization_memberships WHERE organization_id = ? AND role = 'owner'",
      [organizationId],
    );
    if (existing?.role === "owner" && (owners?.count ?? 0) <= 1) {
      throw new AppError("Keep at least one organization owner.", "membership");
    }
  }
  if (role === "remove") {
    run("DELETE FROM organization_memberships WHERE organization_id = ? AND user_id = ?", [organizationId, user.id]);
    audit(actor.id, "organization.member.remove", "organization", organizationId, `Removed ${email}.`);
    return;
  }
  if (!["owner", "editor", "billing"].includes(role)) throw new AppError("Unknown membership role.", "membership");
  if (existing) {
    run("UPDATE organization_memberships SET role = ? WHERE organization_id = ? AND user_id = ?", [role, organizationId, user.id]);
  } else {
    run("INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)", [
      randomUUID(),
      organizationId,
      user.id,
      role,
      nowIso(),
    ]);
  }
  audit(actor.id, "organization.member.set", "organization", organizationId, `Set ${email} to ${role}.`);
}

export function listOrganizationsForUser(userId: string): OrganizationRecord[] {
  return all<OrganizationRecord>(
    `SELECT o.id, o.name, o.slug, o.website, o.description, m.role
     FROM organizations o
     JOIN organization_memberships m ON m.organization_id = o.id
     WHERE m.user_id = ?
     ORDER BY o.name COLLATE NOCASE`,
    [userId],
  );
}

export function getOrganization(id: string): OrganizationRecord | undefined {
  return get<OrganizationRecord>("SELECT id, name, slug, website, description FROM organizations WHERE id = ?", [id]);
}

export function getOrganizationBySlug(slug: string): OrganizationRecord | undefined {
  return get<OrganizationRecord>("SELECT id, name, slug, website, description FROM organizations WHERE slug = ?", [slug]);
}

export function listMembers(organizationId: string): Array<{ email: string; name: string; role: MembershipRole }> {
  return all(
    `SELECT u.email, u.name, m.role
     FROM organization_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = ?
     ORDER BY u.name`,
    [organizationId],
  );
}
