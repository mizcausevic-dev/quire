import { PAGE_SIZE, SPONSORED_LIMIT } from "./constants";
import { all, get, run } from "./db";
import { organizationCanSponsor } from "./billing";
import { priceLabel, type PriceModel } from "./money";
import { definitionsForCategory, getCategoryBySlug, parseEnumOptions, type AttributeDefinition } from "./taxonomy";
import type { ListingKind } from "./types";
import type { SqlParam } from "./db";

export type SearchHit = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  kind: ListingKind;
  categoryName: string;
  categorySlug: string;
  parentName: string | null;
  parentSlug: string | null;
  providerName: string | null;
  priceLabel: string;
  isDemo: boolean;
  updatedAt: string;
  sponsored: boolean;
  disclosure: string | null;
  sponsorshipEnds: string | null;
};

export type SearchResponse = {
  hits: SearchHit[];
  sponsored: SearchHit[];
  total: number;
  page: number;
  pageSize: number;
  ignoredAttributeFilters: string[];
  appliedAttributeFilters: string[];
};

type Placement = "homepage" | "category" | "search";

function tokens(query: string): string[] {
  return (query.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 1).slice(0, 12);
}

export function toFtsQuery(query: string): string | null {
  const parts = tokens(query);
  if (parts.length === 0) return null;
  return parts.map((token) => `"${token}"`).join(" AND ");
}

function scopedDefinitions(categorySlug: string): AttributeDefinition[] {
  if (!categorySlug) {
    return all<AttributeDefinition>("SELECT * FROM attribute_definitions WHERE category_id IS NULL AND filterable = 1");
  }
  const category = getCategoryBySlug(categorySlug);
  if (!category) return [];
  return definitionsForCategory(category.id).filter((definition) => definition.filterable === 1);
}

type AttributeClause = { sql: string; params: SqlParam[] };

function attributeClauses(raw: Record<string, string>, categorySlug: string): { clauses: AttributeClause[]; ignored: string[]; applied: string[] } {
  const definitions = new Map(scopedDefinitions(categorySlug).map((definition) => [definition.key, definition]));
  const clauses: AttributeClause[] = [];
  const ignored: string[] = [];
  const applied: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const value = rawValue.trim();
    if (!value) continue;
    let op: "eq" | "gte" | "lte" = "eq";
    let key = rawKey;
    if (rawKey.endsWith("_gte")) {
      op = "gte";
      key = rawKey.slice(0, -4);
    } else if (rawKey.endsWith("_lte")) {
      op = "lte";
      key = rawKey.slice(0, -4);
    }
    const definition = definitions.get(key);
    if (!definition) {
      ignored.push(rawKey);
      continue;
    }
    if ((op === "gte" || op === "lte") && definition.value_type !== "number") {
      ignored.push(rawKey);
      continue;
    }
    if (definition.value_type === "boolean") {
      if (!["true", "false", "1", "0"].includes(value.toLowerCase())) {
        ignored.push(rawKey);
        continue;
      }
      const flag = value === "true" || value === "1" ? 1 : 0;
      clauses.push({
        sql: `EXISTS (SELECT 1 FROM listing_attribute_values v WHERE v.revision_id = r.id AND v.definition_id = ? AND v.value_boolean = ?)`,
        params: [definition.id, flag],
      });
    } else if (definition.value_type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        ignored.push(rawKey);
        continue;
      }
      const operator = op === "gte" ? ">=" : op === "lte" ? "<=" : "=";
      clauses.push({
        sql: `EXISTS (SELECT 1 FROM listing_attribute_values v WHERE v.revision_id = r.id AND v.definition_id = ? AND v.value_number ${operator} ?)`,
        params: [definition.id, number],
      });
    } else if (definition.value_type === "enum") {
      const options = parseEnumOptions(definition.enum_options);
      if (!options.includes(value)) {
        ignored.push(rawKey);
        continue;
      }
      clauses.push({
        sql: `EXISTS (SELECT 1 FROM listing_attribute_values v WHERE v.revision_id = r.id AND v.definition_id = ? AND v.value_text = ?)`,
        params: [definition.id, value],
      });
    } else {
      clauses.push({
        sql: `EXISTS (SELECT 1 FROM listing_attribute_values v WHERE v.revision_id = r.id AND v.definition_id = ? AND lower(v.value_text) = lower(?))`,
        params: [definition.id, value],
      });
    }
    applied.push(rawKey);
  }
  return { clauses, ignored, applied };
}

function priceSql(): string {
  return `(SELECT MIN(p.amount_cents) FROM listing_prices p WHERE p.revision_id = r.id AND p.amount_cents IS NOT NULL)`;
}

const HIT_SELECT = `
  l.id, l.slug, l.kind, l.is_demo, l.updated_at, l.organization_id, l.provider_label,
  r.title, r.summary, r.id AS revision_id,
  c.name AS category_name, c.slug AS category_slug,
  parent.name AS parent_name, parent.slug AS parent_slug,
  o.name AS organization_name
`;

