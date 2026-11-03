# CanadaSpends — reverse-engineered spec

Source: `/Applications/coding/buildmalaysia/reference/CanadaSpends` (shallow clone, 1 commit, dated 2026-10-09; MIT). All paths below are relative to that root. **[V]** = verified in files, **[I]** = inferred.

## 0. Architecture in one paragraph

Next.js 15 App Router site (`package.json`, `next.config.ts`). **There is no database in the repo.** Data comes from four places:

1. **Static files in git** — provincial/municipal `summary.json` + `sankey.json` under `data/`, read with `fs` at build time [V] (`src/lib/jurisdictions.ts`).
2. **Hard-coded TS/TSX literals** — all federal spending, budget, workforce and tax numbers [V] (`src/components/Sankey/index.tsx`, `src/app/[lang]/(main)/federal/spending/*/`, `src/lib/tax/configs/`).
3. **External databases owned by Build Canada, populated by ETL code not in this repo** [V that the ETL is absent]:
   - Typesense `search.canadasbuilding.com`, collection `records` (`src/components/Search.tsx:41-55`).
   - Record-detail JSON API `https://api.canadasbuilding.com/canada-spends/{table}/{id}.json?_shape=array` (`src/app/[lang]/(main)/search/[database]/[id]/page.tsx:13`). `_shape=array` is a Datasette convention → **[I] Datasette over SQLite**.
   - Supabase PostgREST at `https://api.buildcanada.com/rest/v1` for First Nations data (`src/lib/supabase/index.ts:3`).
4. **CDN** `https://cdn.canadaspends.com/...` for First Nations source PDFs (`src/components/first-nations/FirstNationsPageContent.tsx:141,180`).

Keys in the client are public/read-only (Typesense search key, Supabase `sb_publishable_…`) [V]. Server secrets: `BEEHIIV_KEY`, `NEXT_PUBLIC_POSTHOG_KEY` [V].

## 1. Purpose and pages

README: "making Canada the most transparent country in the world"; two modes — (1) parse/visualise **audited financial statements**, (2) aggregate/normalise **spending databases** for search (`README.md`).

All routes are under `src/app/[lang]/` with `lang ∈ {en, fr}`; `src/middleware.ts` redirects locale-less URLs using `Accept-Language`.

| Route | What it shows | Data origin |
|---|---|---|
| `/` | Landing, "Get The Facts About Government Spending" | static copy |
| `/federal/spending` | Revenue↔spending Sankey (FY 2024, $B), headcount/wages/compensation 2019–23, age, tenure, salary distribution, department list | hard-coded (`src/components/Sankey/index.tsx`, `federal/spending/page.tsx:49-86`) |
| `/federal/spending/{dept}` ×15 | Per-department: mini Sankey by object of expenditure, spending by sub-entity, % of federal spending 1995–2024 line chart, minister links | hard-coded per folder (`MiniSankey.tsx`, `FederalSpendingByEntity.tsx`, `FederalSpendingChart.tsx`) |
| `/federal/budget` | Budget 2025 Sankey, news feed, feature flag `IS_BUDGET_2025_LIVE` | hard-coded (`src/components/Sankey/BudgetSankey.tsx`, `src/lib/budgetNewsData.ts`, `src/lib/featureFlags.ts`) |
| `/provincial/{province}[/{year}]` | Jurisdiction page: Sankey, totals, debt, interest, ministries ranked, sources, methodology, credits | `data/provincial/{p}/{yyyy}/` |
| `/municipal/{province}/{city}[/{year}]` | Same template + population, per-capita, property tax | `data/municipal/{p}/{city}/{yyyy}/` |
| `…/{year}/departments/{dept}` | Ministry detail page | `departments/*.json` — **no such files exist** [V], so these routes generate nothing |
| `(mobile)/…/spending-full-screen` | Full-screen Sankey for embedding/mobile | same data |
| `/search`, `/search/{database}/{id}` | Faceted search over federal contracts/grants/transfers; record detail | Typesense + detail API |
| `/first-nations`, `/{bcid}`, `/{bcid}/{year}`, `/remuneration` | First Nations financial statements, remuneration (chief/council pay), population, land claims | Supabase, ISR `revalidate = 3600` |
| `/tax-visualizer` | "Calculate your tax contribution" + where it goes, by province/year | `src/lib/tax/configs/{2023..2026}/*.ts`, `src/lib/personalTaxBreakdown.ts` |
| `/tax/simulator` (+`/view`, `/og`) | Build alternative bracket plans, compare, shareable OG image | `src/lib/tax/scenario.ts`, `src/components/tax-simulator/` |
| `/articles`, `/articles/{slug}` | MDX articles, bilingual | `articles/{en,fr}/{slug}/` (see `articles/README.md`) |
| `/about`, `/contact`, `/whistleblowers` | Team/FAQ, contact, tip line → `whistleblowers.canadaspends.com` (Tor/Tails/GlobaLeaks guidance) | static |
| `/api/newsletter` | POST → Beehiiv subscription | `src/app/api/newsletter/route.tsx` |

