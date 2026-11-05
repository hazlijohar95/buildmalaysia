# Build Malaysia — Web

Next.js (App Router, TypeScript strict, server components) site over local Postgres.

## Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL running locally (default socket)

## Setup

Load the database first, as described in the repository [README](../README.md#local-development): apply `supabase/migrations/` and run the pipeline ingest. Then:

```bash
pnpm install
pnpm dev
```

The app reads `DATABASE_URL` from `.env.local` (default: `postgresql:///buildmalaysia`).

## Commands

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | Development server with hot reload |
| `pnpm build`     | Production build                   |
| `pnpm start`     | Serve the production build         |
| `pnpm lint`      | ESLint                             |
| `pnpm typecheck` | `tsc --noEmit`                     |
| `pnpm test`      | Vitest unit tests                  |

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
| `/brand`                           | The Carta logo system: construction, colours, lockups, motion and downloadable files (`/brand/files/[name]`)                                        |

Vote codes use a dot-free URL slug: `T.03` → `/2025/vote/T03`. A year that is not loaded returns 404.

## Logo

The Carta logo is drawn once, in `src/brand/carta.ts`; the header, footer, loaders, icons, link previews and `/brand` files all render from it, and `src/__tests__/carta.test.ts` checks it against the government construction sheet. "Build" is outlined from Cal Sans by `scripts/outline-wordmark.py` (run with `uv run --no-project --with fonttools --with brotli --with uharfbuzz python scripts/outline-wordmark.py`), which also writes the static font the link previews use.

## Data model

Amounts are stored as integer sen (1 RM = 100 sen) and parsed into a branded `Sen` type at the
database boundary (`src/lib/money.ts`). Every number rendered on the site carries a citation link
pointing to the exact PDF page it was read from.
