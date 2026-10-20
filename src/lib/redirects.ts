import { randomUUID } from "node:crypto";
import { all, get, run } from "./db";
import { nowIso } from "./text";

export function findRedirect(fromPath: string): string | null {
  const row = get<{ to_path: string }>("SELECT to_path FROM slug_redirects WHERE from_path = ?", [fromPath]);
  return row?.to_path ?? null;
}

export function retargetRedirect(entityType: "listing" | "category" | "article", entityId: string, fromPath: string, toPath: string): void {
  if (fromPath === toPath) return;
  run("UPDATE slug_redirects SET to_path = ? WHERE entity_type = ? AND entity_id = ? AND to_path = ?", [
    toPath,
    entityType,
    entityId,
    fromPath,
  ]);
  const existing = get<{ id: string }>("SELECT id FROM slug_redirects WHERE from_path = ?", [fromPath]);
  if (existing) {
    run("UPDATE slug_redirects SET to_path = ?, entity_type = ?, entity_id = ? WHERE id = ?", [
      toPath,
      entityType,
      entityId,
      existing.id,
    ]);
  } else {
    run("INSERT INTO slug_redirects (id, entity_type, entity_id, from_path, to_path, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
      randomUUID(),
      entityType,
      entityId,
      fromPath,
      toPath,
      nowIso(),
    ]);
  }
  run("DELETE FROM slug_redirects WHERE from_path = to_path");
}

export function listRedirects(limit = 100): Array<{ entity_type: string; from_path: string; to_path: string; created_at: string }> {
  return all("SELECT entity_type, from_path, to_path, created_at FROM slug_redirects ORDER BY created_at DESC LIMIT ?", [limit]);
}