Legacy routes `(main)/spending`, `(main)/budget` still exist plus redirects to `/federal/*` marked "REMOVE AFTER 2026-03-01" (`next.config.ts`).

## 2. Data sources

### 2a. Audited statements (visualisation side)

| Jurisdiction | Publisher / URL (from `source`/`sources` in summary.json) | Format | Years in repo | Granularity |
|---|---|---|---|---|
| Federal | Public Accounts of Canada, PSPC: `canada.ca/.../public-accounts/2024.html` (`federal/spending/page.tsx:149`) | PDF (Vol I/II/III) | Sankey FY 2024; dept trend 1995–2024 | Function → program area → line; dept → object of expenditure; dept → sub-entity |
| Federal archive | Library & Archives Canada: `https://epe.lac-bac.gc.ca/100/201/301/public_accounts_can/pdf/index.html` (`PublicAccountsPDFs/download_pdfs.py`) | PDF | 1995–2024, 246 PDFs, 583 MB | Vol I summary/consolidated FS, Vol II details of expenses & revenues, Vol III sections (3 professional services, 4 land/buildings, 6 transfer payments); errata kept as `-- original`/`-- revised` |
| Federal workforce | PBO personnel expenditure tool; TBS demographic snapshot; TBS salary-range stats (`federal/spending/page.tsx:237-262`) | web tables | 2019–2023 | aggregate |
| Federal budget | `budget.canada.ca/2025/report-rapport/pdf/budget-2025.pdf` (`federal/budget/page.tsx:271`) | PDF | Budget 2025 | program area |
| Alberta | `alberta.ca/government-and-ministry-annual-reports#23-24`, `#24-25` | PDF | 2024, 2025 | ministry → program |
| British Columbia | BC Public Accounts 2024-25 CRF Supplementary Schedules (unaudited) + Summary Financial Statements (`data/provincial/british-columbia/2025/README.md`) | PDF | 2025 | ministry → program (CRF scope $77.37B, not GRE $91.39B) |
| Ontario | `ontario.ca/page/public-accounts-ontario-2023-24`, `-2024-25`; TBS ministry-statements CSV + Ontario open-data JSON (`.../JESSE_DATA_PRUNING_SCRIPTS/.../clean_public_accounts_2024.py:5-6`) | CSV/JSON + PDF | 2024, 2025 | ministry → program/vote → standard account |
| Toronto | `toronto.ca/.../annual-financial-report/` | Excel ("City_of_Toronto_2024_Actuals - Cleaned.xlsx", not in repo) + SankeyMATIC txt | 2024 | service area |
| Vancouver | `vancouver.ca/.../financial-reports-and-information.aspx`; PDF in `data_cleaning/raw_data/` | PDF → hand-built xlsx | 2024 | category → source → capital/operating |
| Edmonton | 2024 Consolidated Financial Statements (p.64, p.99) + Financial Annual Report (debt, employees) | PDF | 2024 | department/service area |

