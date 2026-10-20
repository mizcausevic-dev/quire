import { isDemoNoindex, siteOrigin } from "./settings";

export const ROBOTS_DISALLOW = ["/account", "/admin", "/provider", "/api/", "/login", "/register", "/submit"];

const BLOCKED_PREFIXES = ["/search", "/listings", "/categories", "/compare", "/articles", "/"];

export function robotsDisallowRules(): string[] {
  for (const prefix of BLOCKED_PREFIXES) {
    if (ROBOTS_DISALLOW.some((rule) => rule === prefix || prefix.startsWith(rule))) {
      throw new Error(`Refusing to disallow ${prefix} while public pages rely on noindex.`);
    }
  }
  return [...ROBOTS_DISALLOW];
}

export function robotsFor(input: { indexable?: boolean; filtered?: boolean; page?: number } = {}): { index: boolean; follow: boolean } {
  if (isDemoNoindex()) return { index: false, follow: true };
  if (input.indexable === false) return { index: false, follow: true };
  if (input.filtered) return { index: false, follow: true };
  if ((input.page ?? 1) > 1) return { index: false, follow: true };
  return { index: true, follow: true };
}

export function canonicalUrl(path: string): string {
  const origin = siteOrigin();
  if (path === "/") return `${origin}/`;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isFilteredSearch(input: { q?: string; kind?: string; category?: string; tags?: string[]; model?: string; attributes?: Record<string, string>; page?: number }): boolean {
  if ((input.page ?? 1) > 1) return true;
  if (input.q?.trim()) return true;
  if (input.kind) return true;
  if (input.category) return true;
  if ((input.tags?.length ?? 0) > 0) return true;
  if (input.model) return true;
  return Object.values(input.attributes ?? {}).some((value) => value.trim() !== "");
}