function mapHit(row: Record<string, unknown>, sponsorship?: { disclosure: string; ends: string } | null): SearchHit {
  const prices = all<{ label: string; model: PriceModel; amount_cents: number | null; currency: string; billing_interval: "month" | "year" | null }>(
    "SELECT label, model, amount_cents, currency, billing_interval FROM listing_prices WHERE revision_id = ? ORDER BY sort_order, label",
    [String(row.revision_id)],
  );
  const primary = [...prices].sort((left, right) => {
    if (left.amount_cents === null) return 1;
    if (right.amount_cents === null) return -1;
    return left.amount_cents - right.amount_cents;
  })[0];
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    summary: String(row.summary),
    kind: row.kind as ListingKind,
    categoryName: String(row.category_name),
    categorySlug: String(row.category_slug),
    parentName: row.parent_name ? String(row.parent_name) : null,
    parentSlug: row.parent_slug ? String(row.parent_slug) : null,
    providerName: row.organization_name ? String(row.organization_name) : row.provider_label ? String(row.provider_label) : null,
    priceLabel: primary
      ? priceLabel({
          model: primary.model,
          amountCents: primary.amount_cents,
          currency: primary.currency,
          interval: primary.billing_interval,
          label: primary.label,
        })
      : "Price not listed",
    isDemo: Number(row.is_demo) === 1,
    updatedAt: String(row.updated_at),
    sponsored: Boolean(sponsorship),
    disclosure: sponsorship?.disclosure ?? null,
    sponsorshipEnds: sponsorship?.ends ?? null,
  };
}

