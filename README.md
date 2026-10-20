# Quire

Editorial publishing system for discovering software products and service providers. Listings move through draft, review, and publication. Subscriptions and disclosed sponsorship are separate from user permissions. Buyer-seller checkout is out of scope.

GitHub About: Editorial publishing system for software and service listings, with moderation, claims, and search.

Topics: `directory`, `publishing`, `nextjs`, `sqlite`, `moderation`, `search`, `seo`, `typescript`, `subscriptions`, `editorial`

This repository follows the current brief for a working publishing system. That conflicts with the Directory Factory flat-file rule, which this build does not use.

## Run

```bash
npm ci
npm test
npm run db:seed
npm run build
npm start
```

Node 22.13 or newer. Sign in to the seeded catalog with `demo-quire-2026`.

| Email | Role |
| --- | --- |
| ada.editor@quire.example | Administrator |
| max.mod@quire.example | Moderator |
| lina.northwind@quire.example | Provider owner, Northwind Loom |
| jules.paper@quire.example | Provider owner, Paperplane Ledger |
| sam.reader@quire.example | Reader |
| rory.claim@quire.example | Reader with a pending claim |

Every seeded organization, listing, and review is fictional. The banner and the Fictional label stay on those rows.

`QUIRE_DEMO_NOINDEX` defaults to on unless it is exactly `0`. Leave it on while the database contains the demonstration issue.

## Product

1. Quire is an edited catalog of software and services.
2. It is for readers, provider members, moderators, and an administrator.
3. Publication, ownership, and payment are separate decisions, so a paid plan cannot skip review.
4. Public pages, an account, a provider desk, and an administration console share one SQLite database.
5. Readers discover entries through categories, search, comparison, and journal notes.
6. They save collections, submit listings, file claims, and write reviews.
7. A moderator publishes. A provider confirms a plan only through the server billing path.
8. Money, in this version, is listing capacity and scheduled sponsorship. There is no checkout between buyer and seller.
9. Launch on a Node host with `npm run db:migrate`, `db:seed` only for a demo, then `build` and `start`. GitHub Pages gets a static snapshot, not the desk.
10. After launch, replace fictional rows, require a second moderator for approvals, and turn noindex off only after a person reviews the public set.

## Docs

- [Publishing and authorization](docs/publishing-authorization-Cursor.md)
- [Search](docs/search-Cursor.md)
- [SEO](docs/seo-Cursor.md)
- [Deployment](docs/deployment-Cursor.md)
- [Data model](docs/data-model-Cursor.md)
- [Product and definition of done](docs/product-Cursor.md)
- [Acceptance map](docs/acceptance-Cursor.md)
- [System map](docs/system-map-Cursor.html)
