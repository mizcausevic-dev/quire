import { randomUUID } from "node:crypto";
import { all, run } from "./db";
import { nowIso } from "./text";

export function listAuditEvents(limit = 100, offset = 0): Array<{ id: string; actor_user_id: string | null; actor_email: string | null; action: string; entity_type: string; entity_id: string; detail: string; created_at: string }> {
  return all(
    `SELECT a.id, a.actor_user_id, u.email AS actor_email, a.action, a.entity_type, a.entity_id, a.detail, a.created_at
     FROM audit_events a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
}

export function audit(actorId: string | null, action: string, entityType: string, entityId: string, detail: string): void {
  run(
    `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), actorId, action, entityType, entityId, detail.trim().slice(0, 500), nowIso()],
  );
}
