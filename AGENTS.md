# AGENTS.md

The full reference for working on Build Malaysia: sources, schema, commands, deploys and rules. Read this before changing code. The short version for people is in [`README.md`](README.md).

## Sources

### Financial statements

JANM, _Penyata Kewangan Kerajaan Persekutuan_ (Federal Government Financial Statements), audited by the National Audit Department. Statements loaded: FY2016 to FY2025 (URLs, hashes and page ranges in `pipeline/src/pipeline/sources.py`). FY2020's Lampiran 1 has no text layer and is read by OCR (`pipeline/src/pipeline/ocr.py`, readings cached in `data/ocr/`); FY2019's published PDF is missing one page of Lampiran 1, registered as a `KnownGap`, e.g. <https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2025_Penyata_Kewangan_Kerajaan_Persekutuan.pdf>.

- Lampiran 1, _Penyata Perbelanjaan Mengurus_ (operating expenditure), PDF pages 103–212. For every vote → programme → activity → object group: the original estimate (Asal), supplementary (Tambahan/(Kurangan)), virement (Viremen), revised total (Jumlah) and actual spending (Sebenar).
- Lampiran 2, _Penyata Perbelanjaan Pembangunan_ (development expenditure), PDF pages 214–249. For every development vote → agency group → project: total cost, the year's estimate and actual (direct and loan-funded), and spending under the Twelfth Malaysia Plan (RMKe-12) to date.
- Lampiran 3, _Penyata Perbelanjaan Kumpulan Wang COVID-19_ (FY2020-2023): the COVID-19 Fund's programmes, financed outside the operating account.

### Budget books

Kementerian Kewangan, _Anggaran Perbelanjaan Persekutuan_ (the federal budget book), Budget 2025, 2026 and 2027, e.g. <https://belanjawan.mof.gov.my/pdf/belanjawan2027/perbelanjaan/Anggaran_Perbelanjaan_Persekutuan_2027.pdf>.

### Procurement

Kementerian Kewangan's [MyProcurement](https://myprocurement.treasury.gov.my/): every published tender, quotation and direct-negotiation result, with the ministry, agency, winners and accepted price (Harga Setuju Terima). `fetch-procurement` saves every result page under `data/raw/myprocurement/<date>/` (git-ignored). MyProcurement sorts each listing by date alone, so results shown on the same day come back in a different order on every request and a day that runs across a page boundary loses some; the fetch then reads each such day again on its own until all of its results are seen. A day with more than one page of results (1 December 2021 has 874 archived tenders) never returns some of them however often it is read, so it is split by category, ministry, agency and then procurement-number prefix until each slice fits on one page. `load-procurement` replaces the procurement tables from the newest snapshot, and refuses one with a missing page or day, a listing with fewer results than MyProcurement reports, or a result whose two printings of its winners differ. MyProcurement prints no budget vote, so these rows are not joined to the statements.

Each contract and company has its own page with commentary worked out by formula. The checks, limits and loading design are in [`specs/contracts-commentary.md`](specs/contracts-commentary.md); the reader-facing version is `/contracts/method`.

### Bills and Acts

Parliament's bill listings for the [Dewan Rakyat](https://www.parlimen.gov.my/bills-dewan-rakyat.html?uweb=dr&) and the [Dewan Negara](https://www.parlimen.gov.my/bills-dewan-negara.html?uweb=dn&): the current bills as an HTML table, and every year from 1990 as the XML tree each archive page loads. Bills keep their Dewan Rakyat number (D.R. n/yyyy) in the Dewan Negara, so the houses join on it, and `load-bills` stops when the two houses print different titles under one number until `data/bills/house_links.csv` decides whether to keep or drop the Dewan Negara's record (`bill`, `dewan_negara` keep or drop, `evidence`); titles that differ only in an apostrophe or a `-DR` mark after the year count as the same. The archive gives no dates before about 2012, prints an empty date as `30/11/-0001`, cuts some titles at 100 characters (and prints others longer whole), and lists some 2017 bills twice (the two printings must agree). parlimen.gov.my sends its certificate without its intermediate, so the pipeline carries that intermediate in `pipeline/src/pipeline/certs/`.

