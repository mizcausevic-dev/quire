import type { SearchInput } from "./search";

export type QueryState = {
  q: string;
  kind: string;
  category: string;
  tags: string[];
  model: string;
  sort: string;
  page: number;
  attributes: Record<string, string>;
};

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

function many(value: string | string[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map((item) => item.trim()).filter(Boolean))];
}

export function parseQuery(sp: Record<string, string | string[] | undefined>): QueryState {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (!key.startsWith("attr.")) continue;
    const text = one(value);
    if (text) attributes[key.slice(5)] = text;
  }
  const page = Number(one(sp.page) || "1");
  return {
    q: one(sp.q).slice(0, 200),
    kind: one(sp.kind),
    category: one(sp.category),
    tags: many(sp.tag),
    model: one(sp.model),
    sort: one(sp.sort),
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    attributes,
  };
}

export function toSearchInput(state: QueryState, placement?: SearchInput["placement"]): SearchInput {
  return {
    q: state.q,
    kind: state.kind,
    category: state.category,
    tags: state.tags,
    model: state.model,
    sort: state.sort,
    page: state.page,
    attributes: state.attributes,
    placement,
  };
}

export function buildHref(pathname: string, state: QueryState, patch: Partial<QueryState> = {}): string {
  const next: QueryState = {
    ...state,
    ...patch,
    attributes: patch.attributes ?? state.attributes,
    tags: patch.tags ?? state.tags,
  };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.kind) params.set("kind", next.kind);
  if (next.category) params.set("category", next.category);
  for (const tag of next.tags) params.append("tag", tag);
  if (next.model) params.set("model", next.model);
  if (next.sort) params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  for (const [key, value] of Object.entries(next.attributes)) if (value) params.set(`attr.${key}`, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function filteredState(state: QueryState, lockedCategory = ""): boolean {
  return Boolean(state.q || state.kind || state.tags.length || state.model || Object.keys(state.attributes).length || (state.category && state.category !== lockedCategory) || state.page > 1);
}
