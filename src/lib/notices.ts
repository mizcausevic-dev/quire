import { randomUUID } from "node:crypto";
import { get, run } from "./db";
import { nowIso } from "./text";

export function createNotice(tone: "ok" | "err", message: string): string {
  const id = randomUUID();
  run("INSERT INTO notices (id, tone, message, created_at) VALUES (?, ?, ?, ?)", [
    id,
    tone,
    message.trim().slice(0, 500),
    nowIso(),
  ]);
  return id;
}

export function takeNotice(id: string | undefined): { tone: "ok" | "err"; message: string } | null {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = get<{ tone: "ok" | "err"; message: string }>("SELECT tone, message FROM notices WHERE id = ?", [id]);
  if (!row) return null;
  run("DELETE FROM notices WHERE id = ?", [id]);
  return row;
}
