import { createHash, randomBytes, randomUUID } from "node:crypto";
import { audit } from "./audit";
import { LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS, SESSION_DAYS } from "./constants";
import { all, get, run } from "./db";
import { AppError } from "./errors";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./passwords";
import { assertPassword, assertPersonName, normalizeEmail, nowIso } from "./text";
import type { Actor, Role } from "./types";

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  privacy_accepted_at: string | null;
};

function toActor(row: UserRow): Actor {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function createUser(input: {
  email: string;
  name: string;
  password: string;
  role?: Role;
  acceptPrivacy: boolean;
}): Actor {
  if (!input.acceptPrivacy) {
    throw new AppError("Accept the privacy notice to create an account.", "privacy");
  }
  const email = normalizeEmail(input.email);
  const name = assertPersonName(input.name);
  assertPassword(input.password);
  const existing = get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) throw new AppError("An account with that email already exists.", "email");
  const now = nowIso();
  const id = randomUUID();
  const role = input.role ?? "user";
  run(
    `INSERT INTO users (id, email, name, password_hash, role, privacy_accepted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, email, name, hashPassword(input.password), role, now, now, now],
  );
  audit(id, "user.register", "user", id, `Registered ${email} as ${role}.`);
  return { id, email, name, role };
}

export function registerUser(input: { email: string; name: string; password: string; acceptPrivacy: boolean }): Actor {
  return createUser({ ...input, role: "user" });
}

export function getUser(id: string): UserRow | undefined {
  return get<UserRow>("SELECT id, email, name, password_hash, role, privacy_accepted_at FROM users WHERE id = ?", [id]);
}

function recentFailures(email: string, now: Date): number {
  const cutoff = new Date(now.getTime() - LOGIN_WINDOW_MS).toISOString();
  run("DELETE FROM login_attempts WHERE created_at < ?", [cutoff]);
  const row = get<{ count: number }>("SELECT COUNT(*) AS count FROM login_attempts WHERE email = ? AND created_at >= ?", [
    email,
    cutoff,
  ]);
  return row?.count ?? 0;
}

export function authenticate(emailInput: string, password: string): Actor | null {
  let email = emailInput.trim().toLowerCase();
  try {
    email = normalizeEmail(emailInput);
  } catch {
    verifyPassword(password, dummyPasswordHash());
    return null;
  }
  const user = get<UserRow>("SELECT id, email, name, password_hash, role, privacy_accepted_at FROM users WHERE email = ?", [email]);
  const ok = verifyPassword(password, user?.password_hash ?? dummyPasswordHash());
  if (!user || !ok) return null;
  return toActor(user);
}

export function loginWithLimits(emailInput: string, password: string, now = new Date()): Actor {
  let email = emailInput.trim().toLowerCase();
  try {
    email = normalizeEmail(emailInput);
  } catch {
    throw new AppError("Email or password is wrong.", "auth");
  }
  if (recentFailures(email, now) >= LOGIN_MAX_ATTEMPTS) {
    throw new AppError("Too many sign-in attempts. Wait a few minutes and try again.", "rate");
  }
  const actor = authenticate(email, password);
  if (!actor) {
    run("INSERT INTO login_attempts (id, email, created_at) VALUES (?, ?, ?)", [randomUUID(), email, now.toISOString()]);
    throw new AppError("Email or password is wrong.", "auth");
  }
  run("DELETE FROM login_attempts WHERE email = ?", [email]);
  return actor;
}

export function createSession(userId: string, now = new Date()): string {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  run("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", [
    randomUUID(),
    userId,
    tokenHash,
    expires,
    now.toISOString(),
  ]);
  return token;
}

export function actorFromSession(token: string | undefined, now = new Date()): Actor | null {
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = get<{ user_id: string; expires_at: string }>("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?", [tokenHash]);
  if (!row) return null;
  if (row.expires_at <= now.toISOString()) {
    run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
    return null;
  }
  const user = getUser(row.user_id);
  return user ? toActor(user) : null;
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
}

export function changeUserRole(actor: Actor, userId: string, role: Role): void {
  if (actor.role !== "administrator") throw new AppError("Administrator permission required.", "forbidden");
  if (!["user", "moderator", "administrator"].includes(role)) throw new AppError("Unknown role.", "role");
  const target = getUser(userId);
  if (!target) throw new AppError("User not found.", "missing");
  if (target.role === "administrator" && role !== "administrator") {
    const admins = get<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE role = 'administrator'");
    if ((admins?.count ?? 0) <= 1) throw new AppError("Keep at least one administrator.", "role");
  }
  run("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", [role, nowIso(), userId]);
  audit(actor.id, "user.role", "user", userId, `Changed role from ${target.role} to ${role}.`);
}

export function listUsers(): Array<{ id: string; email: string; name: string; role: Role; created_at: string }> {
  return all("SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC");
}
