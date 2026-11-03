# Build Malaysia — Web

Next.js (App Router, TypeScript strict, server components) site over local Postgres.

## Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL running locally (default socket)

## Setup

```bash
# 1. Create the database and apply schema (from project root)
createdb buildmalaysia_web
psql -d buildmalaysia_web -f ../supabase/migrations/20261104000000_operating_expenditure.sql

# 2. Load the development fixture
psql -d buildmalaysia_web -f fixtures/fy2025-sample.sql

# 3. Install dependencies
pnpm install

# 4. Start dev server
pnpm dev
```

The app reads `DATABASE_URL` from `.env.local` (default: `postgresql:///buildmalaysia_web`).
Copy `.env.example` to `.env.local` and adjust if your Postgres setup differs.

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Development server with hot reload |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit tests |

## Pages

| Route | Description |
|---|---|
| `/` | FY2025 overview: headline stats, vote table sortable by code/revised/actual |
| `/2025/vote/[code]` | Vote detail: programmes → activities → object-group rows with full budget columns |
| `/methodology` | Source description and live reconciliation block (N of N printed totals checked) |

Vote codes use a dot-free URL slug: `T.03` → `/2025/vote/T03`.

## Data model

Amounts are stored as integer sen (1 RM = 100 sen) and parsed into a branded `Sen` type at the
database boundary (`src/lib/money.ts`). Every number rendered on the site carries a citation link
pointing to the exact PDF page it was read from.

The pipeline agent (separate worktree) fills `buildmalaysia_web` from the JANM PDF.
The fixture in `fixtures/fy2025-sample.sql` covers votes T.01–T.07 for local development.
