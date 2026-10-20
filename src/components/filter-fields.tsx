import type { QueryState } from "@/lib/query";
import type { AttributeDefinition, CategoryRow } from "@/lib/taxonomy";
import { parseEnumOptions } from "@/lib/taxonomy";

export function FilterFields({
  state,
  categories,
  tags,
  definitions,
  hideCategory = false,
}: {
  state: QueryState;
  categories: CategoryRow[];
  tags: Array<{ slug: string; name: string }>;
  definitions: AttributeDefinition[];
  hideCategory?: boolean;
}) {
  return (
    <>
      <label>
        Search
        <input type="search" name="q" defaultValue={state.q} />
      </label>
      <label>
        Sort
        <select name="sort" defaultValue={state.sort}>
          <option value="">Relevance or newest</option>
          <option value="newest">Newest</option>
          <option value="name">Name</option>
          <option value="price_asc">Price, low to high</option>
          <option value="price_desc">Price, high to low</option>
        </select>
      </label>
      <label>
        Kind
        <select name="kind" defaultValue={state.kind}>
          <option value="">Any kind</option>
          <option value="software">Software</option>
          <option value="service">Service</option>
        </select>
      </label>
      {hideCategory ? null : (
        <label>
          Category
          <select name="category" defaultValue={state.category}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.slug}>{category.parent_id ? `– ${category.name}` : category.name}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Price model
        <select name="model" defaultValue={state.model}>
          <option value="">Any price</option>
          <option value="free">Free</option>
          <option value="subscription">Subscription</option>
          <option value="one_time">One time</option>
          <option value="usage">Usage</option>
          <option value="contact">Contact</option>
        </select>
      </label>
      <fieldset>
        <legend>Tags</legend>
        {tags.map((tag) => (
          <label className="check" key={tag.slug}>
            <input type="checkbox" name="tag" value={tag.slug} defaultChecked={state.tags.includes(tag.slug)} />
            {tag.name}
          </label>
        ))}
      </fieldset>
      {definitions.map((definition) => {
        if (definition.value_type === "enum") {
          return (
            <label key={definition.id}>
              {definition.label}
              <select name={`attr.${definition.key}`} defaultValue={state.attributes[definition.key] ?? ""}>
                <option value="">Any</option>
                {parseEnumOptions(definition.enum_options).map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          );
        }
        if (definition.value_type === "boolean") {
          return (
            <label key={definition.id}>
              {definition.label}
              <select name={`attr.${definition.key}`} defaultValue={state.attributes[definition.key] ?? ""}>
                <option value="">Any</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          );
        }
        if (definition.value_type === "number") {
          return (
            <fieldset key={definition.id}>
              <legend>{definition.label}</legend>
              <label>
                At least
                <input name={`attr.${definition.key}_gte`} defaultValue={state.attributes[`${definition.key}_gte`] ?? ""} inputMode="decimal" />
              </label>
              <label>
                At most
                <input name={`attr.${definition.key}_lte`} defaultValue={state.attributes[`${definition.key}_lte`] ?? ""} inputMode="decimal" />
              </label>
            </fieldset>
          );
        }
        return (
          <label key={definition.id}>
            {definition.label}
            <input name={`attr.${definition.key}`} defaultValue={state.attributes[definition.key] ?? ""} />
          </label>
        );
      })}
    </>
  );
}
