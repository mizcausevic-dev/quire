# Acceptance

`npm test` runs these cases against a temporary SQLite file.

| Scenario | Test |
| --- | --- |
| A user submits a listing and it is not public until a moderator publishes it | `tests/publishing.test.ts` |
| Provider membership does not grant an unrelated listing, and a billing role cannot edit | `tests/publishing.test.ts` |
| A revision does not replace the published title, summary, or search document, and the author cannot approve it | `tests/revisions.test.ts` |
| Slug changes redirect only after approval | `tests/revisions.test.ts` |
| A claim stays pending, including when the email resembles the organization site, and edit access appears only after approval | `tests/claims.test.ts` |
| Revoking a claim removes that access | `tests/claims.test.ts` |
| Search and category filters return published rows, ignore out-of-scope attributes, and hide pending revision text | `tests/search.test.ts` |
| Category results paginate at 12 | `tests/search.test.ts` |
| Sponsorship starts and ends on stored dates, ignores a missing entitlement, and stays scheduled in the table after it expires | `tests/sponsorship.test.ts` |
| Import reports invalid and duplicate rows, writes nothing in all-or-nothing mode, dry-runs without inserts, and does not publish | `tests/imports.test.ts` |
| Re-import of the same content is a duplicate. A changed import opens a revision and leaves the public summary in place | `tests/imports.test.ts` |
| CSV export prefixes formula cells | `tests/imports.test.ts` |
| A success query string does not create an entitlement. Mock confirm does. A signed webhook is idempotent. A bad signature is rejected | `tests/billing.test.ts` |
| Reviews are ordinary until a moderator records a verification note. Listing JSON-LD has no Person or AggregateRating | `tests/reviews-seo.test.ts` |
| robots.txt does not disallow search or listings. Filtered pages are noindex. Demo mode empties the sitemap | `tests/reviews-seo.test.ts` |
