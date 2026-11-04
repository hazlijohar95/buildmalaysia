# pipeline

Fetches the JANM federal financial statements, parses Lampiran 1 (*Penyata Perbelanjaan Mengurus*, operating expenditure budget against actual) and Lampiran 2 (*Penyata Perbelanjaan Pembangunan*, development expenditure by project), and loads both into Postgres. A load commits only when every total printed in the document equals the sum of the rows under it, as computed by the `reconciliation` and `development_reconciliation` views in `supabase/migrations/`.

## Requirements

- Python 3.12 and [uv](https://docs.astral.sh/uv/).
- Poppler (`pdftotext`, `pdfinfo`) on `PATH`.
- A Postgres database with the schema in `supabase/migrations/` applied.

## Run

```bash
cd pipeline
uv sync
uv run python -m pipeline ingest --year 2025 --database-url postgresql:///buildmalaysia_pipeline
```

The command:

1. Uses `data/raw/janm/2025.pdf`, or downloads it from the URL in `src/pipeline/sources.py` if it is absent. It stops if the file's SHA-256 differs from the pinned hash. A download goes to a `.part` file and is renamed only after the hash matches.
2. Extracts the Lampiran 1 and Lampiran 2 page ranges registered in `src/pipeline/sources.py` (FY2021-FY2025), both in Bahasa Malaysia, with `pdftotext`.
3. Parses them into the typed model in `src/pipeline/model.py`. Any line it cannot place stops the run with the PDF page and line number.
4. In one transaction, it upserts `source_document`, deletes this document's rows and the fiscal year's hierarchies, inserts the new rows, and reads both reconciliation views. It commits only when every row of both matches. Otherwise it rolls back and prints every mismatch. Re-running converges to the same rows.

Options: `--raw-dir` sets where source PDFs are kept (default `<repo>/data/raw`). `retrieved_at` is the local file's modification time.

## Test

```bash
uv run pytest
```

`tests/test_ingest.py` loads the full FY2025 statement into `PIPELINE_DATABASE_URL` (default `postgresql:///buildmalaysia_pipeline`) and replaces that document's rows there. It also proves the gate for both statements: a copy with one operating leaf's actual changed by one sen is rejected with exactly the nine totals above that leaf, a copy with one development project's total cost changed by one sen is rejected with exactly its vote and statement totals, and the stored rows are unchanged.

The parser fixtures in `tests/fixtures/` are lines copied verbatim from the PDF. `uv run python tests/fixtures/build.py` rebuilds them and names the page and line of each.

## Why `pdftotext -layout`

The 2025 PDF has a clean text layer. `-layout` keeps each table row on one text line with the seven numeric columns in order, so a line is the unit of both parsing and citation (`source_text`). pdfplumber would add a dependency and a word-clustering step for no gain. Column positions matter only for the four rows with an empty cell, and `-layout` keeps character columns aligned well enough for that. The exception is the `Nota:` block, where `-layout` overlaps two notes; that one block is read from `pdftotext -raw`.

## How the parser works

`src/pipeline/parse.py` holds a pure function `parse_statement(pages, fiscal_year)`.

- A line that ends in seven numeric tokens is a row. Its label is matched against `ROW_KINDS`: leaf (`10000 Emolumen`), activity total, programme total, per-object total, vote, section or statement total, or bare amounts (the middle line of a wrapped vote total). Any other line is matched against `TEXT_KINDS`: section, vote, programme or activity header, the first half of a wrapped `JUMLAH`, page furniture, or a continuation of the label above.
- A state machine (`TRANSITIONS`) tracks the open section, vote, programme and activity, and one pending label that may wrap. It decides what a `Jumlah Emolumen` line totals (vote, section or statement) from what closed last. A header marked `– (SAMB.)` must repeat the open one exactly.
- Every row is checked as it is read: Asal + Tambahan + Viremen = Jumlah, Jumlah − Sebenar = Varian, and % Prestasi follows the convention below. `–` is zero and `(x)` is negative. Amounts are integer sen.
- A vote total's label, joined across its wrapped lines, must equal `JUMLAH` plus the vote name. Duplicate votes, programmes, activities and (vote, activity, object) leaves are errors.
- A footnote marker (`*`) on a total is resolved against the `Nota:` text and stored in `printed_total.footnote`. A marker on a leaf is an error, because `operating_line` has no column for it.

## Lampiran 3 (COVID-19 Fund, FY2020-2023)

`src/pipeline/covid.py` holds `parse_covid(pages, fiscal_year, columns)`. One two-page spread lists the fund's programmes and a grand total (`Jumlah Keseluruhan`). The columns differ by year, so each source names its left- and right-page columns in `covid_columns`. Each row must satisfy allocation + supplementary + virement = revised, revised − actual = variance, and spent before the year + actual = spent to date, which proves the column naming. The `covid_fund_reconciliation` view checks the grand total in all eight stored columns. % Prestasi is not stored; FY2021 prints one row's percentage on the line below it, and that line is skipped.

## Known misprints

A printed total that disagrees with its own rows in the published PDF is registered in `sources.py` as a `KnownMisprint` with its evidence. The load accepts exactly that mismatch (same total, same difference in sen), fails if it no longer occurs, and leaves it visible in the reconciliation view. FY2021: programme B.24 060000 prints Sebenar 6,293,310.19; its only activity and its per-object lines sum to 7,293,310.19, and the vote total agrees with the rows (PDF p142).

## Lampiran 2 (development expenditure)

`src/pipeline/development.py` holds `parse_development(pages, fiscal_year)`. The statement is printed in two-page spreads. The left page carries each row's label with two amounts (Kos Keseluruhan; RMKe-12 spending to the end of the prior year). The right page carries the same row's seven amounts (estimate and actual, each as Cara Langsung, Pinjaman and Jumlah; RMKe-12 spending to date). Rows without amounts on the left (vote headers, agency headings, wrapped names) have no row on the right, so the n-th left row with amounts pairs with the n-th right row, and each spread must pair exactly.

Every row is checked as it is read: direct + loan = total for estimate and for actual, and prior plan spending + the year's actual = plan spending to date. The last check spans both pages, so a misaligned pair fails it.

Projects sit under agency headings in capitals (`MAJLIS AMANAH RAKYAT (MARA)`), each closed by `Jumlah <name>`. A capitalised line inside an open group continues the project above it (`MASMA` under 15200). Projects printed after a vote's groups, with no heading, belong to the vote only. Footnote marks (`*03400`) resolve against the `Nota: *P.06 – Butiran 03400 - …` lines and are stored in `development_project.footnote`; every note must be used.

| Rule | What it does | FY2025 occurrences (PDF page / book page) |
|---|---|---|
| `VOTE_NAMED_GROUP` | `Jumlah <name>` with no group open totals the projects printed under the vote header before the first heading. The name is the vote's, or an abbreviation (`Jumlah MITI`, `Jumlah MED` in FY2023). | p226/212 (P.24, 10 projects), p228/214 (P.26, 8 projects) |
| `PARENT_GROUP_BY_NAME` | `Jumlah <stem> <A>, <B> dan <C>` with no group open totals the run of groups just closed whose names contain the stem and one of A, B, C. Those groups get it as their parent. | p224/210 (P.23 three forestry departments), p230/216 (P.27 JKR roads in Semenanjung, Sabah, Sarawak) |
| `GROUP_TOTAL_NAME_DIFFERS` | A group total whose name differs from its heading still closes the open group, and the difference is logged. | FY2025 p230/216 (`Suruhunjaya` for `SURUHANJAYA KOPERASI MALAYSIA (SKM)`); FY2023 uses abbreviations (`Jumlah MARA`, `Jumlah KEMAS`, `Jumlah MIDA`, …) |
| `DUPLICATED_WORD_COLLAPSED` | A project name with a word repeated straight after itself, from overlapping text in the PDF, keeps one copy. | p242/228 (P.47 31000, `Projek Jalur Lebar Berkelajuan Tinggi`) |
| `HEADING_MISSING` | Like `VOTE_NAMED_GROUP`, but the run of unheaded projects follows another group's total. | FY2023 p214/202 (P.28 `Jumlah Projek Pengangkutan Jalan`, 5 projects) |
| `DOUBLED_TEXT_LAYER` | A label whose `pdftotext -raw` text holds the name twice, once in capitals the page does not draw. The copy not in capitals is kept. Checked against the rendered page. | FY2023 p210, FY2024 p220 (P.24 00601 `Dana Pembangunan & Pembiayaan PKS`) |
| `BLANK_CELL_READ_AS_ZERO` (right page) | A right-page row with one or two of seven cells empty; amounts are placed by column right edges against the nearest complete row, and the empty columns read as zero. | FY2024 p219 (P.23 16900); FY2022 p223 |
| Plan columns | The left page's plan column and the right page's can name different Malaysia Plans (FY2021: RMKe-11 to 2020, RMKe-12 to 2021). Both are stored in `development_statement`; in a plan's first year the row check is actual = spent to date. | FY2021 |
| Capitalised group totals | `JUMLAH <name>` naming the open group closes the group, not the vote. | FY2021 P.63 |
| `NOTE_CODE_SUFFIX_IGNORED` | A note naming `Butiran 81000P`; the trailing `P` is ignored. | FY2023 p212 (P.27) |

The reconciliation view checks every group, parent group, vote and statement total in all nine columns, so a grouping rule that took the wrong projects fails the load.

### % Prestasi convention

Observed on every one of the 4,783 rows in FY2025: Sebenar / Jumlah × 100 rounded half up to 2 decimal places, except that a row not fully spent never shows 100.00. It shows 99.99 instead (for example p105, Emolumen 7,601,986.15 / 7,602,000 = 99.9998%, printed 99.99). Zero prints as `–`. A row with Jumlah 0 must have Sebenar 0.

## Named rules

Each rule reads the source other than literally in one narrow case. Each application is listed in `Statement.corrections` and printed by `ingest`. The reconciliation gate still covers every value a rule produces.

| Rule | What it does | FY2025 occurrences (PDF page / book page) |
|---|---|---|
| `BLANK_CELL_READ_AS_ZERO` | A row printed with six of seven values. Each value is placed by its right edge against the nearest complete row on the same page; exactly one amount column must be left empty, and it reads as zero. | p108/94 (T.12 010500 40000, Tambahan), p142/128 (B.13 050300 40000, Viremen), p165/151 (B.27 031100 30000, Tambahan), p168/154 (B.28 020400 30000, Tambahan) |
| `ACTIVITY_CODE_LEADING_ZERO_DROPPED` | An activity header printed with five digits (`20600 Standard Malaysia`). Read as `020600`; the activity total that closes it must print the 6-digit code. | p156/142 (B.24 020600), p158/144 (B.24 050200) |
| `OBJECT_CODE_EXTRA_LEADING_ZERO` | A leaf printed as `010000 Emolumen`. Read as object `10000`; the label must be that object group's name. | p130/116 (B.09 050100) |
| `STRAY_BACKTICK_IGNORED` | A `` ` `` at the start of a line in the text layer that the rendered page does not show. Dropped. | p151/137, three leaves of B.22 |
| `PRINTER_SLUG` (page furniture) | An InDesign file name and print time (`WJD25-0381 Teks 5 Lampiran BM.indd 87 19/09/2025 11:32 AM`) outside the drawn page. Ignored. | FY2024 pages |
| `SPLIT_ROW_JOINED`, `STRAY_DASH_DROPPED` | A row whose text layer breaks after a few amounts and continues on the next line with no label. The amounts are joined; if that gives eight tokens with exactly one `–`, the dash (not drawn on the page) is dropped, and only if the seven left pass every row check. | FY2024 p106/92 (T.12 030000 Pemberian dan Kenaan Bayaran Tetap) |
| `PROGRAMME_HEADING_MISSING` | An activity straight after a programme total, under a programme whose heading is not printed, opens that programme from its code; the name is taken from its `(SAMB.)` heading on the next page. | FY2022 p144 (B.24 020000), checked on the rendered page |
| `STALE_HEADING_IGNORED` | A `(SAMB.)` heading in the text layer for a programme already closed, which the page does not draw. | FY2021 p142 (B.24 030000), checked on the rendered page |
| `SAMB_NAME_DIFFERS` | A `(SAMB.)` heading with the open item's code but a shorter name continues it. | FY2021 p164 (B.33 020000) |
| `VOTE_TOTAL_NAME_DIFFERS` | A vote total whose name differs from the vote heading closes the open vote. | FY2022 B.64 (`PENGAJIAN` / `PENDIDIKAN TINGGI`); FY2022 P.24 (`(MITI)`) |
| Continued marker in the Varian column | `(disambung...)` is removed before splitting, so a Varian pushed to the next line rejoins its row by column position. | FY2021 p111 |
| Repeated vote heading | The open vote's heading repeated at a page top without `(SAMB.)` continues it. | FY2021 |
| `PRINTED_PERCENT_DIFFERS` | A printed % Prestasi that disagrees with its own row (`–` for 100.00; 99.99 for 99.33). Logged; the site computes the percentage. | FY2024 p129, p177 (×2); FY2023 p132, p152 |
| `ACTIVITY_TOTAL_CODE_MISPRINTED` | An activity total whose code differs from the open activity (`Jumlah 050700` closing 050600, `Jumlah 048000` closing 040800, `Jumlah 0060700`). It closes the open activity. A missed header cannot hide here: its leaves would follow a closed activity, which the parser rejects. | FY2023 p142, p173, p184, p190 |
| Activity notes | A `*` on an activity header (`*010100 Pengurusan`) with a note `*B04 - Program/Aktiviti - 010100 - …` (FY2023) or `Nota : (*) B04 - …` (FY2024). The note is stored on that activity's printed total. | FY2023, FY2024 (B.04) |

Each occurrence was checked against the rendered page with `pdftoppm`.

## Footnotes

- `(*) Termasuk pindahan ke Kumpulan Wang Pembangunan sebanyak RM5,293,447,361.93` marks the statement-level Sebenar for Pemberian & Kenaan Bayaran Tetap (p211). The transfer is a leaf, B.12 activity 050100 object 40000 on PDF page 138 / book page 124 (Jumlah RM100, Sebenar RM5,293,447,361.93), so the total reconciles without any special rule.
- `(**) Tidak termasuk pindahan ke Kumpulan Wang Pembangunan.` is in the text layer of p211 but does not appear on the rendered page, and no line in Lampiran 1 (BM) carries `**`. It is reported as an unreferenced note and stored nowhere.
