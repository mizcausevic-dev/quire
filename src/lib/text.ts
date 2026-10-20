import { createHash } from "node:crypto";
import { RESERVED_SLUGS } from "./constants";
import { AppError } from "./errors";

export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "entry";
}

export function assertSlug(slug: string): string {
  const value = slugify(slug);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80) {
    throw new AppError("Use a slug made of lowercase letters, numbers, and hyphens.", "slug");
  }
  if (RESERVED_SLUGS.has(value)) {
    throw new AppError("That slug is reserved.", "slug");
  }
  return value;
}

export function uniqueSlug(base: string, taken: (slug: string) => boolean): string {
  const root = assertSlug(base);
  if (!taken(root)) return root;
  for (let index = 2; index < 1000; index += 1) {
    const next = `${root.slice(0, 70)}-${index}`;
    if (!taken(next)) return next;
  }
  throw new AppError("Could not reserve a unique slug.", "slug");
}

export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (value.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new AppError("Enter a valid email address.", "email");
  }
  return value;
}

export function assertPersonName(name: string): string {
  const value = name.trim().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 80) {
    throw new AppError("Enter a name between 2 and 80 characters.", "name");
  }
  return value;
}

export function assertPassword(password: string): void {
  if (password.length < 10 || password.length > 200) {
    throw new AppError("Use a password between 10 and 200 characters.", "password");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AppError("Use a password with at least one letter and one number.", "password");
  }
}

export function safeNextPath(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\")) {
    return fallback;
  }
  return value;
}

export function clip(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function assertMediaPath(value: string): string {
  if (!/^\/media\/[a-z0-9][a-z0-9/_-]*\.(svg|png|webp|jpe?g)$/.test(value)) {
    throw new AppError("Images must use a local /media path ending in svg, png, webp, or jpg.", "image");
  }
  return value;
}

export function paragraphs(value: string): string[] {
  return value
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}
