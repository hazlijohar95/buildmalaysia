# Build Malaysia

Shows how the Malaysian federal government budgets and spends public money. Every figure on the site links to the page of the official document it came from, and every total the source document prints is recomputed from the extracted line items before a load is accepted.

Research behind the design: [`specs/`](specs/). Build Canada's repos, cloned for reference only, live in the git-ignored `reference/` folder.

## First source

JANM, _Penyata Kewangan Kerajaan Persekutuan_ (Federal Government Financial Statements), audited by the National Audit Department. Statements loaded: FY2016 to FY2025 (URLs, hashes and page ranges in `pipeline/src/pipeline/sources.py`). FY2020's Lampiran 1 has no text layer and is read by OCR (`pipeline/src/pipeline/ocr.py`, readings cached in `data/ocr/`); FY2019's published PDF is missing one page of Lampiran 1, registered as a `KnownGap`, e.g. <https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2025_Penyata_Kewangan_Kerajaan_Persekutuan.pdf>.

- Lampiran 1, _Penyata Perbelanjaan Mengurus_ (operating expenditure), PDF pages 103–212. For every vote → programme → activity → object group: the original estimate (Asal), supplementary (Tambahan/(Kurangan)), virement (Viremen), revised total (Jumlah) and actual spending (Sebenar).
- Lampiran 2, _Penyata Perbelanjaan Pembangunan_ (development expenditure), PDF pages 214–249. For every development vote → agency group → project: total cost, the year's estimate and actual (direct and loan-funded), and spending under the Twelfth Malaysia Plan (RMKe-12) to date.
- Lampiran 3, _Penyata Perbelanjaan Kumpulan Wang COVID-19_ (FY2020-2023): the COVID-19 Fund's programmes, financed outside the operating account.

## Budget source

Kementerian Kewangan, _Anggaran Perbelanjaan Persekutuan_ (the federal budget book), Budget 2025, 2026 and 2027, e.g. <https://belanjawan.mof.gov.my/pdf/belanjawan2027/perbelanjaan/Anggaran_Perbelanjaan_Persekutuan_2027.pdf>.

## Layout

| Path                   | What                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/` | Postgres schema. The contract between pipeline and web.                                                                                                          |
| `pipeline/`            | Python (uv). Downloads source PDFs, verifies their hash, parses them, loads Postgres in one transaction that commits only if `reconciliation` has no mismatches. |
| `web/`                 | Next.js site. Reads Postgres, server-rendered.                                                                                                                   |
| `data/raw/`            | Downloaded source PDFs (git-ignored; re-fetched and hash-checked by the pipeline).                                                                               |

## Data model

- `operating_line`: the leaf fact, one row per (fiscal year, vote, activity, object group), amounts in integer sen, with `pdf_page`, `book_page` and the raw `source_text` line.
- `vote`, `programme`, `activity`, `object_group`: the hierarchy. Names are kept in Bahasa Malaysia as printed (`name_ms`).
- `printed_total`: every total line the document prints (activity, programme, vote, section, whole statement; per object group or overall).
- `reconciliation` (view): recomputes each printed total from the leaves. `matches` must be true for every row.
- `development_project`: one row per Lampiran 2 project, nine amounts in sen, citing both pages of its spread. `development_vote` and `development_group` hold the hierarchy; `development_printed_total` and the `development_reconciliation` view work as above.
- `covid_fund_line`, `covid_fund_total`, `covid_fund_reconciliation`: Lampiran 3.
- `budget_vote_figure`, `budget_total`: the MOF budget book's vote summary (two years of actuals, the current and the proposed budget). `budget_heading`, `budget_operating_line`, `budget_operating_total`: operating estimates by programme, activity and object group with posts. `budget_development_project`, `budget_development_group`, `budget_development_total`: development estimates by project. Each has a reconciliation view; `budget_actual_check` compares MOF's actuals with JANM's.
- `federal_spending` (view): the year's total: operating less its transfer to the Development Fund, plus development, plus COVID-19 Fund spending. `ministry_spending` (view): each ministry's supply vote B.nn beside its development vote P.nn.

## Local development

```bash
createdb buildmalaysia
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d buildmalaysia -f "$f"; done

cd pipeline && uv sync
for y in $(seq 2016 2025); do uv run python -m pipeline ingest --year $y --database-url postgresql:///buildmalaysia; done
for y in 2025 2026 2027; do uv run python -m pipeline ingest-budget --year $y --database-url postgresql:///buildmalaysia; done
uv run pytest                       # all tests; the integration ones use the PDFs and the buildmalaysia_pipeline db
uv run pytest -m "not integration"  # unit tests only, as CI runs them

