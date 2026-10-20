# Deployment

Quire needs a long-running Node 22 process and a persistent SQLite file. It is not a static upload to `public_html`. Hostinger remains the estate's usual production host when a Node app is available there. This environment did not deploy to Hostinger. GitHub Pages can publish only the static snapshot from `npm run preview:export`.

## Environment

Copy `.env.example`.

| Variable | Purpose |
| --- | --- |
| `QUIRE_CANONICAL_ORIGIN` | Absolute origin for canonical URLs, sitemap, and JSON-LD |
| `QUIRE_DB_PATH` | SQLite file. Default `data/quire.sqlite` |
| `QUIRE_DEMO_NOINDEX` | Anything except `0` noindexes the public site |
| `BILLING_WEBHOOK_SECRET` | Empty means mock billing. Set it to require signed webhooks |
| `QUIRE_ALLOW_RESET` | Must be `1` before `db:reset` when `NODE_ENV=production` |

Do not commit `.env`. Sessions use an HTTP-only cookie named `quire_session`. In production the cookie is marked Secure.

## Commands

```bash
npm ci
npm test
npm run db:migrate
npm run db:seed   # demonstration data only
npm run build
npm start
```

`db:reset` deletes the SQLite file and refuses to run in production unless `QUIRE_ALLOW_RESET=1`. It does not delete remote files.

Migrate also runs on first database open, so a missing schema is created before the first query. Seed is explicit because it inserts fictional people and companies.

## Checks before a real launch

- Tests pass, including the billing webhook and import cases.
- `QUIRE_DEMO_NOINDEX=0` only after the fictional banner is off and the rows are real.
- `BILLING_WEBHOOK_SECRET` is set if a provider will send events. Confirm that mock confirmation is rejected.
- Hit `/robots.txt` and confirm `/search` is not disallowed.
- Hit a changed slug and confirm 308 to the current path.
- Hit `/provider/billing/return?status=success` and confirm the plan did not change.

## GitHub Pages

`npm run preview:export` writes `preview-dist/`. Every preview page is `noindex`. Its search box filters embedded JSON and says so. Account, provider, and admin actions are not in the snapshot.

`.github/workflows/pages.yml` runs tests, seeds, exports, and publishes the `gh-pages` branch with the standard Pages action. That workflow has not been executed from this environment. Pushing it requires a GitHub login for `mizcausevic-dev`, which was not available here.

## Security notes for this build

Passwords use scrypt. SQL uses bound parameters. CSV exports neutralize formula prefixes. Import size is capped. Webhook signatures use a timing-safe compare. Server actions rethrow Next.js redirects and show `AppError` text to the user. Unexpected errors are logged and replaced with a generic sentence.

`npm audit` reports a transitive PostCSS advisory through Next.js. Application CSS is authored in this repo and is not user-supplied. Do not run `npm audit fix --force`. It would jump Next to an incompatible major.

Node's built-in `node:sqlite` prints an experimental warning on Node 22.23. The tests hide that warning. The module is the database so the app does not need a native addon compile.