Year folder = fiscal-year **end** (e.g. `ontario/2025` has `financialYear: "2024-25"`) [V]. Empty `.keep` placeholders exist for all other provinces/territories under `data/municipal/` [V].

### 2b. Transaction-level databases (search side)

| Table (`/search/{database}`) | Publisher / endpoint scraped | Format | Coverage | Scraper |
|---|---|---|---|---|
| `contracts-over-10k` | open.canada.ca dataset `d8f85d91-…` resource `fac950c0-…` (`Contracts.tsx:823`) — [I] Proactive Disclosure of Contracts | CSV/datastore | unknown | none in repo |
| `transfers` | open.canada.ca dataset `69bdc3eb-…` (`page.tsx:309`); fields `FSCL_YR, DEPT_EN_DESC, RCPNT_NML_EN_DESC, AGRG_PYMT_AMT, CTY_EN_NM, PROVTER_EN…` — [I] Public Accounts transfer-payment open data | CSV | unknown | none in repo |
| (grants & contributions) | open.canada.ca datastore dump `1d15a62f-…?format=json` (dataset `432527ab-…`) | JSON | full dump | `scrapers/proactive-grant-disclosures/scraper.sh` |
| `nserc_grants` | NSERC Awards DB `nserc-crsng.gc.ca/ase-oro/` (DataTables AJAX + per-award HTML) | JSON listing + HTML detail | FY 1991–2023, 701,310 records (`scrapers/nserc/total_records.txt`) | `scrapers/nserc/*.sh` (rotates Mullvad VPN servers to dodge rate limits) |
| `sshrc_grants` | SSHRC via UQAM OST tool `outil.ost.uqam.ca/CRSH/Resultat.aspx` | HTML pages | 1998–2023, ~4,349 pages | `scrapers/sshrc_awards/scrape.sh` |
| `cihr_grants` | CIHR Funding Decisions `webapps.cihr-irsc.gc.ca/decisions/sq` (Solr, `rows=100000`) | JSON | all | `scrapers/cihr/*.sh` |
| `global_affairs_grants` | GAC Project Browser `w05.international.gc.ca/projectbrowser-banqueprojets/.../generate-x-m-l` | XML | all | `scrapers/global-affairs/README.md` (curl one-liner) |

### 2c. First Nations (Supabase)

FNFTA annual reports from `fnp-ppn.aadnc-aandc.gc.ca/fnp/Main/Search/SearchFF.aspx`; specific claims from the ISC Reporting Centre (`src/components/first-nations/FirstNationsFAQ.tsx:21-25`). FAQ says PDFs were scraped and run through "a data processing and validation system" to extract tables; that system is not in the repo [V absent]. Population tables have on/off reserve × sex by year (`src/lib/supabase/types.ts`) — [I] from ISC Indian Registry stats.

### 2d. Update frequency

No scheduler, cron, or CI data job exists (`.github/workflows/ci.yml` runs only `pnpm test` and `pnpm lint`) [V]. Updates are manual commits. Statements are annual by nature. Federal dept pages say "Data updated March 21, 2025" (`national-defence/page.tsx:71`). First Nations pages revalidate hourly against Supabase.

## 3. Pipeline

```
Federal:     PDFs (PublicAccountsPDFs/) ──manual──▶ numbers typed into .tsx literals ──▶ page
Prov/Muni:   PDF/CSV/XLSX ──manual transcription or ad-hoc py/ipynb──▶ CSV intermediates
             ──▶ summary.json + sankey.json (committed) ──▶ generate-statics ──▶ SSG pages
Search:      scrapers/*.sh ──▶ raw JSON/HTML/XML (gitignored: scrapers/*/data/**)
             ──[ETL not in repo]──▶ Datasette/SQLite [I] + Typesense `records` ──▶ client search
First Nations: FNFTA PDFs ──[extraction not in repo]──▶ Supabase + CDN PDFs ──▶ ISR pages
```

