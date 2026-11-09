# Contracts commentary — spec

What the contract (`/contracts/[kind]/[id]`) and company (`/contracts/company/[slug]`) pages say about MyProcurement's
award results, and why. `/contracts/method` explains the same to readers; this file is for whoever changes the code.

## Principles

1. **Every sentence is a formula.** `web/src/lib/contract-commentary.ts` turns each check's result into an
   observation with a `method` anchor on `/contracts/method`. No hand-written commentary.
2. **A question is not a finding.** Checks follow the Open Contracting Partnership's
   [Red Flags in Public Procurement](https://www.open-contracting.org/resources/red-flags-in-public-procurement-a-guide-to-using-data-to-detect-and-mitigate-risks)
   (2024). A raised check (`tone: "question"`) always carries `otherwise`, the innocent explanations. A test keeps
   accusatory words ("suspicious", "corrupt", "rigged", "crony", "fraud") out of the output.
3. **Like with like.** Compare within ministry and year, method and category, or buyer and category over time.
4. **Minimum sizes.** No percentage on fewer than 5 contracts, no rank among fewer than 10, no buyer's market under 10.
5. **One source of truth for each rule.** Limits and thresholds live in `web/src/lib/contract-checks.ts`; the SQL
   near-limit test is generated from the same `QUOTATION_LIMITS` table.

## Checks

| Id                   | Tone                               | Formula                                                                                           | Red flag                   |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| `rank`               | context                            | 1 + count of the ministry's results that year with a higher price; share = price ÷ their sum      | —                          |
| `peers`              | context                            | share of same method and category, all years, with a lower price                                  | —                          |
| `direct`             | question                           | `kind = 'direct'`, with the recorded criterion                                                    | Non-competitive procedure  |
| `near-limit`         | question                           | quotation with limit × 0.95 < price ≤ limit, limit in force on its date                           | Value just under threshold |
| `splitting`          | question                           | ≥ 2 quotations, same buyer, category and company, within ±30 days, each ≤ limit, sum > limit      | Contract splitting         |
| `market-share`       | question at ≥ 50%                  | company's award amounts ÷ buyer's award amounts, same category, 3 years to the date               | Supplier dominance         |
| `concentration`      | question above 1,800               | HHI = Σ (percentage share)², bands from the 2023 US Merger Guidelines                             | Market concentration       |
| `relationship`       | context                            | the winner's other results from this buyer, and everywhere                                        | —                          |
| `company-near-limit` | question at ≥ 3 and ≥ 2× base rate | company's near-limit quotations ÷ its quotations, against all quotations a limit applies to       | Value just under threshold |
| `company-top-buyer`  | question at ≥ 50%                  | value from its largest buyer ÷ all that buyer awarded between the company's first and last result | Supplier dominance         |

## Quotation limits

| Class                 | From       | To         | Limit        | Source                        |
| --------------------- | ---------- | ---------- | ------------ | ----------------------------- |
| Supplies and services | 2013-01-01 | —          | RM 500,000   | PK 2.1                        |
| Works                 | 2013-01-01 | 2023-06-30 | RM 500,000   | PK 2.1                        |
| Works                 | 2023-07-01 | 2024-12-31 | RM 1,000,000 | PK 2.21 (2022–2024), para 8.1 |
| Works                 | 2026-01-01 | 2026-12-31 | RM 3,000,000 | PK 2.21 (2026), para 7.1      |

Works in 2025 are deliberately unchecked: PK 2.21 for 2025 was amended in May 2025 (the "Pindaan Mei 3 juta"), and the
date the higher limit took effect is not settled. Consultancy (PK 2.4) is not checked. To add a year, add a row to
`QUOTATION_LIMITS`; a test rejects overlapping rows.

Evidence the near-limit check is meaningful here: quotations in the 5 points under the limit outnumber those in the 5
points over it many times over (`getLimitBunching`, charted on `/contracts/method`; a database test asserts at least
five times).

## Companies

MyProcurement prints names, not SSM numbers. A company's key is `regexp_replace(upper(name), '[^A-Z0-9]+', '', 'g')`
(`supplierKey` in TypeScript), merging about 32,100 printed names into about 30,900. The slug is the lower-cased name with
runs of other characters as hyphens; its words become an `ILIKE '%w1%w2%'` pattern so the supplier trigram index narrows
the scan before the exact key match. No migration is needed.

## Not measurable from MyProcurement

Bidder counts, bid prices, the buyer's estimate, contract changes, payments and ownership. The pages say so.

## Testing

- `web/src/__tests__/contract-checks.test.ts`: every formula, limit boundary and commentary rule.
- `web/src/__tests__/contracts-db.test.ts`: the queries against a loaded database
  (`DATABASE_URL=postgresql:///buildmalaysia pnpm test`); skipped in CI.

## Loading

A page returns `deferred` (`web/src/lib/route.ts`) when part of it waits on slower queries. `PageBody.astro` renders
the body, a `SectionSkeleton` and the deferred part as three separate renders, so Astro flushes the first two while the
third waits on the database. The skeleton shows only while nothing follows it, after 300 ms, so a cached page never
flashes it. A deferred part that fails renders a notice in place and marks the page uncacheable (`Streamed`).

- Contract page: the record (one primary-key lookup) streams first; the reading, charts and full record follow.
- Company page: the name (trigram index) streams first; 404 is decided on it, before streaming starts.
- `getLimitReading` (the base rate and the bunching chart) scans every quotation, seconds when cold on the hosted
  database. It is the same for every reader, so `sharedFor` keeps it for an hour per isolate, the same as the page
  cache.
- A contract's title carries `contractTitleTransition`, so it moves from its list row to its page heading in the
  site's cross-document view transition. A named element must be a block, or the browser skips the transition.
