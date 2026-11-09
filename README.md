# build malaysia

```
$ open https://buildmalaysia.com
```

where the rakyat's money went. every ringgit. every ministry. every contract.

the government publishes all of this. in PDFs. hundreds of pages of them. some with no text layer. one with a page
missing. we read them so you don't have to, and we show our work: every figure on the site links to the exact page of
the official document it came from.

and we don't trust ourselves either. every total the document prints gets recomputed from the line items before a load
is accepted. one sen off and the whole load rolls back. no vibes. only receipts.

research behind the design lives in [`specs/`](specs/). build canada's repos, cloned for reference only, sit in the
git-ignored `reference/` folder.

## the sources

### the accounts (what was actually spent)

JANM, _Penyata Kewangan Kerajaan Persekutuan_ (Federal Government Financial Statements), audited by the National Audit
Department. FY2016 to FY2025 are loaded. URLs, hashes and page ranges: `pipeline/src/pipeline/sources.py`. example:
<https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2025_Penyata_Kewangan_Kerajaan_Persekutuan.pdf>

- **Lampiran 1**, _Penyata Perbelanjaan Mengurus_ (operating expenditure), PDF pages 103–212. for every vote → programme
  → activity → object group: the original estimate (Asal), supplementary (Tambahan/(Kurangan)), virement (Viremen),
  revised total (Jumlah) and actual spending (Sebenar).
- **Lampiran 2**, _Penyata Perbelanjaan Pembangunan_ (development expenditure), PDF pages 214–249. for every development
  vote → agency group → project: total cost, the year's estimate and actual (direct and loan-funded), and spending under
  the Twelfth Malaysia Plan (RMKe-12) to date.
- **Lampiran 3**, _Penyata Perbelanjaan Kumpulan Wang COVID-19_ (FY2020–2023): the COVID-19 Fund's programmes, financed
  outside the operating account.

boss fights:

- FY2020's Lampiran 1 has no text layer. it's a scan. so we OCR it (`pipeline/src/pipeline/ocr.py`), and cache the
  readings in `data/ocr/` so we only suffer once.
- FY2019's published PDF is missing one page of Lampiran 1. not our bug. registered as a `KnownGap`, shown on the site,
  never papered over.

### the budget (what was promised)

Kementerian Kewangan, _Anggaran Perbelanjaan Persekutuan_ (the federal budget book): Budget 2025, 2026 and 2027.
example: <https://belanjawan.mof.gov.my/pdf/belanjawan2027/perbelanjaan/Anggaran_Perbelanjaan_Persekutuan_2027.pdf>

### the contracts (who got paid)

Kementerian Kewangan's [MyProcurement](https://myprocurement.treasury.gov.my/): every published tender, quotation and
direct-negotiation result, with the ministry, agency, winners and accepted price (Harga Setuju Terima).

`fetch-procurement` saves every result page under `data/raw/myprocurement/<date>/` (git-ignored). sounds easy. it is
not easy.

- MyProcurement sorts each listing by date and nothing else. results from the same day come back in a different order
  on every request, so a day that runs across a page boundary quietly loses some. the fetch reads each such day again
  on its own until every result has shown up.
- some days have more than one page of results (1 December 2021: 874 archived tenders) and never return some of them
  no matter how many times you ask. so we split them by category, ministry, agency, then procurement-number prefix,
  until each slice fits on one page. divide and conquer, but for government websites.

`load-procurement` replaces the procurement tables from the newest snapshot, and refuses one with a missing page or
day, a listing with fewer results than MyProcurement reports, or a result whose two printings of its winners disagree.
MyProcurement prints no budget vote, so these rows are not joined to the statements. we'd love to. we can't.

