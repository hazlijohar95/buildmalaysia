# Build Malaysia

Shows how the Malaysian federal government budgets and spends public money. Every figure on the site links to the page of the official document it came from, and every total the source document prints is recomputed from the extracted line items before a load is accepted.

Research behind the design: [`specs/`](specs/). Build Canada's repos, cloned for reference only, live in the git-ignored `reference/` folder.

## First source

JANM, *Penyata Kewangan Kerajaan Persekutuan* (Federal Government Financial Statements), audited by the National Audit Department. Loaded: FY2023, FY2024, FY2025 (URLs, hashes and page ranges in `pipeline/src/pipeline/sources.py`), e.g. <https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2025_Penyata_Kewangan_Kerajaan_Persekutuan.pdf>.

- Lampiran 1, *Penyata Perbelanjaan Mengurus* (operating expenditure), PDF pages 103–212. For every vote → programme → activity → object group: the original estimate (Asal), supplementary (Tambahan/(Kurangan)), virement (Viremen), revised total (Jumlah) and actual spending (Sebenar).
- Lampiran 2, *Penyata Perbelanjaan Pembangunan* (development expenditure), PDF pages 214–249. For every development vote → agency group → project: total cost, the year's estimate and actual (direct and loan-funded), and spending under the Twelfth Malaysia Plan (RMKe-12) to date.

## Layout

| Path | What |
|---|---|
| `supabase/migrations/` | Postgres schema. The contract between pipeline and web. |
| `pipeline/` | Python (uv). Downloads source PDFs, verifies their hash, parses them, loads Postgres in one transaction that commits only if `reconciliation` has no mismatches. |
| `web/` | Next.js site. Reads Postgres, server-rendered. |
| `data/raw/` | Downloaded source PDFs (git-ignored; re-fetched and hash-checked by the pipeline). |

## Data model

- `operating_line`: the leaf fact, one row per (fiscal year, vote, activity, object group), amounts in integer sen, with `pdf_page`, `book_page` and the raw `source_text` line.
- `vote`, `programme`, `activity`, `object_group`: the hierarchy. Names are kept in Bahasa Malaysia as printed (`name_ms`).
- `printed_total`: every total line the document prints (activity, programme, vote, section, whole statement; per object group or overall).
- `reconciliation` (view): recomputes each printed total from the leaves. `matches` must be true for every row.
- `development_project`: one row per Lampiran 2 project, nine amounts in sen, citing both pages of its spread. `development_vote` and `development_group` hold the hierarchy; `development_printed_total` and the `development_reconciliation` view work as above.
- `federal_spending` (view): the year's total, counting the operating account's transfer to the Development Fund once. `ministry_spending` (view): each ministry's supply vote B.nn beside its development vote P.nn.

## Local development

```bash
createdb buildmalaysia
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d buildmalaysia -f "$f"; done

cd pipeline && uv sync
for y in 2023 2024 2025; do uv run python -m pipeline ingest --year $y --database-url postgresql:///buildmalaysia; done
uv run pytest                       # uses the buildmalaysia_pipeline db

cd ../web && pnpm install
DATABASE_URL=postgresql:///buildmalaysia pnpm build && DATABASE_URL=postgresql:///buildmalaysia pnpm start
```

`/` and `/methodology` are prerendered at build time, so rebuild the site after each ingest.

Deploying to Supabase: `supabase link` then `supabase db push`.