- **Manual**: everything from source document to `summary.json`/`sankey.json`. Alberta: "Captured data tables via manual transposition & validation from source PDFs" with PNG screenshots as evidence (`data/provincial/alberta/2024/README2.md` §4). BC: same pattern, 36 PNGs (`data/provincial/british-columbia/2025/data/expense/`).
- **Semi-automated, one-off**: Ontario Python scripts (`data/provincial/ontario/2024/JESSE_DATA_PRUNING_SCRIPTS/Ontario/scripts/*.py`) — their inputs (`PublicAccountsPDFs/2024/tbs-…csv`, `f4801adb-….json`) are **not in the repo** and outputs go to paths (`public/data/sankey_2024_*.json`) that don't exist, so not reproducible as-is [V]. Toronto `convert_toronto_sankey.py` needs an xlsx not in repo. Vancouver `sankey_builder.ipynb` builds the tree from an xlsx; `checker.ipynb` asserts nested sums == totals and surplus ≈ FS p.16 figure. `scrapers/public_accounts/ontario/*.js` generated per-ministry page code from an older Ontario Sankey (legacy).
- **Automated at build**: `pnpm build` = `lingui extract --clean` → `tsx scripts/generate-statics.ts` → `next build` (`package.json`). `generate-statics.ts` does **not transform data**; it walks `data/{provincial,municipal}` for year folders containing `summary.json`, lists `departments/*.json`, records file mtimes, lists article slugs, and writes `data/static-data.json`. That index drives `generateStaticParams`, the sitemap `lastModified` (`src/app/sitemap.ts`) and the legacy redirects (`next.config.ts`).
- **Adding a jurisdiction** = drop `data/{level}/{province}[/{city}]/{yyyy}/summary.json` + `sankey.json`, rebuild. No code change needed [V from `jurisdictions.ts`].
- Reconciliation conventions [V, `alberta/2024/README2.md` §3]: audited top-line totals are authoritative; unaudited ministry detail is reconciled to them and the residual shown as an **"Unreported"** node. Judgement calls (splits, combinations) are documented in the README.

## 4. Data model

**`summary.json`** (one per jurisdiction-year; type `Jurisdiction` in `src/lib/jurisdictions.ts:272`):
```
name, financialYear ("2024-25" | "2024"), source (url), sources?[{label,url,scope}],
totalProvincialSpending (number, $B), totalProvincialSpendingFormatted ("$227.3B"),
netDebt, totalDebt, debtInterest ($B | null), totalEmployees?,
ministries[{name, slug, totalSpending, totalSpendingFormatted, percentage, percentageFormatted}],
methodology? (text, \n\n paragraphs), credits? (markdown-ish), generatedAt?
municipal extras: population, perCapitaSpending, propertyTaxPerCapita, propertyTaxRevenue(+Formatted),
                  budgetBalance(+Formatted)
```
Field name `totalProvincialSpending` is reused for cities [V]. Formatted strings are precomputed in the JSON.

**`sankey.json`** (`SankeyData`, `src/components/Sankey/SankeyChartD3.tsx:20`):
```
{ total (revenue − spending), spending, revenue,
  spending_data: { name: "Spending", children: [ {name, children:[…]} | {name, amount} ] },
  revenue_data:  { name: "Revenue",  children: [...] } }
```
Arbitrary depth; leaves carry `amount` in **$ billions** (negatives allowed, e.g. "Recoveries"). Federal literal trees may add `link` on a node (`Sankey/index.tsx:363`). The `SankeyNode` TS type declares `id/displayName`, the JSON uses `name` [V]; [I] ids are assigned at render.

**`departments/{slug}.json`** (`Department` type, `jurisdictions.ts:294`): totals, `categories[{name,amount}]`, `spending_data` tree, plus editable copy fields (`introText`, `roleText`, `programsDescription`, …). No instances exist.

