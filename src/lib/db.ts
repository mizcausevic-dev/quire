import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqlParam = string | number | bigint | null;

type Cache = { db: DatabaseSync; path: string; txDepth: number };

const globalCache = globalThis as unknown as { __quire?: Cache; __quireMigrated?: string; __quireMigrating?: boolean };

export function databasePath(): string {
  return process.env.QUIRE_DB_PATH || path.join(process.cwd(), "data", "quire.sqlite");
}

export function closeDatabase(): void {
  const cache = globalCache.__quire;
  if (!cache) return;
  try {
    cache.db.close();
  } catch {
    /* already closed */
  }
  delete globalCache.__quire;
  delete globalCache.__quireMigrated;
}

export function getDb(): DatabaseSync {
  const file = databasePath();
  const existing = globalCache.__quire;
  if (existing && existing.path === file) return existing.db;
  if (existing) closeDatabase();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  globalCache.__quire = { db, path: file, txDepth: 0 };
  ensureMigrated(file);
  return db;
}

function ensureMigrated(file: string): void {
  if (globalCache.__quireMigrated === file || globalCache.__quireMigrating) return;
  globalCache.__quireMigrating = true;
  try {
    migrate();
    globalCache.__quireMigrated = file;
  } finally {
    globalCache.__quireMigrating = false;
  }
}

function state(): Cache {
  getDb();
  const cache = globalCache.__quire;
  if (!cache) throw new Error("Database failed to open.");
  return cache;
}

export function all<T>(sql: string, params: SqlParam[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, params: SqlParam[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: SqlParam[] = []): void {
  getDb().prepare(sql).run(...params);
}

export function withTransaction<T>(fn: () => T): T {
  const cache = state();
  if (cache.txDepth > 0) return fn();
  cache.txDepth += 1;
  cache.db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    cache.db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      cache.db.exec("ROLLBACK");
    } catch {
      /* ignore rollback failure */
    }
    throw error;
  } finally {
    cache.txDepth -= 1;
  }
}

export function migrate(): string[] {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const existing = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(id);
    if (existing) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(id, new Date().toISOString());
      db.exec("COMMIT");
      applied.push(id);
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    }
  }
  return applied;
}