each contract gets its own page, read with a fixed set of checks adapted from the Open Contracting Partnership's
_Red Flags in Public Procurement_ and the Treasury's own circulars. a check raises a question. it is not an accusation.
the formulas are public at [`/contracts/method`](https://buildmalaysia.com/contracts/method) and the design notes are in
[`specs/contracts-commentary.md`](specs/contracts-commentary.md).

## the layout

| path                   | what                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/` | the Postgres schema. the contract between pipeline and web. touch it carefully.                                                                                |
| `pipeline/`            | Python (uv). downloads source PDFs, checks their hash, parses them, loads Postgres in one transaction that commits only if `reconciliation` finds nothing.     |
| `web/`                 | Astro on Cloudflare Workers. reads Postgres, renders on the server, ships approximately zero JavaScript.                                                       |
| `data/raw/`            | downloaded source PDFs (git-ignored; re-fetched and hash-checked by the pipeline).                                                                             |
| `data/lineage/`        | the ministry lineage: bodies, their names and dates, vote holders and reorganisations, every row with a citation. loaded by `python -m pipeline load-lineage`. |

## the data model

money is integer sen. always. floats are not welcome here.

- `operating_line`: the leaf fact. one row per (fiscal year, vote, activity, object group), with `pdf_page`, `book_page`
  and the raw `source_text` line it was read from.
- `vote`, `programme`, `activity`, `object_group`: the hierarchy. names stay in Bahasa Malaysia as printed (`name_ms`).
- `printed_total`: every total line the document prints (activity, programme, vote, section, whole statement; per
  object group or overall).
- `reconciliation` (view): recomputes each printed total from the leaves. `matches` must be true for every row. this is
  the whole game.
- `development_project`: one row per Lampiran 2 project, nine amounts in sen, citing both pages of its spread.
  `development_vote` and `development_group` hold the hierarchy; `development_printed_total` and the
  `development_reconciliation` view work as above.
- `covid_fund_line`, `covid_fund_total`, `covid_fund_reconciliation`: Lampiran 3.
- `budget_vote_figure`, `budget_total`: the MOF budget book's vote summary (two years of actuals, the current and the
  proposed budget). `budget_heading`, `budget_operating_line`, `budget_operating_total`: operating estimates by
  programme, activity and object group, with posts. `budget_development_project`, `budget_development_group`,
  `budget_development_total`: development estimates by project. each has a reconciliation view; `budget_actual_check`
  compares MOF's actuals with JANM's.
- `federal_spending` (view): the year's total: operating less its transfer to the Development Fund, plus development,
  plus COVID-19 Fund spending. `ministry_spending` (view): each ministry's supply vote B.nn beside its development vote
  P.nn, with the body behind them.
- `body`, `body_alias`, `vote_holder`, `lineage_edge`, `citation`: which institution stood behind each vote in each
  year. here's the twist: a vote number is a funding line, not a ministry. B/P.15 and B/P.33 have each been used by
  two different ministries, and most ministries have been renamed at least once. so:

  - `body` is the institution, and carries the name the site shows;
  - `body_alias` is every name it has carried, printed or gazetted, with the dates;
  - `vote_holder` is the body behind each vote code over a range of fiscal years;
  - `lineage_edge` is each reorganisation between two bodies, with the date it took effect and the functions that
    moved.

  every alias and edge cites its source in `citation`. `ministry_spending` adds `body_id`, `body_name_ms` and `residual`
  (true when a number was still printed, with zero, after its body was dissolved). these rows come from the reviewable
  files in `data/lineage/`, never from a PDF, and carry no amounts; the share of a partial move is computed from the
  loaded spending.

- `procurement_notice`, `procurement_award`, `procurement_snapshot`: one row per published result (`kind` tender,
  quotation or direct) with its MyProcurement id and link, one per winner with the price in sen, and the snapshot they
  came from. `dated` files a result under its decision date, or under the date it was published where no decision date
  is printed or the printed one falls after publication.
- `vote_lineage_check` (view): every printed vote name in the statements and budget books, with the body that held it
  and a `problem` when the lineage doesn't cover it. `ingest` and `ingest-budget` roll back a document with a problem
  row, so the next cabinet reshuffle gets caught at ingest instead of in production.

## run it locally

```bash
createdb buildmalaysia
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d buildmalaysia -f "$f"; done

cd pipeline && uv sync
uv run python -m pipeline load-lineage --database-url postgresql:///buildmalaysia   # before any ingest; safe to rerun
for y in $(seq 2016 2025); do uv run python -m pipeline ingest --year $y --database-url postgresql:///buildmalaysia; done
for y in 2025 2026 2027; do uv run python -m pipeline ingest-budget --year $y --database-url postgresql:///buildmalaysia; done
uv run python -m pipeline fetch-procurement   # about 1,650 pages, 1–2 hours. go make kopi. rerun to resume
uv run python -m pipeline load-procurement --database-url postgresql:///buildmalaysia
uv run pytest                       # all tests; the integration ones use the PDFs and the buildmalaysia_pipeline db
uv run pytest -m "not integration"  # unit tests only, as CI runs them

cd ../web && pnpm install
pnpm dev       # http://localhost:4321, in the Workers runtime, reading Postgres through the local Hyperdrive binding
```

`wrangler.jsonc` points local runs at `postgres:postgres@127.0.0.1/buildmalaysia`. if your database belongs to another
role, set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, e.g.
`postgresql://$USER:local@127.0.0.1:5432/buildmalaysia`. the string needs a password even when Postgres ignores it.
don't ask. wrangler insists.

## when the cabinet reshuffles

it will. when a new statement or budget book prints a vote the lineage doesn't cover, `ingest` and `ingest-budget`
stop and list every row that needs a decision, e.g. `mof 2028 B.33 'KEMENTERIAN X': no vote_holder`. fix the files in
`data/lineage/`, rerun `load-lineage`, then the ingest. research so far:
[`specs/ministry-lineage.md`](specs/ministry-lineage.md).

1. **same ministry, new name**: add a row to `aliases.csv` (`origin` printed or gazetted; `valid_from` the date the name
   took effect; `confidence` high when a gazette, a budget-book note or the statement itself shows it, medium when only
   a secondary source does) with a `citation_id` from `citations.csv`.
2. **a new ministry, or a number reused for a different one**: add the body to `bodies.csv` with its `established`
   date, its names to `aliases.csv`, and a `vote_holders.csv` row (`B/P.nn` covers both votes; `from_year` the first
   fiscal year it is printed). close the previous holder's `to_year` at its last printed year, residual zero years
   included, and set the old body's `dissolved` date.
3. **functions moving between ministries**: add a row to `edges.csv` with the `effective` date, `whole` true only when
   the entire predecessor became part of the successor (then `functions` is empty), and otherwise the agencies or
   activities that moved, as the source names them. the site shows the edge on both bodies' pages and leaves both out
   of the "fastest growth" finding for the years it touches.
4. **a move no source confirms**: load it with `confidence` unverified. the site shows it and never uses it to merge or
   exclude data.

`load-lineage` replaces the five tables in one transaction and is safe to rerun. it rejects a file that references an
unknown body or citation, gives two bodies the same slug, gives a vote two holders in a year, or leaves a loaded
document uncovered.

## ship it

the site runs on Cloudflare Workers through Astro's
[Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) and reads Supabase Postgres
through Hyperdrive. Supabase holds a copy of the local database. the pipeline never writes to it.

```bash
supabase link --project-ref <ref> && supabase db push    # schema
SUPABASE_DB_URL=<session pooler URL> scripts/publish-db.sh  # data, the lineage tables included, checked row for row
uv run --project pipeline python scripts/publish-procurement.py  # only the procurement tables, through `supabase login`
psql "$SUPABASE_DB_URL" -v web_password=<password> -f scripts/hosted-roles.sql  # the site's read-only role; safe to rerun
cd web && pnpm preview                                     # build, then run the built Worker locally against local Postgres
```

**merging to `main` deploys.** that's it. that's the deploy process. the `Deploy` job in `.github/workflows/ci.yml` runs
`pnpm run deploy` once the checks pass, with a `CLOUDFLARE_API_TOKEN` secret on the `production` environment (Workers
Scripts: Edit on the account). the build needs no database, so `pnpm run deploy` also works from any machine with that
token.

### why it's fast

- the hosted database is Supabase project `dfwbiclpcavqgatiyqtt` in Singapore, next to the Cloudflare location most
  readers hit. moving it from Mumbai took an uncached vote page's server time from 224 ms to 61 ms (median of 12 pages
  each, through Singapore). geography is a performance optimisation.
