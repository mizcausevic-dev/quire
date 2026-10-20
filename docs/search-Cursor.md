# Search

Search reads published revisions from SQLite. Drafts, submissions, rejected rows, archived rows, and unapproved revisions are not in the index.

## Fields

The FTS5 table `listing_search` indexes title, summary, body, provider name, tag names, and category names. The tokenizer is Porter Unicode61. The query parser does not accept raw FTS syntax. It keeps letter and number tokens longer than one character, quotes them, and joins them with AND.

## Ranking

With a query and sort `relevance` (the default when a query is present):

`bm25(listing_search, 0.001, 8, 4, 1, 3, 2, 2)`

Column order is the unindexed id, then title, summary, body, provider, tags, category. Lower scores rank first, so a title match outranks a body match.

Other sorts: `newest` (listing `updated_at`), `name`, `price_asc`, `price_desc`. Price uses the minimum numeric amount on the published revision. Rows without a numeric price sort last.

## Filters

All of these combine with AND and are kept in the URL:

- `q`
- `kind` (`software` or `service`)
- `category` (a parent includes its children; a child is exact)
- `tag` (repeatable, all required)
- `model` (price model)
- `sort`
- `page`
- `attr.<key>` for exact enum, boolean, or text
- `attr.<key>_gte` and `attr.<key>_lte` for numbers

Category-specific attributes apply only when that category, or a page whose category owns the definition, is selected. Otherwise the filter is ignored and named on the page. Global filterable attributes would apply without a category. This catalog defines attributes on categories, not globally.

Page size is 12. Page numbers past the end return an empty list rather than being rewritten.

## Sponsored placements

A placement is live when status is `scheduled`, `starts_at <= now < ends_at`, and either it does not require an entitlement or the listing's organization has an active, provider-confirmed plan with `allows_sponsorship`. Canceled rows never show. Expired rows stay `scheduled` in the database and simply stop matching.

Live placements that also match the current filters are shown in a labeled band, at most three, and removed from the organic page so they are not listed twice. The organic total does not include them. Homepage, category, and search each use their own placement value.

## Limits

No typo tolerance, synonyms, or phrase operators. Porter stemming is English-oriented. Offset pagination gets slower as the catalog grows. The index is rebuilt on publish, archive, and restore, on one SQLite file. Pending revision text is not searchable.