The Acts come from the Attorney General's Chambers' [Laws of Malaysia](https://lom.agc.gov.my/): principal, amending (A-numbers, online from 2011) and repealed Acts, with the Royal Assent, gazette and commencement dates. Its listing endpoints return each list whole but encrypted (AES-256-GCM, under a key each listing page carries for the browser); `fetch-bills` decrypts them the way the page does. Neither side names the other, so `load-bills` matches a passed bill to the Act with its title, allowing a later year where the bill passed later, assented after the bill's passage and within a year of it; where several Acts fit, an exact title beats a later year and then the first assented after the passage is taken. Several Acts fitting an undated bill, or an Act two bills claim, stops the load until `data/bills/act_links.csv` decides it (`bill`, `act` or empty for none, `evidence`). The load prints the bills passed since 2011 that found no Act, and the dates the listings print out of order, which are loaded as printed.

`fetch-bills` saves every listing under `data/raw/bills/<date>/` (git-ignored); `load-bills` replaces the four tables from the newest snapshot.

## Layout

| Path                   | What                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/` | Postgres schema. The contract between pipeline and web.                                                                                                          |
| `pipeline/`            | Python (uv). Downloads source PDFs, verifies their hash, parses them, loads Postgres in one transaction that commits only if `reconciliation` has no mismatches. |
| `web/`                 | Astro site on Cloudflare Workers. Reads Postgres, server-rendered.                                                                                               |
| `data/raw/`            | Downloaded source PDFs (git-ignored; re-fetched and hash-checked by the pipeline).                                                                               |
| `data/lineage/`        | The ministry lineage: bodies, their names and dates, vote holders and reorganisations, each row with a citation. Loaded by `python -m pipeline load-lineage`.    |

## Data model

- `operating_line`: the leaf fact, one row per (fiscal year, vote, activity, object group), amounts in integer sen, with `pdf_page`, `book_page` and the raw `source_text` line.
- `vote`, `programme`, `activity`, `object_group`: the hierarchy. Names are kept in Bahasa Malaysia as printed (`name_ms`).
- `printed_total`: every total line the document prints (activity, programme, vote, section, whole statement; per object group or overall).
- `reconciliation` (view): recomputes each printed total from the leaves. `matches` must be true for every row.
- `development_project`: one row per Lampiran 2 project, nine amounts in sen, citing both pages of its spread. `development_vote` and `development_group` hold the hierarchy; `development_printed_total` and the `development_reconciliation` view work as above.
- `covid_fund_line`, `covid_fund_total`, `covid_fund_reconciliation`: Lampiran 3.
- `budget_vote_figure`, `budget_total`: the MOF budget book's vote summary (two years of actuals, the current and the proposed budget). `budget_heading`, `budget_operating_line`, `budget_operating_total`: operating estimates by programme, activity and object group with posts. `budget_development_project`, `budget_development_group`, `budget_development_total`: development estimates by project. Each has a reconciliation view; `budget_actual_check` compares MOF's actuals with JANM's.
- `federal_spending` (view): the year's total: operating less its transfer to the Development Fund, plus development, plus COVID-19 Fund spending. `ministry_spending` (view): each ministry's supply vote B.nn beside its development vote P.nn, with the body behind them.
- `body`, `body_alias`, `vote_holder`, `lineage_edge`, `citation`: which institution stood behind each vote in each year. A vote number is a funding line, not a ministry: B/P.15 and B/P.33 have each been used by two different ministries, and most ministries have been renamed. `body` is the institution and carries the name the site shows; `body_alias` every name it has carried, printed or gazetted, with the dates; `vote_holder` the body behind each vote code over a range of fiscal years; `lineage_edge` each reorganisation between two bodies, with the date it took effect and the functions that moved. Every alias and edge cites its source in `citation`. `ministry_spending` adds `body_id`, `body_name_ms` and `residual` (true when a number was still printed, with zero, after its body was dissolved). The rows come from the reviewable files in `data/lineage/`, never from a PDF, and carry no amounts; the share of a partial move is computed from the loaded spending.
- `procurement_notice`, `procurement_award`, `procurement_snapshot`: one row per published result (`kind` tender, quotation or direct) with its MyProcurement id and link, one per winner with the price in sen, and the snapshot they came from. `dated` files a result under its decision date, or the date it was published where no decision date is printed or the printed one falls after publication.
- `vote_lineage_check` (view): every printed vote name in the statements and budget books, with the body that held it and a `problem` when the lineage does not cover it. `ingest` and `ingest-budget` roll back a document with a problem row, so the next reshuffle is caught at ingest.
- `bill`, `bill_house`, `act`, `bill_snapshot`: one row per bill number, one per house that lists it (status, readings, passage, select committee, presenters and PDF as printed), one per Act on Laws of Malaysia, and the snapshot. `bill.act_no` is the bill's Act, with `act_link` `title` or `file`. `bill_progress` (view) gives each bill one `stage`: `enacted`, `passed`, `passed_dewan_rakyat`, `dewan_rakyat`, `committee`, `withdrawn` or `defeated`.

## Local development

```bash
createdb buildmalaysia
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d buildmalaysia -f "$f"; done

cd pipeline && uv sync
uv run python -m pipeline load-lineage --database-url postgresql:///buildmalaysia   # before any ingest; safe to rerun
for y in $(seq 2016 2025); do uv run python -m pipeline ingest --year $y --database-url postgresql:///buildmalaysia; done
for y in 2025 2026 2027; do uv run python -m pipeline ingest-budget --year $y --database-url postgresql:///buildmalaysia; done
uv run python -m pipeline fetch-procurement   # about 1,650 pages, 1–2 hours; rerun to resume
uv run python -m pipeline load-procurement --database-url postgresql:///buildmalaysia
uv run python -m pipeline fetch-bills         # about 75 requests, a minute
uv run python -m pipeline load-bills --database-url postgresql:///buildmalaysia
uv run pytest                       # all tests; the integration ones use the PDFs and the buildmalaysia_pipeline db
uv run pytest -m "not integration"  # unit tests only, as CI runs them

cd ../web && pnpm install
pnpm dev       # http://localhost:4321, in the Workers runtime, reading Postgres through the local Hyperdrive binding
```

`wrangler.jsonc` points local runs at `postgres:postgres@127.0.0.1/buildmalaysia`. If your database belongs to another role, set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, for example `postgresql://$USER:local@127.0.0.1:5432/buildmalaysia`; the string needs a password even when Postgres ignores it.

## Adding a reshuffle

When a new statement or budget book prints a vote the lineage does not cover, `ingest` and `ingest-budget` stop and list the rows that need a decision, for example `mof 2028 B.33 'KEMENTERIAN X': no vote_holder`. Fix the files in `data/lineage/`, rerun `load-lineage`, then the ingest. Research so far is in [`specs/ministry-lineage.md`](specs/ministry-lineage.md).

1. A new name for the same ministry: add a row to `aliases.csv` (`origin` printed or gazetted, `valid_from` the date the name took effect, `confidence` high when a gazette, a budget-book note or the statement itself shows it and medium when only a secondary source does) with a `citation_id` from `citations.csv`.
2. A new ministry, or a number reused for a different one: add the body to `bodies.csv` with its `established` date, its names to `aliases.csv`, and a `vote_holders.csv` row (`B/P.nn` covers both votes; `from_year` the first fiscal year it is printed). Close the previous holder's `to_year` at its last printed year, residual zero years included, and set the old body's `dissolved` date.
3. Functions moving between ministries: add a row to `edges.csv` with the `effective` date, `whole` true only when the entire predecessor became part of the successor (then `functions` is empty), and otherwise the agencies or activities that moved, as the source names them. The site shows the edge on both bodies' pages and leaves both out of the "fastest growth" finding for the years it touches.
4. A move no source confirms: load it with `confidence` unverified. The site shows it and never uses it to merge or exclude data.

`load-lineage` replaces the five tables in one transaction and is safe to rerun. It rejects a file that references an unknown body or citation, gives two bodies the same slug, gives a vote two holders in a year, or leaves a loaded document uncovered.

## Hosting

The site runs on Cloudflare Workers through Astro's [Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) and reads Supabase Postgres through Hyperdrive. Supabase holds a copy of the local database; the pipeline never writes to it.

```bash
supabase link --project-ref <ref> && supabase db push    # schema
SUPABASE_DB_URL=<session pooler URL> scripts/publish-db.sh  # data, the lineage tables included, checked row for row
uv run --project pipeline python scripts/publish-procurement.py  # only the procurement tables, through `supabase login`
uv run --project pipeline python scripts/publish-procurement.py --set bills  # only the bill and Act tables
psql "$SUPABASE_DB_URL" -v web_password=<password> -f scripts/hosted-roles.sql  # access: the site's read-only role; safe to rerun
cd web && pnpm preview                                     # build, then run the built Worker locally against local Postgres
```

The hosted database is Supabase project `dfwbiclpcavqgatiyqtt` in Singapore, beside the Cloudflare location most readers reach; Hyperdrive connects to it directly as `web_reader`. Moving it from Mumbai took the server time of an uncached vote page from 224 ms to 61 ms (median of 12 pages each, through Singapore).

Published data reaches readers within about two hours. Hyperdrive caches each query's result for an hour (`--max-age 3600 --swr 600`), and `worker.ts` caches each rendered page for an hour in the data center that served it; a deploy starts the page cache afresh. The Worker is deliberately not placed beside the database: with the database in Mumbai, that made a cold page as fast as a cached one but added about 420 ms to every cached page.

Merging to `main` deploys: the `Deploy` job in `.github/workflows/ci.yml` runs `pnpm run deploy` once the checks pass, with a `CLOUDFLARE_API_TOKEN` secret on the `production` environment (Workers Scripts: Edit on the account). The build needs no database, so `pnpm run deploy` also works from any machine with that token.

Email alerts go through Resend, in the same team as other mailing lists. Confirmed subscribers are added to the segment and opted in to the private, opt-out-by-default topic named in `wrangler.jsonc` (`vars`); the sign-up never changes a contact's team-wide unsubscribe flag. Two Worker secrets complete it:

```bash
cd web
npx wrangler secret put RESEND_API_KEY                               # a Resend key with full access (it creates contacts)
openssl rand -hex 32 | npx wrangler secret put SUBSCRIBE_SECRET      # signs the confirmation links
```

Sign-ups are rate-limited to 5 a minute per IP by the `SUBSCRIBE_LIMITER` binding in `wrangler.jsonc`; no dashboard setup is needed.

To send an alert when new data is loaded, create a Resend Broadcast to the "Build Malaysia data alerts" segment with the "Build Malaysia data alerts" topic selected, so only people who opted in receive it, and include `{{{RESEND_UNSUBSCRIBE_URL}}}` in the body.

Hyperdrive connects as `web_reader` straight to the database host (IPv6), not the session pooler, whose 15-client limit Hyperdrive's pool outgrows; its origin connection limit is 20 of the database's 60. The Worker needs the Workers Paid plan: rendering a page takes 250 to 550 ms of CPU, and the free plan allows 10. `web/worker.ts` sits in front of the Astro app: it redirects HTTP and `www.buildmalaysia.com` to `https://buildmalaysia.com`, sets the security headers (HSTS, nosniff, no framing), and caches each rendered page for an hour per Cloudflare data center, keyed to the deployed version, so a deploy is live on the next page load. Astro renders every page per request (`output: "server"`), so that cache is the only one. Browsers keep files under `/_astro/` for a year (the adapter writes the `_headers` rule). After reloading the database, pages catch up within the hour; redeploy to show the new data at once.

## Rules

- Never type a number in by hand. A figure the parser cannot read is a parser fix, or a `KnownMisprint`, `KnownGap` or `ManualReading` registered with its page and evidence.
- Never write to the hosted database except through `scripts/publish-db.sh` or `scripts/publish-procurement.py` (`--set procurement` or `--set bills`).
- `main` is protected: open a pull request from a short-lived branch; merging deploys.

## Contributing

`main` is protected: every change lands through a pull request from a short-lived branch, and CI must pass first. CI (`.github/workflows/ci.yml`) runs the web tests, lint, typecheck and Prettier check, and the pipeline's ruff check and unit tests. The pipeline's integration tests need the source PDFs and Postgres, so run them locally before a pull request that touches parsing or loading.

- Web: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format` (Prettier, 120 columns).
- Pipeline: `uv run pytest`, `uvx ruff@0.17.3 check .`, `uvx ruff@0.17.3 format .`.
- Commit messages are one plain imperative sentence ("Show the COVID-19 Fund's withdrawals"), with detail in the body when it helps.
- Never type a number in by hand. A figure the parser cannot read is a parser fix, or a `KnownMisprint`, `KnownGap` or `ManualReading` registered with its page and evidence.

## License

Code: MIT, see [`LICENSE`](LICENSE). The web design adapts Build Canada's [CanadaSpends](https://github.com/BuildCanada/CanadaSpends) under its MIT licence ([`web/THIRD_PARTY_NOTICES.md`](web/THIRD_PARTY_NOTICES.md)); Build Malaysia is not affiliated with Build Canada. The figures come from Malaysian government publications, cited page by page.
