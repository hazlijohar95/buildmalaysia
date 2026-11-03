# Build Malaysia

Shows how the Malaysian federal government budgets and spends public money. Every figure on the site links to the page of the official document it came from, and every total the source document prints is recomputed from the extracted line items before a load is accepted.

Research behind the design: [`specs/`](specs/). Build Canada's repos, cloned for reference only, live in the git-ignored `reference/` folder.

## First source

JANM, *Penyata Kewangan Kerajaan Persekutuan* (Federal Government Financial Statements), Lampiran 1: *Penyata Perbelanjaan Mengurus* (operating expenditure). It is audited by the National Audit Department and gives, for every vote → programme → activity → object group, the original estimate (Asal), supplementary (Tambahan/(Kurangan)), virement (Viremen), revised total (Jumlah) and actual spending (Sebenar).

FY2025: <https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2025_Penyata_Kewangan_Kerajaan_Persekutuan.pdf>, Lampiran 1 on PDF pages 103–212.

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

## Local development

```bash
createdb buildmalaysia
psql -d buildmalaysia -f supabase/migrations/*.sql
```

Deploying to Supabase: `supabase link` then `supabase db push`.