cd ../web && pnpm install
DATABASE_URL=postgresql:///buildmalaysia pnpm build && DATABASE_URL=postgresql:///buildmalaysia pnpm start
```

Prerendered pages refresh hourly; restart or rebuild the site to see a new ingest at once.

## Hosting

The site runs on Cloudflare Workers through the [OpenNext adapter](https://opennext.js.org/cloudflare) and reads Supabase Postgres through Hyperdrive. Supabase holds a copy of the local database; the pipeline never writes to it.

```bash
supabase link --project-ref <ref> && supabase db push    # schema
SUPABASE_DB_URL=<session pooler URL> scripts/publish-db.sh  # data, checked row for row
psql "$SUPABASE_DB_URL" -v web_password=<password> -f scripts/hosted-roles.sql  # access: the site's read-only role; safe to rerun
cd web && pnpm preview                                     # run the Worker locally against local Postgres
```

Merging to `main` deploys: the `Deploy` job in `.github/workflows/ci.yml` runs `pnpm run deploy` once the checks pass, with a `CLOUDFLARE_API_TOKEN` secret on the `production` environment (Workers Scripts: Edit on the account). The build needs no database, so `pnpm run deploy` also works from any machine with that token.

Email alerts go through Resend, in the same team as other mailing lists. Confirmed subscribers are added to the segment and opted in to the private, opt-out-by-default topic named in `wrangler.jsonc` (`vars`); the sign-up never changes a contact's team-wide unsubscribe flag. Two Worker secrets complete it:

```bash
cd web
npx wrangler secret put RESEND_API_KEY                               # a Resend key with full access (it creates contacts)
openssl rand -hex 32 | npx wrangler secret put SUBSCRIBE_SECRET      # signs the confirmation links
```

Sign-ups are rate-limited to 5 a minute per IP by the `SUBSCRIBE_LIMITER` binding in `wrangler.jsonc`; no dashboard setup is needed.

To send an alert when new data is loaded, create a Resend Broadcast to the "Build Malaysia data alerts" segment with the "Build Malaysia data alerts" topic selected, so only people who opted in receive it, and include `{{{RESEND_UNSUBSCRIBE_URL}}}` in the body.

Hyperdrive connects as `web_reader` straight to the database host (IPv6), not the session pooler, whose 15-client limit Hyperdrive's pool outgrows; its origin connection limit is 20 of the database's 60. The Worker needs the Workers Paid plan: rendering a page takes 250 to 550 ms of CPU, and the free plan allows 10. `web/worker.ts` sits in front of the Next app: it redirects HTTP and `www.buildmalaysia.com` to `https://buildmalaysia.com`, sets the security headers (HSTS, nosniff, no framing), and caches each rendered page for an hour per Cloudflare data center, keyed to the deployed version, so a deploy is live on the next page load. Next renders every page per request (`dynamic = "force-dynamic"` in the root layout), so that cache is the only one. Browsers keep files under `/_next/static/` for a year (`web/public/_headers`). After reloading the database, pages catch up within the hour; redeploy to show the new data at once. `wrangler.jsonc` points local runs at `postgres:postgres@127.0.0.1/buildmalaysia`; set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` if yours differs.

## Contributing

`main` is protected: every change lands through a pull request from a short-lived branch, and CI must pass first. CI (`.github/workflows/ci.yml`) runs the web tests, lint, typecheck and Prettier check, and the pipeline's ruff check and unit tests. The pipeline's integration tests need the source PDFs and Postgres, so run them locally before a pull request that touches parsing or loading.

- Web: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format` (Prettier, 120 columns).
- Pipeline: `uv run pytest`, `uvx ruff@0.17.3 check .`, `uvx ruff@0.17.3 format .`.
- Commit messages are one plain imperative sentence ("Show the COVID-19 Fund's withdrawals"), with detail in the body when it helps.
- Never type a number in by hand. A figure the parser cannot read is a parser fix, or a `KnownMisprint`, `KnownGap` or `ManualReading` registered with its page and evidence.

## License

Code: MIT, see [`LICENSE`](LICENSE). The web design adapts Build Canada's [CanadaSpends](https://github.com/BuildCanada/CanadaSpends) under its MIT licence ([`web/THIRD_PARTY_NOTICES.md`](web/THIRD_PARTY_NOTICES.md)); Build Malaysia is not affiliated with Build Canada. The figures come from Malaysian government publications, cited page by page.
