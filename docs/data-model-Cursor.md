# Data model

The schema is `db/migrations/0001_init.sql`. Important listing facts are columns, not an open JSON document. The only JSON-shaped values are enum option lists on attribute definitions and the stored import mapping.

## Identity

- `users`: email, name, scrypt password hash, role (`user`, `moderator`, `administrator`), privacy acceptance time
- `sessions`: hashed token, expiry
- `organizations`
- `organization_memberships`: `owner`, `editor`, `billing`

## Catalog

- `categories`: two levels, each with kind `software` or `service`
- `tags`
- `attribute_definitions`: type `text`, `long_text`, `number`, `boolean`, `enum`, or `url`, plus required and filterable flags
- `listings`: status, slug, external dedupe key, provider label, demo flag, indexable flag, pointer to the published revision
- `listing_revisions`: title, summary, body, website, category, kind, proposed slug, review notes, content hash
- `listing_prices`: model, integer minor units, ISO currency, optional interval
- `listing_attribute_values`: exactly one of `value_text`, `value_number`, `value_boolean`
- `listing_tags`, `listing_images`
- `listing_ownerships`: user or organization, granted via submission, claim, admin, or import

## Trust and money

- `ownership_claims`: pending, approved, rejected, revoked, with evidence and a reviewer note
- `reviews` and `review_reports`
- `plans`, `entitlements` (`provider_confirmed`, source `mock`, `stripe`, or `editorial`)
- `billing_events`: unique provider event id
- `sponsored_placements`: start, end, surface, disclosure, canceled or scheduled
- `audit_events`
- `slug_redirects`
- `import_batches` and `import_rows`
- `articles`, `article_listings`
- `collections`, `collection_items` (private)
- `app_settings`, `notices`

`listing_search` is an FTS5 table rebuilt from the published revision.
