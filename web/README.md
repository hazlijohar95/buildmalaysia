# Build Malaysia — Web

Astro site on Cloudflare Workers over Postgres. Pages render on the server; React draws them, and only the header, the tax calculator and the spending chart load JavaScript.

## Prerequisites

- Node.js 24+
- pnpm
- PostgreSQL on 127.0.0.1:5432

## Setup

Load the database first, as described in the repository [README](../README.md#local-development): apply `supabase/migrations/` and run the pipeline ingest. Then:

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs the site in the Workers runtime and reads Postgres through the local Hyperdrive binding; see the repository README for the connection string.

## Commands

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | Development server with hot reload |
| `pnpm build`     | Production build                   |
| `pnpm preview`   | Build, then run the built Worker   |
| `pnpm lint`      | ESLint                             |
| `pnpm typecheck` | `wrangler types && astro check`    |
| `pnpm test`      | Vitest unit tests                  |

## Structure

A route is a thin `.astro` file under `src/pages/` that calls its view in `src/views/`: an async function that loads the page's data, decides its 404 and title, and returns `{ head, body }` (`src/lib/route.ts`). `src/layouts/Base.astro` wraps every page. A React component that needs the browser is hydrated from the `.astro` file with a `client:*` directive; React inside `body` renders to HTML only.

## Pages

| Route                              | Description                                                                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/[year]`                     | Federal spending for the latest or a given year: total, operating and development, year-by-year change, and spending by ministry (B.nn beside P.nn) |
| `/[year]/operating`                | Operating expenditure (Lampiran 1): headline stats and votes, sortable by code, revised or actual                                                   |
| `/[year]/development`              | Development expenditure (Lampiran 2): headline stats and votes, sortable by code, estimate or actual                                                |
| `/[year]/vote/[code]`              | A T or B vote: programmes → activities → object groups. A P vote: agency groups → projects                                                          |
| `/budget/[budgetYear]`             | The MOF budget by vote: two years of actuals, the current and the proposed budget                                                                   |
| `/budget/[budgetYear]/vote/[code]` | A vote's proposed budget: programmes and activities with posts (T, B), or projects (P)                                                              |
| `/methodology`                     | Sources and the live reconciliation result for both statements                                                                                      |
| `/contracts`                       | Search MyProcurement's award results by item, company, buyer or reference, with ministry, method and year filters                                   |
| `/contracts/[kind]/[id]`           | One result read: where it sits, the tender limit, the buyer's market, the winner's record (specs/contracts-commentary.md)                           |
| `/contracts/company/[slug]`        | A company's record: by year, method, ministry and buyer, with the same checks                                                                       |
| `/contracts/method`                | How the contract pages read results: every check's formula, limits and sources                                                                      |
| `/brand`                           | The Carta logo system: construction, colours, lockups, motion and downloadable files (`/brand/files/[name]`)                                        |

Vote codes use a dot-free URL slug: `T.03` → `/2025/vote/T03`. A year that is not loaded returns 404.

## Logo

The Carta logo is drawn once, in `src/brand/carta.ts`; the header, footer, loaders, icons, link previews and `/brand` files all render from it, and `src/__tests__/carta.test.ts` checks it against the government construction sheet. "Build" is outlined from Cal Sans by `scripts/outline-wordmark.py` (run with `uv run --no-project --with fonttools --with brotli --with uharfbuzz python scripts/outline-wordmark.py`), which also writes the static font the link previews use.

## Data model

Amounts are stored as integer sen (1 RM = 100 sen) and parsed into a branded `Sen` type at the
database boundary (`src/lib/money.ts`). Every number rendered on the site carries a citation link
pointing to the exact PDF page it was read from.
