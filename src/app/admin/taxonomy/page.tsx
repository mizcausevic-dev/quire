import { redirect } from "next/navigation";
import { Notice } from "@/components/notice";
import { listRedirects } from "@/lib/redirects";
import { takeNotice } from "@/lib/notices";
import { canAdminister } from "@/lib/permissions";
import { listAttributeDefinitions, listCategories, listTags } from "@/lib/taxonomy";
import { attributeAction, categoryAction, tagAction } from "@/server/actions";
import { currentActor } from "@/server/session";

export default async function TaxonomyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await currentActor();
  if (!actor || !canAdminister(actor)) redirect("/admin");
  const raw = await searchParams;
  const categories = listCategories();
  return (
    <>
      <Notice notice={takeNotice(typeof raw.notice === "string" ? raw.notice : undefined)} />
      <form className="form" action={categoryAction}>
        <h2>Category</h2>
        <label>Name<input name="name" required /></label>
        <label>Slug<input name="slug" /></label>
        <label>Description<textarea name="description" /></label>
        <label>Kind
          <select name="kind"><option value="software">Software</option><option value="service">Service</option></select>
        </label>
        <label>Parent
          <select name="parentId"><option value="">None</option>{categories.filter((category) => !category.parent_id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        </label>
        <button type="submit">Save category</button>
      </form>
      <ul>{categories.map((category) => <li key={category.id}>{category.parent_id ? "– " : ""}{category.name} · /categories/{category.slug}</li>)}</ul>
      <form className="form" action={attributeAction}>
        <h2>Attribute</h2>
        <label>Key<input name="key" required /></label>
        <label>Label<input name="label" required /></label>
        <label>Type
          <select name="valueType">
            <option value="text">Text</option>
            <option value="long_text">Long text</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="enum">Enum</option>
            <option value="url">URL</option>
          </select>
        </label>
        <label>Enum options, comma separated<input name="enumOptions" /></label>
        <label>Category
          <select name="categoryId"><option value="">Global</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        </label>
        <label className="check"><input type="checkbox" name="required" value="yes" /> Required on submit</label>
        <label className="check"><input type="checkbox" name="filterable" value="yes" /> Filterable</label>
        <button type="submit">Save attribute</button>
      </form>
      <ul>{listAttributeDefinitions().map((definition) => <li key={definition.id}>{definition.key} · {definition.value_type} · {definition.label}</li>)}</ul>
      <form className="form" action={tagAction}>
        <h2>Tag</h2>
        <label>Name<input name="name" required /></label>
        <button type="submit">Save tag</button>
      </form>
      <p>{listTags().map((tag) => tag.name).join(", ")}</p>
      <h2>Redirects</h2>
      <ul>{listRedirects().map((redirectRow) => <li key={redirectRow.from_path}>{redirectRow.from_path} → {redirectRow.to_path}</li>)}</ul>
    </>
  );
}
