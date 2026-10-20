import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import { all, get, run, withTransaction } from "./db";
import { AppError } from "./errors";
import { canAdminister } from "./permissions";
import { retargetRedirect } from "./redirects";
import { assertSlug, nowIso, slugify, uniqueSlug } from "./text";
import type { Actor, AttributeType, ListingKind } from "./types";

export type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string;
  kind: ListingKind;
  sort_order: number;
};

export type AttributeDefinition = {
  id: string;
  category_id: string | null;
  key: string;
  label: string;
  value_type: AttributeType;
  enum_options: string | null;
  required: number;
  filterable: number;
  unit: string | null;
  sort_order: number;
};

export function listCategories(): CategoryRow[] {
  return all<CategoryRow>("SELECT id, parent_id, name, slug, description, kind, sort_order FROM categories ORDER BY sort_order, name");
}

export function getCategory(id: string): CategoryRow | undefined {
  return get<CategoryRow>("SELECT id, parent_id, name, slug, description, kind, sort_order FROM categories WHERE id = ?", [id]);
}

export function getCategoryBySlug(slug: string): CategoryRow | undefined {
  return get<CategoryRow>("SELECT id, parent_id, name, slug, description, kind, sort_order FROM categories WHERE slug = ?", [slug]);
}

export function categoryTree(): Array<CategoryRow & { children: CategoryRow[]; publishedCount: number }> {
  const categories = listCategories();
  return categories
    .filter((category) => !category.parent_id)
    .map((parent) => {
      const children = categories.filter((category) => category.parent_id === parent.id);
      const ids = [parent.id, ...children.map((child) => child.id)];
      const placeholders = ids.map(() => "?").join(", ");
      const count = get<{ count: number }>(
        `SELECT COUNT(*) AS count
         FROM listings l
         JOIN listing_revisions r ON r.id = l.published_revision_id
         WHERE l.status = 'published' AND r.category_id IN (${placeholders})`,
        ids,
      );
      return { ...parent, children, publishedCount: count?.count ?? 0 };
    });
}