export function reindexListing(listingId: string): void {
  run("DELETE FROM listing_search WHERE listing_id = ?", [listingId]);
  const row = get<{
    status: string;
    published_revision_id: string | null;
    provider_label: string | null;
    organization_name: string | null;
    title: string;
    summary: string;
    body: string;
    category_name: string;
    parent_name: string | null;
  }>(
    `SELECT l.status, l.published_revision_id, l.provider_label, o.name AS organization_name,
            r.title, r.summary, r.body, c.name AS category_name, parent.name AS parent_name
     FROM listings l
     LEFT JOIN listing_revisions r ON r.id = l.published_revision_id
     LEFT JOIN organizations o ON o.id = l.organization_id
     LEFT JOIN categories c ON c.id = r.category_id
     LEFT JOIN categories parent ON parent.id = c.parent_id
     WHERE l.id = ?`,
    [listingId],
  );
  if (!row || row.status !== "published" || !row.published_revision_id || !row.title) return;
  const tags = all<{ name: string }>(
    `SELECT t.name FROM listing_tags lt JOIN tags t ON t.id = lt.tag_id WHERE lt.revision_id = ? ORDER BY t.name`,
    [row.published_revision_id],
  )
    .map((tag) => tag.name)
    .join(" ");
  const category = [row.parent_name, row.category_name].filter(Boolean).join(" ");
  run(
    `INSERT INTO listing_search (listing_id, title, summary, body, provider, tags, category)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [listingId, row.title, row.summary, row.body, row.organization_name || row.provider_label || "", tags, category],
  );
}

type Built = { where: string[]; params: SqlParam[]; ignored: string[]; applied: string[]; fts: string | null; categorySlug: string };

function buildFilter(input: SearchInput): Built {
  const where = ["l.status = 'published'", "l.published_revision_id IS NOT NULL"];
  const params: SqlParam[] = [];
  const kind = input.kind === "software" || input.kind === "service" ? input.kind : "";
  if (kind) {
    where.push("r.kind = ?");
    params.push(kind);
  }
  const categorySlug = (input.category ?? "").trim();
  if (categorySlug) {
    const category = getCategoryBySlug(categorySlug);
    if (!category) {
      where.push("1 = 0");
    } else if (category.parent_id) {
      where.push("r.category_id = ?");
      params.push(category.id);
    } else {
      where.push("(r.category_id = ? OR c.parent_id = ?)");
      params.push(category.id, category.id);
    }
  }
  const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
  if (tags.length > 0) {
    where.push(
      `r.id IN (
        SELECT lt.revision_id FROM listing_tags lt
        JOIN tags t ON t.id = lt.tag_id
        WHERE t.slug IN (${tags.map(() => "?").join(", ")})
        GROUP BY lt.revision_id
        HAVING COUNT(DISTINCT t.slug) = ?
      )`,
    );
    params.push(...tags, tags.length);
  }
  const models = ["free", "subscription", "one_time", "usage", "contact"];
  if (input.model && models.includes(input.model)) {
    where.push("EXISTS (SELECT 1 FROM listing_prices p WHERE p.revision_id = r.id AND p.model = ?)");
    params.push(input.model);
  }
  const attributes = attributeClauses(input.attributes ?? {}, categorySlug);
  for (const clause of attributes.clauses) {
    where.push(clause.sql);
    params.push(...clause.params);
  }
  return { where, params, ignored: attributes.ignored, applied: attributes.applied, fts: toFtsQuery(input.q ?? ""), categorySlug };
}

function fromSql(fts: string | null): string {
  const ftsJoin = fts ? "JOIN listing_search ON listing_search.listing_id = l.id" : "";
  return `
    FROM listings l
    JOIN listing_revisions r ON r.id = l.published_revision_id
    JOIN categories c ON c.id = r.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    ${ftsJoin}
  `;
}

export type SearchInput = {
  q?: string;
  kind?: string;
  category?: string;
  tags?: string[];
  model?: string;
  sort?: string;
  page?: number;
  attributes?: Record<string, string>;
  placement?: Placement;
  now?: Date;
  excludeIds?: string[];
};

function liveSponsorships(placement: Placement, now: Date): Array<{ listing_id: string; disclosure: string; ends_at: string; organization_id: string | null; requires_entitlement: number }> {
  return all<{ listing_id: string; disclosure: string; ends_at: string; organization_id: string | null; requires_entitlement: number }>(
    `SELECT sp.listing_id, sp.disclosure, sp.ends_at, l.organization_id, sp.requires_entitlement
     FROM sponsored_placements sp
     JOIN listings l ON l.id = sp.listing_id AND l.status = 'published'
     WHERE sp.status = 'scheduled'
       AND sp.placement = ?
       AND sp.starts_at <= ?
       AND sp.ends_at > ?
     ORDER BY sp.starts_at DESC`,
    [placement, now.toISOString(), now.toISOString()],
  ).filter((row) => row.requires_entitlement === 0 || organizationCanSponsor(row.organization_id, now));
}

export function searchListings(input: SearchInput = {}): SearchResponse {
  const now = input.now ?? new Date();
  const built = buildFilter(input);
  const ftsParams = built.fts ? [built.fts] : [];
  const ftsWhere = built.fts ? [...built.where, "listing_search MATCH ?"] : built.where;
  const whereSql = ftsWhere.join(" AND ");
  const baseParams = [...built.params, ...ftsParams];
  const matched = all<{ id: string }>(`SELECT l.id ${fromSql(built.fts)} WHERE ${whereSql}`, baseParams);
  const matchedIds = new Set(matched.map((row) => row.id));
  const placement = input.placement ?? (built.categorySlug ? "category" : input.q ? "search" : "");
  const sponsoredRows = placement ? liveSponsorships(placement, now).filter((row) => matchedIds.has(row.listing_id)).slice(0, SPONSORED_LIMIT) : [];
  const sponsoredIds = sponsoredRows.map((row) => row.listing_id);
  const exclude = [...sponsoredIds, ...(input.excludeIds ?? [])];
  const exclusion = exclude.length ? ` AND l.id NOT IN (${exclude.map(() => "?").join(", ")})` : "";
  const sort = input.sort === "name" || input.sort === "price_asc" || input.sort === "price_desc" || input.sort === "relevance" || input.sort === "newest"
    ? input.sort
    : built.fts
      ? "relevance"
      : "newest";
  let order = "l.updated_at DESC, r.title COLLATE NOCASE ASC";
  if (sort === "name") order = "r.title COLLATE NOCASE ASC";
  if (sort === "price_asc") order = `${priceSql()} ASC NULLS LAST, r.title COLLATE NOCASE ASC`;
  if (sort === "price_desc") order = `${priceSql()} DESC NULLS LAST, r.title COLLATE NOCASE ASC`;
  if (sort === "relevance" && built.fts) order = "bm25(listing_search, 0.001, 8.0, 4.0, 1.0, 3.0, 2.0, 2.0) ASC";
  if (sort === "relevance" && !built.fts) order = "l.updated_at DESC, r.title COLLATE NOCASE ASC";
  const page = Number.isFinite(input.page) && (input.page ?? 1) > 0 ? Math.floor(input.page ?? 1) : 1;
  const totalRow = get<{ count: number }>(
    `SELECT COUNT(*) AS count ${fromSql(built.fts)} WHERE ${whereSql}${exclusion}`,
    [...baseParams, ...exclude],
  );
  const rows = all<Record<string, unknown>>(
    `SELECT ${HIT_SELECT} ${fromSql(built.fts)} WHERE ${whereSql}${exclusion} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...baseParams, ...exclude, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  const sponsored = sponsoredIds.length
    ? all<Record<string, unknown>>(
        `SELECT ${HIT_SELECT} ${fromSql(null)} WHERE l.id IN (${sponsoredIds.map(() => "?").join(", ")})`,
        sponsoredIds,
      )
    : [];
  const sponsorById = new Map(sponsoredRows.map((row) => [row.listing_id, row]));
  const orderedSponsored = sponsoredIds
    .map((id) => sponsored.find((row) => row.id === id))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => {
      const meta = sponsorById.get(String(row.id));
      return mapHit(row, meta ? { disclosure: meta.disclosure, ends: meta.ends_at } : null);
    });
  return {
    hits: rows.map((row) => mapHit(row)),
    sponsored: orderedSponsored,
    total: totalRow?.count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    ignoredAttributeFilters: built.ignored,
    appliedAttributeFilters: built.applied,
  };
}
