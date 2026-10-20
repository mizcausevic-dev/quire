# SEO

Public pages are server-rendered by the Next.js App Router. The root layout is dynamic, and listing, category, search, and article routes read the database on request.

## Canonical URLs

`QUIRE_CANONICAL_ORIGIN` is the origin, without a trailing slash. Clean category, listing, article, and home URLs canonical to themselves. Filtered category URLs, page 2 and later, search, and compare canonical to the unfiltered path (`/search` and `/compare` for those tools) and send `noindex, follow`.

## Sitemap and robots

`/sitemap.xml` includes the home page, category URLs, published listings with `indexable = 1`, and published articles. It omits drafts, rejected rows, archived rows, search, compare, account, provider, and admin URLs.

When `QUIRE_DEMO_NOINDEX` is unset or any value other than `0`, every public robots policy is noindex and the sitemap is empty. The demonstration seed should stay in that mode. Set `QUIRE_DEMO_NOINDEX=0` only after fictional rows are gone and a person has reviewed what would be indexed.

`/robots.txt` disallows `/account`, `/admin`, `/provider`, `/api/`, `/login`, `/register`, and `/submit`. It does not disallow `/search`, `/listings`, `/categories`, `/compare`, or `/articles`. Those URLs carry their own robots meta. Blocking them in robots.txt would hide the noindex directive from crawlers that obey robots first.

## Slugs, missing pages, archives

Slug changes on approval insert `slug_redirects` and retarget older rows to the newest path. The app responds with 308.

An unknown listing, category, or article slug with no redirect is a 404.

An archived listing is HTTP 200, `noindex`, absent from search and the sitemap, and labeled archived.

## Structured data

The home page emits `WebSite` and `SearchAction` for `/search?q=`. Categories emit `BreadcrumbList` and `CollectionPage` / `ItemList` for the entries on that page. Listings emit `SoftwareApplication` or `Service` plus breadcrumbs, using the visible name, summary, provider, and prices. Articles name the author as the organization "Quire editorial desk".

The pages do not emit `Person`, `Review`, or `AggregateRating`. Seeded reviewers are fictional, and Person markup is reserved for a real public identity. Ratings remain visible in HTML.

JSON-LD is serialized with `<` escaped so the payload cannot close a script tag.