**Search record** (`src/types/search.ts`), Typesense `records`:
```
key, objectID, type, recipient, vendor_name?, payer, fiscal_year, program, timestamp,
amount, description, award_type, province?, country?, is_aggregated?, source_url?
```
`query_by: recipient,program,description` weights 4,2,1; facets `payer, fiscal_year, recipient, province, country, program, award_type`; sort by `amount` asc/desc (`Search.tsx:41-55, 212-248, 436-443`). One unified schema across all source tables; detail pages fetch the source-native row (e.g. NSERC `project_lead_name, institution, competition_year, installment, award_summary`; contracts `reference_number, vendor_name, contract_value, reporting_period, description_en, comments_en`).

**First Nations** (`src/lib/supabase/types.ts`): `extraction_availability{bcid, name, province, fiscal_years[], chunk_types_by_year}`; `annual_report_extractions{bcid, fiscal_year_end, chunk_type, extracted_data, is_active}` where `extracted_data` is one of `StatementOfOperations | StatementOfFinancialPosition | Remuneration | Notes`. Statements are `line_items[{name, values{actual_2024, budget_2024,…}, section, is_total, is_subtotal, major_category, parent_category, note_references}]` + `fiscal_periods` + `extraction_metadata{source_file,…}`. Remuneration: `entries[{name, position, months, values{salary, honorarium, travel,…}, row_total}]`, `is_audited`, `auditor_name`. Claims (`src/lib/supabase/claims.ts`): `claim_name, status, process_stage, settlement_amount, tribunal_award, key_dates`. Sankey built client-side from statements (`src/lib/supabase/sankey-transform.ts`).

**Tax** (`src/lib/tax/configs/{year}/{province}.ts`): brackets, BPA, credits, CPP/EI caps, plus `*_SPENDING: [{name, percentage}]` used to split a taxpayer's bill into spending categories. Percentages are hand-entered ("same as 2024 - update when new fiscal data available", `configs/2025/federal.ts:58`).

## 5. Search, i18n, analytics, deployment

- **Search**: Typesense via `typesense-instantsearch-adapter` + `react-instantsearch` (`src/components/Search.tsx`). Results table/cards; non-aggregated hits link to internal detail page, aggregated hits link to `source_url` (`src/components/ResultsTable.tsx:82-102`). CSV export (`DownloadResultsButton.tsx`, `src/utils/csvUtils.ts`). The indexing job is not in the repo.
- **i18n**: Lingui 5, `en` source, `fr` (`lingui.config.js`), ~1,018 message ids (`src/locales/en.po`). UI strings and the federal Sankey labels are wrapped in `t\`…\``, so federal data labels are translated. `summary.json`/`sankey.json` have no French fields [V] → [I] provincial/municipal labels render in English on `/fr`. Articles are separate `en/` and `fr/` MDX trees with the same slug.
- **Analytics**: PostHog, proxied through `/ph/*` rewrites to `us.i.posthog.com` to avoid ad-blockers; manual pageview capture (`src/app/[lang]/providers.tsx`, `next.config.ts` rewrites).
- **Newsletter**: Beehiiv (`src/app/api/newsletter/route.tsx`).
- **Deployment**: no `vercel.json`/Dockerfile/wrangler in repo; `.gitignore` lists `.vercel` (and ignores a local `Dockerfile`) → [I] Vercel. Needs a Node runtime (API route, ISR, OG image route), not a static export. `typescript.ignoreBuildErrors: true` (`next.config.ts`). `transpilePackages: ["@buildcanada/charts"]` references a package not in `package.json` [V] — stale.
- **Charts**: D3 Sankey (`src/components/Sankey/SankeyChartD3.tsx`), Recharts line/bar.

## 6. Provenance — does each number link to its source?

**No, not per number.** What exists, from strongest to weakest:

| Area | Granularity of provenance | Evidence |
|---|---|---|
| First Nations statements | Per statement: a "View Source" icon opens the original PDF in an iframe beside the extracted table (`cdn.canadaspends.com/{extraction_metadata.source_file}`); remuneration PDF at `…/financial_statements/{bcid}/{year}/source/remuneration.pdf` | `FirstNationsPageContent.tsx:136-190`, `SourceDocumentViewer.tsx` |
| Search records | Per record: `source_url` (grants: record-specific; contracts: dataset resource URL + `?filters=reference_number:…|vendor_name:…`, i.e. a deep-link to the filtered row; transfers: dataset landing page only) | `DetailsPage.tsx:37-47`, `page.tsx:309` |
| Provincial/municipal | Per jurisdiction-year: `source` URL or `sources[]` with a `scope` note, plus free-text `methodology` and `credits` | `JurisdictionPageContent.tsx:375-530` |
| Federal | One page-level link to Public Accounts 2024; one Sankey node `link`; department pages have **no** source link, only a hand-written "Data updated" date | `federal/spending/page.tsx:149`, `Sankey/index.tsx:363`, `national-defence/page.tsx:71` |

No page numbers, table IDs, or line references are attached to any value in the UI. Page-level traceability exists only in repo docs (Edmonton README cites pp. 64/99; Vancouver notebook cites p.16) and PNG screenshots in `data/**/raw data - images/`, which the site never links to. `extraction_metadata` in Supabase may hold more (typed `Record<string, unknown>`; contents unknown).

## 7. Canada-specific vs portable

| Part | Canada-specific | Portable as-is / as pattern |
|---|---|---|
| Sources | Public Accounts Vol I/II/III, open.canada.ca proactive disclosures, NSERC/SSHRC/CIHR/GAC, FNFTA, provincial public accounts, LAC archive | Pattern: audited annual statements for the overview + transaction-level open datasets for search |
| Government structure | federal / 13 provinces & territories / municipalities; First Nations bands (`bcid`); ministers per dept | 3-level `data/{level}/{parent}/{child}/{yyyy}/` folder convention; jurisdiction-agnostic loader |
| Fiscal year | Apr–Mar federal/provincial, calendar for cities | "folder = FY-end year" + `financialYear` display string |
| Language | en/fr Lingui catalogs, separate MDX per lang | Lingui setup, locale-prefixed routes, Accept-Language middleware |
| Tax | CRA brackets, CPP/EI/QPP, provincial surtaxes/health premiums, Quebec abatement | Calculator engine (`bracketCalculator`, `cappedCalculator`, scenario/simulator) |
| Currency/format | CAD, `$227.3B` strings baked into JSON | Units convention ($B in JSON), `formatNumber` |
| Data shapes | `totalProvincialSpending` naming | `summary.json` + recursive `sankey.json` tree, "Unreported" reconciliation node, Typesense unified `records` schema |
| Infra | Build Canada's Typesense/Datasette/Supabase hosts | Next.js SSG + ISR, PostHog proxy, sitemap from static index |
| Scrapers | Endpoint-specific curl scripts | Raw dump → normalise → index pattern; resumable "skip if file exists" downloads |

## 8. Open questions / not determinable from the repo

1. The ETL that turns scraper output into Typesense `records` and the `api.canadasbuilding.com` tables (schema, dedupe, `is_aggregated` logic, refresh cadence, record counts per table).
2. Whether `api.canadasbuilding.com` is really Datasette (only the `_shape=array` hint).
3. The First Nations PDF→JSON extraction system (OCR/LLM? validation rules? what `extraction_metadata` contains — page numbers?).
4. How federal literals were derived from the Public Accounts PDFs (no notebook or script for federal in the repo); which Vol/section each federal number came from.
5. Source for the Ontario 2024 inputs referenced by `clean_public_accounts_2024.py` and Toronto's xlsx (not committed).
6. Production hosting/CDN provider and env setup (Vercel only inferred).
7. Why `departments/*.json` pages are wired but empty — planned feature or abandoned.
8. Contract/transfer dataset date ranges and update frequency on the live site.
9. Live search index size/coverage — not checked against the live site (no network calls made).