- `web/worker.ts` caches each rendered page for an hour per Cloudflare data center, keyed to the deployed version, so a
  deploy is live on the next page load. Hyperdrive caches each query's result for an hour (`--max-age 3600 --swr 600`).
  together: published data reaches readers within about two hours. redeploy if you can't wait.
- pages that wait on slow queries send their heading first and stream the rest in behind a skeleton
  (`web/src/components/PageBody.astro`). you see the page before the database finishes thinking.
- the Worker is deliberately _not_ placed beside the database. with the database in Mumbai, that made a cold page as
  fast as a cached one, and added about 420 ms to every cached page. bad trade. we measured.
- browsers keep files under `/_astro/` for a year (the adapter writes the `_headers` rule).

### the boring but important bits

- Hyperdrive connects as `web_reader` straight to the database host (IPv6), not the session pooler, whose 15-client
  limit Hyperdrive's pool outgrows. its origin connection limit is 20 of the database's 60.
- the Worker needs the Workers Paid plan: rendering a page takes 250 to 550 ms of CPU, and the free plan allows 10.
- `web/worker.ts` sits in front of the Astro app. it redirects HTTP and `www.buildmalaysia.com` to
  `https://buildmalaysia.com` and sets the security headers (HSTS, nosniff, no framing). Astro renders every page per
  request (`output: "server"`), so the page cache is the only cache.