export function saveCategory(
  actor: Actor,
  input: { id?: string; parentId?: string | null; name: string; slug?: string; description?: string; kind: ListingKind; sortOrder?: number },
): CategoryRow {
  if (!canAdminister(actor)) throw new AppError("Administrator permission required.", "forbidden");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new AppError("Category names must be 2 to 80 characters.", "name");
  if (input.kind !== "software" && input.kind !== "service") throw new AppError("Category kind must be software or service.", "kind");
  const parent = input.parentId ? getCategory(input.parentId) : undefined;
  if (input.parentId && !parent) throw new AppError("Parent category not found.", "category");
  if (parent?.parent_id) throw new AppError("Categories only go two levels deep.", "category");
  if (parent && parent.kind !== input.kind) throw new AppError("A subcategory must use the same kind as its parent.", "kind");
  const description = (input.description ?? "").trim().slice(0, 2000);
  const sortOrder = input.sortOrder ?? 0;
  return withTransaction(() => {
    if (!input.id) {
      const slug = uniqueSlug(input.slug || name, (candidate) => Boolean(get("SELECT id FROM categories WHERE slug = ?", [candidate])));
      const id = randomUUID();
      const now = nowIso();
      run(
        `INSERT INTO categories (id, parent_id, name, slug, description, kind, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, parent?.id ?? null, name, slug, description, input.kind, sortOrder, now, now],
      );
      audit(actor.id, "taxonomy.category.create", "category", id, `Created category ${name}.`);
      const created = getCategory(id);
      if (!created) throw new AppError("Category could not be saved.", "category");
      return created;
    }
    const current = getCategory(input.id);
    if (!current) throw new AppError("Category not found.", "missing");
    if (parent?.id === current.id) throw new AppError("A category cannot be its own parent.", "category");
    const slug = input.slug ? assertSlug(input.slug) : current.slug;
    if (slug !== current.slug) {
      const clash = get("SELECT id FROM categories WHERE slug = ? AND id != ?", [slug, current.id]);
      if (clash) throw new AppError("That category slug is already in use.", "slug");
      retargetRedirect("category", current.id, `/categories/${current.slug}`, `/categories/${slug}`);
    }
    run(
      `UPDATE categories
       SET parent_id = ?, name = ?, slug = ?, description = ?, kind = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [parent?.id ?? null, name, slug, description, input.kind, sortOrder, nowIso(), current.id],
    );
    audit(actor.id, "taxonomy.category.update", "category", current.id, `Updated category ${name}.`);
    const updated = getCategory(current.id);
    if (!updated) throw new AppError("Category could not be saved.", "category");
    return updated;
  });
}

export function deleteCategory(actor: Actor, id: string): void {
  if (!canAdminister(actor)) throw new AppError("Administrator permission required.", "forbidden");
  const children = get<{ count: number }>("SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?", [id]);
  if ((children?.count ?? 0) > 0) throw new AppError("Move or delete subcategories first.", "category");
  const listings = get<{ count: number }>("SELECT COUNT(*) AS count FROM listings WHERE category_id = ?", [id]);
  const revisions = get<{ count: number }>("SELECT COUNT(*) AS count FROM listing_revisions WHERE category_id = ?", [id]);
  if ((listings?.count ?? 0) > 0 || (revisions?.count ?? 0) > 0) {
    throw new AppError("This category still has listings.", "category");
  }
  run("DELETE FROM categories WHERE id = ?", [id]);
  audit(actor.id, "taxonomy.category.delete", "category", id, "Deleted an unused category.");
}

export function listAttributeDefinitions(): AttributeDefinition[] {
  return all<AttributeDefinition>("SELECT * FROM attribute_definitions ORDER BY sort_order, key");
}

export function definitionsForCategory(categoryId: string): AttributeDefinition[] {
  const category = getCategory(categoryId);
  if (!category) return [];
  return all<AttributeDefinition>(
    `SELECT * FROM attribute_definitions
     WHERE category_id IS NULL OR category_id = ? OR (? IS NOT NULL AND category_id = ?)
     ORDER BY sort_order, key`,
    [categoryId, category.parent_id, category.parent_id],
  );
}

export function parseEnumOptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveAttributeDefinition(
  actor: Actor,
  input: {
    id?: string;
    categoryId?: string | null;
    key: string;
    label: string;
    valueType: AttributeType;
    enumOptions?: string[];
    required?: boolean;
    filterable?: boolean;
    unit?: string;
    sortOrder?: number;
  },
): void {
  if (!canAdminister(actor)) throw new AppError("Administrator permission required.", "forbidden");
  const key = slugify(input.key).replace(/-/g, "_");
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) throw new AppError("Attribute keys use lowercase letters, numbers, and underscores.", "attribute");
  const label = input.label.trim();
  if (label.length < 2 || label.length > 80) throw new AppError("Attribute labels must be 2 to 80 characters.", "attribute");
  const types: AttributeType[] = ["text", "long_text", "number", "boolean", "enum", "url"];
  if (!types.includes(input.valueType)) throw new AppError("Unknown attribute type.", "attribute");
  if (input.categoryId && !getCategory(input.categoryId)) throw new AppError("Category not found.", "category");
  const enumOptions = input.valueType === "enum" ? (input.enumOptions ?? []).map((item) => item.trim()).filter(Boolean) : [];
  if (input.valueType === "enum" && enumOptions.length < 2) throw new AppError("Enum attributes need at least two options.", "attribute");
  const enumJson = input.valueType === "enum" ? JSON.stringify(enumOptions) : null;
  if (input.id) {
    const current = get<AttributeDefinition>("SELECT * FROM attribute_definitions WHERE id = ?", [input.id]);
    if (!current) throw new AppError("Attribute not found.", "missing");
    if (current.value_type !== input.valueType) {
      const used = get<{ count: number }>("SELECT COUNT(*) AS count FROM listing_attribute_values WHERE definition_id = ?", [input.id]);
      if ((used?.count ?? 0) > 0) throw new AppError("Cannot change the type of an attribute that already has values.", "attribute");
    }
    run(
      `UPDATE attribute_definitions
       SET category_id = ?, key = ?, label = ?, value_type = ?, enum_options = ?, required = ?, filterable = ?, unit = ?, sort_order = ?
       WHERE id = ?`,
      [
        input.categoryId || null,
        key,
        label,
        input.valueType,
        enumJson,
        input.required ? 1 : 0,
        input.filterable ? 1 : 0,
        input.unit?.trim() || null,
        input.sortOrder ?? 0,
        input.id,
      ],
    );
    audit(actor.id, "taxonomy.attribute.update", "attribute_definition", input.id, `Updated attribute ${key}.`);
    return;
  }
  const id = randomUUID();
  run(
    `INSERT INTO attribute_definitions
      (id, category_id, key, label, value_type, enum_options, required, filterable, unit, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.categoryId || null, key, label, input.valueType, enumJson, input.required ? 1 : 0, input.filterable ? 1 : 0, input.unit?.trim() || null, input.sortOrder ?? 0],
  );
  audit(actor.id, "taxonomy.attribute.create", "attribute_definition", id, `Created attribute ${key}.`);
}

export function listTags(): Array<{ id: string; name: string; slug: string }> {
  return all("SELECT id, name, slug FROM tags ORDER BY name COLLATE NOCASE");
}

export function saveTag(actor: Actor, name: string): { id: string; slug: string } {
  if (!canAdminister(actor)) throw new AppError("Administrator permission required.", "forbidden");
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 40) throw new AppError("Tag names must be 2 to 40 characters.", "tag");
  const slug = slugify(clean);
  const existing = get<{ id: string; slug: string }>("SELECT id, slug FROM tags WHERE slug = ?", [slug]);
  if (existing) return existing;
  const id = randomUUID();
  run("INSERT INTO tags (id, name, slug) VALUES (?, ?, ?)", [id, clean, slug]);
  audit(actor.id, "taxonomy.tag.create", "tag", id, `Created tag ${clean}.`);
  return { id, slug };
}
