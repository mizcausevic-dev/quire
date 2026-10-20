import { get, run } from "./db";

export function getSetting(key: string, fallback = ""): string {
  const row = get<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export function demoBanner(): string | null {
  if (getSetting("demo_banner", "0") !== "1") return null;
  return getSetting(
    "demo_banner_text",
    "Demonstration catalog. Every organization, listing, and review in this database is fictional.",
  );
}

export function isDemoNoindex(): boolean {
  return process.env.QUIRE_DEMO_NOINDEX !== "0";
}

export function siteOrigin(): string {
  return (process.env.QUIRE_CANONICAL_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
}