### email alerts

alerts go through Resend, in the same team as other mailing lists. confirmed subscribers are added to the segment and
opted in to the private, opt-out-by-default topic named in `wrangler.jsonc` (`vars`). the sign-up never touches a
contact's team-wide unsubscribe flag. two Worker secrets complete it:

```bash
cd web
npx wrangler secret put RESEND_API_KEY                               # a Resend key with full access (it creates contacts)
openssl rand -hex 32 | npx wrangler secret put SUBSCRIBE_SECRET      # signs the confirmation links
```

sign-ups are rate-limited to 5 a minute per IP by the `SUBSCRIBE_LIMITER` binding in `wrangler.jsonc`. no dashboard
setup needed.

to send an alert when new data lands: create a Resend Broadcast to the "Build Malaysia data alerts" segment with the
"Build Malaysia data alerts" topic selected, so only people who opted in get it, and include
`{{{RESEND_UNSUBSCRIBE_URL}}}` in the body.

## contributing

`main` is protected. every change lands through a pull request from a short-lived branch, and CI must pass first. no
force pushes. no "quick fix on main". no.

CI (`.github/workflows/ci.yml`) runs the web tests, lint, typecheck and Prettier check, plus the pipeline's ruff check
and unit tests. the pipeline's integration tests need the source PDFs and Postgres, so run them locally before a pull
request that touches parsing or loading.

- web: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format` (Prettier, 120 columns).
- pipeline: `uv run pytest`, `uvx ruff@0.17.3 check .`, `uvx ruff@0.17.3 format .`.
- commit messages are one plain imperative sentence ("Show the COVID-19 Fund's withdrawals"), with detail in the body
  when it helps.

### the one rule

**never type a number in by hand.** ever. a figure the parser can't read is a parser fix, or a `KnownMisprint`,
`KnownGap` or `ManualReading` registered with its page and evidence. if you're tempted to hardcode a ringgit amount:
skill issue. fix the parser.

## license

code: MIT, see [`LICENSE`](LICENSE). the web design adapts build canada's
[CanadaSpends](https://github.com/BuildCanada/CanadaSpends) under its MIT licence
([`web/THIRD_PARTY_NOTICES.md`](web/THIRD_PARTY_NOTICES.md)). build malaysia is not affiliated with build canada. the
figures come from Malaysian government publications, cited page by page.

made for the rakyat. 🇲🇾
