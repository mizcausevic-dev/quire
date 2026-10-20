# Publishing and authorization

Quire separates four facts that are easy to collapse: who a person is, which organization they belong to, which listings that organization owns, and whether a plan is paid.

## Roles

| Actor | Can do |
| --- | --- |
| Visitor | Read published and archived pages, search, compare |
| Registered user | Save private collections, submit a listing, file a claim, write a review, report a review |
| Provider member | Edit a listing only when an ownership row names them or an organization where they are owner or editor |
| Billing member | See the organization's plan. Cannot edit listing text |
| Moderator | Approve or reject submissions and revisions, moderate reviews and claims, archive and restore |
| Administrator | Taxonomy, imports, sponsorship schedules, user roles, editorial entitlements |

A moderator cannot approve a revision they submitted. An administrator cannot approve an import they submitted. The seeded pair is Ada (administrator) and Max (moderator).

## Listing states

`draft`, `submitted`, `published`, `rejected`, `archived`.

Content lives on revisions (`draft`, `submitted`, `approved`, `rejected`). The public page reads `listings.published_revision_id` only.

While a newer revision is `submitted`, the published revision stays on the site and in search. Approval swaps the pointer, reindexes, and applies a slug change. Rejection leaves the published pointer alone. If the listing was never published, rejection sets the listing to `rejected`.

Archived listings return HTTP 200 with `noindex`, drop out of search and the sitemap, and keep the URL.

Unknown slugs return 404 unless `slug_redirects` has the old path. Approval writes a redirect and retargets older redirects so a chain resolves in one hop. Next.js `permanentRedirect` sends 308.

## Ownership

`listing_ownerships` is the only edit grant. `listings.organization_id` and `provider_label` are display fields. A member of organization A does not gain rows owned by organization B, and does not gain a listing that merely names organization A.

On first publication, a submitter with role `user` receives user ownership if nobody else owns the listing. Administrators and moderators do not receive that automatic grant, so an import stays unowned until a claim is approved.

Claims are `pending`, `approved`, `rejected`, or `revoked`. Approval requires a moderator who is not the claimant, a note, and no current owner. Evidence is free text plus an optional URL. The code never reads the claimant email as proof.

## Reviews

New reviews are `pending` and `ordinary`. The form has no verified checkbox. A moderator may later mark a published review `verified_customer` only with a verification note of at least 15 characters. The public page downgrades a verified label that is missing the note or the moderator id. Editing a review returns it to pending and clears verification.

## Plans

Plans are `free` (1 published listing), `studio` (8, no sponsorship), and `signal` (30, sponsorship allowed). An organization without a provider-confirmed active entitlement uses the free limit. `provider_confirmed` is set by mock confirmation, a verified webhook, or an editorial grant. A browser redirect never sets it. `GET /provider/billing/return?status=success` only explains that.

If `BILLING_WEBHOOK_SECRET` is empty, billing mode is mock and the provider desk can confirm a plan with a POST. If the secret is set, mock confirmation is refused. Webhooks require `quire-signature` or `stripe-signature` in the form `t=<unix>,v1=<hex hmac-sha256 of timestamp.rawBody>`, within five minutes. `billing_events` stores the provider event id. A repeat id returns duplicate and does not apply the second payload.

## Imports

Administrators upload a CSV of at most 1 MB and 500 rows, map columns, then dry-run or commit. Strategy `all_or_nothing` writes no listings when any row is invalid. Strategy `partial` writes the valid rows in one transaction. The dedupe key is the mapped `dedupe_key`, stored as `listings.external_key`. Re-import of the same key and content is a duplicate and does not create a second listing. `on_duplicate=revise` opens a submitted revision when the content hash changed and the listing is already published. It does not publish. Exports prefix cells that start with `=`, `+`, `-`, `@`, or a tab.
