import { saveListingAction } from "@/server/actions";
import type { AttributeDefinition, CategoryRow } from "@/lib/taxonomy";
import { parseEnumOptions } from "@/lib/taxonomy";
import type { ListingInput } from "@/lib/types";
import type { OrganizationRecord } from "@/lib/orgs";

export function ListingEditor({
  listingId,
  published,
  categories,
  tags,
  definitions,
  organizations,
  values,
}: {
  listingId?: string;
  published?: boolean;
  categories: CategoryRow[];
  tags: Array<{ slug: string; name: string }>;
  definitions: AttributeDefinition[];
  organizations: OrganizationRecord[];
  values: ListingInput & { organizationId?: string | null };
}) {
  return (
    <form className="form" action={saveListingAction}>
      {listingId ? <input type="hidden" name="listingId" value={listingId} /> : null}
      <input type="hidden" name="categoryId" value={values.categoryId} />
      <label>
        Title
        <input name="title" required defaultValue={values.title} />
      </label>
      <label>
        Summary
        <textarea name="summary" required={published} defaultValue={values.summary} />
      </label>
      <label>
        Description
        <textarea name="body" defaultValue={values.body} />
      </label>
      <div className="row">
        <label>
          Kind
          <select name="kind" defaultValue={values.kind}>
            <option value="software">Software</option>
            <option value="service">Service</option>
          </select>
        </label>
        <label>
          Public slug
          <input name="proposedSlug" defaultValue={values.proposedSlug ?? ""} placeholder="Leave blank to keep the current slug" />
        </label>
      </div>
      <label>
        Website
        <input name="website" type="url" defaultValue={values.website} placeholder="https://" />
      </label>
      {organizations.length > 0 ? (
        <label>
          Owning organization
          <select name="organizationId" defaultValue={values.organizationId ?? ""}>
            <option value="">Independent listing</option>
            {organizations.filter((org) => org.role === "owner" || org.role === "editor").map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <fieldset>
        <legend>Primary price</legend>
        <div className="row">
          <label>Label<input name="price_label" defaultValue={values.prices[0]?.label ?? "Price"} /></label>
          <label>
            Model
            <select name="price_model" defaultValue={values.prices[0]?.model ?? "contact"}>
              <option value="free">Free</option>
              <option value="subscription">Subscription</option>
              <option value="one_time">One time</option>
              <option value="usage">Usage</option>
              <option value="contact">Contact</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label>Amount<input name="price_amount" defaultValue={values.prices[0]?.amount ?? ""} inputMode="decimal" /></label>
          <label>Currency<input name="price_currency" defaultValue={values.prices[0]?.currency ?? "USD"} maxLength={3} /></label>
        </div>
        <label>
          Interval
          <select name="price_interval" defaultValue={values.prices[0]?.interval ?? ""}>
            <option value="">None</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Tags</legend>
        {tags.map((tag) => (
          <label className="check" key={tag.slug}>
            <input type="checkbox" name="tag" value={tag.slug} defaultChecked={values.tags.includes(tag.slug)} />
            {tag.name}
          </label>
        ))}
      </fieldset>
      {definitions.map((definition) => (
        <label key={definition.id}>
          {definition.label}{definition.required ? " (required to submit)" : ""}
          {definition.value_type === "enum" ? (
            <select name={`attr_${definition.key}`} defaultValue={values.attributes[definition.key] ?? ""}>
              <option value="">Choose</option>
              {parseEnumOptions(definition.enum_options).map((option) => <option key={option}>{option}</option>)}
            </select>
          ) : definition.value_type === "boolean" ? (
            <select name={`attr_${definition.key}`} defaultValue={values.attributes[definition.key] ?? ""}>
              <option value="">Choose</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : definition.value_type === "long_text" ? (
            <textarea name={`attr_${definition.key}`} defaultValue={values.attributes[definition.key] ?? ""} />
          ) : (
            <input name={`attr_${definition.key}`} defaultValue={values.attributes[definition.key] ?? ""} />
          )}
        </label>
      ))}
      <div className="row">
        <label>Image path<input name="image_path" defaultValue={values.images[0]?.path ?? ""} placeholder="/media/mark.svg" /></label>
        <label>Image alt text<input name="image_alt" defaultValue={values.images[0]?.alt ?? ""} /></label>
      </div>
      {published ? (
        <label>
          What changed
          <textarea name="changeNote" required minLength={10} placeholder="Tell the editor what changed. The live page stays up until this is approved." />
        </label>
      ) : null}
      <div className="row">
        {published ? null : <button className="secondary" name="intent" value="draft" type="submit">Save draft</button>}
        <button name="intent" value="submit" type="submit">{published ? "Submit revision" : "Submit for review"}</button>
      </div>
    </form>
  );
}
