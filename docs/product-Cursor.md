# Product

Quire is a publishing desk for a software and services catalog. Readers browse and compare. Providers submit and claim. Moderators publish. Administrators run taxonomy, imports, and sponsorship. Paid plans change capacity and sponsorship eligibility. They do not change a person's role, and they do not settle a buyer-seller transaction.

## Who it is for

A reader who needs a short, comparable set of tools. A provider employee who should edit only the listings their organization owns. A moderator who should see the live page and the proposed change at the same time. An administrator who should be able to explain a later audit row.

## Why the split matters

Directories that store the whole listing in one JSON blob, or that treat "has a company email" as ownership, fail the first dispute. Quire keeps typed attribute values, an ownership table, a revision pointer, and a provider-confirmed entitlement. Each can change without the others changing.

## After launch

Replace the seed. Keep `QUIRE_DEMO_NOINDEX=1` until that is done. Point billing at a real webhook secret before taking a card. Add a second moderator so the four-eyes rule is operational, not only tested.

## Definition of done, honestly

| Dimension | State |
| --- | --- |
| Product intent | Publishing and discovery, with subscriptions and sponsorship. No escrow |
| ICP | Readers, provider members, moderators, administrators |
| UX | Public catalog, account, provider desk, admin desk. Error text comes from validation |
| Frontend | Server-rendered App Router, one editorial public theme, seven console themes |
| Backend | Next.js server actions and three route handlers |
| Data model | SQLite migration, typed attributes, FTS5 |
| Security | scrypt, bound SQL, signed webhooks, import limits, no payment-from-redirect |
| Privacy | Notice page, acceptance timestamp, no third-party analytics tag. Not a legal opinion |
| QA | `npm test` covers the acceptance scenarios |
| Deployment | Documented Node start. Pages snapshot script. No production deploy was performed |
| Observability | Audit table and stdout on unexpected errors. No external error tracker |
| Analytics | No GA4 container was requested, so no events were invented |
| CRO | Submit, claim, compare, and save are present. No fake urgency |
| Monetization | Free, Studio, and Signal plans. Mock mode without a webhook secret |
| Documentation | This set |
| Maintainability | Domain logic is in `src/lib` and is what the tests call |

Repurpose the same revision, claim, and entitlement split for another vertical by replacing categories and attribute definitions. Do not replace the ownership table with a role check.
