export const PAGE_SIZE = 12;
export const MAX_COMPARE = 4;
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_ROWS = 500;
export const SESSION_DAYS = 14;
export const MAX_COLLECTIONS = 20;
export const MAX_COLLECTION_ITEMS = 100;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 8;
export const SPONSORED_LIMIT = 3;

export const RESERVED_SLUGS = new Set([
  "admin",
  "account",
  "api",
  "login",
  "register",
  "search",
  "compare",
  "submit",
  "provider",
  "categories",
  "listings",
  "articles",
]);
