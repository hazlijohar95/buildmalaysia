# pipeline

Fetches the JANM federal financial statements, parses Lampiran 1 (*Penyata Perbelanjaan Mengurus*, operating expenditure budget against actual) and Lampiran 2 (*Penyata Perbelanjaan Pembangunan*, development expenditure by project), Lampiran 3 (COVID-19 Fund, where printed) and Note 5(a) (*Hasil mengikut penjenisan*, revenue by type), and loads them into Postgres. A load commits only when every total printed in the document equals the sum of the rows under it, as computed by the `reconciliation`, `development_reconciliation`, `covid_fund_reconciliation` and `revenue_reconciliation` views in `supabase/migrations/`, and revenue balances operating spending (`revenue_operating_balance`).

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
2. Extracts the Lampiran 1, Lampiran 2, Lampiran 3 and Note 5(a) page ranges registered in `src/pipeline/sources.py` (FY2018 and FY2021-FY2025), all in Bahasa Malaysia, with `pdftotext`.
3. Parses them into the typed model in `src/pipeline/model.py`. Any line it cannot place stops the run with the PDF page and line number.
4. In one transaction, it upserts `source_document`, deletes this document's rows and the fiscal year's hierarchies, inserts the new rows, and reads the reconciliation views. It commits only when every row matches. Otherwise it rolls back and prints every mismatch. Re-running converges to the same rows.

Options: `--raw-dir` sets where source PDFs are kept (default `<repo>/data/raw`). `retrieved_at` is the local file's modification time.

## Test

```bash
uv run pytest
```

`tests/test_ingest.py` loads the full FY2025 statement, with its Note 5(a) revenue table, into `PIPELINE_DATABASE_URL` (default `postgresql:///buildmalaysia_pipeline`) and replaces that document's rows there. It also proves the gate for both statements: a copy with one operating leaf's actual changed by one sen is rejected with exactly the nine totals above that leaf, a copy with one development project's total cost changed by one sen is rejected with exactly its vote and statement totals, and the stored rows are unchanged. A revenue item edited by one ringgit is rejected with exactly its three category totals, and HASIL edited by one ringgit is rejected by both its reconciliation and the balance with Lampiran 1.

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

## Note 5(a) (revenue by type)

`src/pipeline/revenue.py` holds `parse_revenue(pages, fiscal_year)`. Note 5, *Akaun Hasil Disatukan*, prints *Hasil mengikut penjenisan* over two pages (`SourceDocument.revenue_pages`: FY2018 PDF pp. 64-65, FY2021 pp. 73-74, FY2022 81-82, FY2023 79-80, FY2024 83-84, FY2025 89-90). The table starts after the line `Hasil mengikut penjenisan bagi tahun berakhir 31 Disember YYYY adalah seperti berikut:`, breaks at `(disambung)`, resumes after `(sambungan)` and ends at `(b) Perbelanjaan Mengurus`. Each of those markers must occur exactly once on its page.

- Each row ends in six columns: Anggaran Asal, Anggaran Disemak, Sebenar and % Anggaran for the year, Sebenar and % Anggaran for the year before. The four amounts must be whole ringgit (stored as sen) and the two percentages must carry two decimals; `-` is zero. % Anggaran is not stored or checked, because the note divides by Anggaran Asal where Anggaran Disemak is zero in some rows (FY2021 Terimaan Pelarasan) and prints `-` in others (FY2023 Sumbangan dan Bayaran Ganti).
- A line without amounts continues the name of the row above it, only if it is indented past that row's name (`Duti Eksais Terhadap Barangan` / `Tempatan`). Any other text line is a ParseError, so a name printed above its amounts cannot be glued to the wrong row.
- Column-header lines (`Anggaran`, `Asal`, `Disemak`, `Sebenar`, `RM`, `%`, years) are allowed only above a page's first row, and their years must be the fiscal year or the one before.
- A row whose full name is in `revenue.CATEGORIES` is a category's printed total: `HASIL` (revenue), `HASIL CUKAI` (tax), `Cukai Langsung` (direct_tax), `Cukai Tidak Langsung` (indirect_tax; FY2021 prints `Cukai Tak Langsung`), `HASIL BUKAN CUKAI` (non_tax), `TERIMAAN BUKAN HASIL` (non_revenue_receipts), `HASIL WILAYAH PERSEKUTUAN` (federal_territory). Names are matched case-sensitively, so the item `Hasil Bukan Cukai Wilayah Persekutuan` is not the category. Every category must be printed once, inside its parent. Any other row is an item of the innermost open category, which must be one with no sub-categories.

`revenue_reconciliation` recomputes all seven category totals from the items below them, in all four columns, and `revenue_operating_balance` compares HASIL's Sebenar with Lampiran 1's statement total. The Consolidated Revenue Account balances because the year's surplus is transferred to the Development Fund as a Lampiran 1 line. The note prints whole ringgit, so the two may differ by up to 50 sen. `load_year` rolls back unless both views match.

| Year | Items | HASIL Sebenar (RM) | Lampiran 1 total (RM) | Difference |
|---|---|---|---|---|
| 2018 | 26 | 232,882,562,288 | 232,882,562,287.80 | +20 sen |
| 2021 | 27 | 233,752,055,029 | 233,752,055,029.13 | -13 sen |
| 2022 | 25 | 294,356,760,615 | 294,356,760,614.97 | +3 sen |
| 2023 | 25 | 314,959,481,731 | 314,959,481,731.21 | -21 sen |
| 2024 | 25 | 324,617,649,248 | 324,617,649,248.33 | -33 sen |
| 2025 | 25 | 336,069,262,969 | 336,069,262,968.50 | +50 sen |

FY2021 also lists the two GST items (`Cukai Barangan dan Perkhidmatan Import` and `Tempatan`), printed as dashes and stored as zero. Item names change between years, so nothing joins items across years by name. The renames are `Duti Eksais` (to FY2023) to `Duti Eksais Terhadap Barangan Tempatan` (FY2024), and three non-tax names in FY2022, including `Faedah dan Perolehan daripada Pelaburan` to `... Pinjaman Persekutuan dan Terbitan Instrumen Kewangan Kerajaan`.

## Lampiran 3 (COVID-19 Fund, FY2020-2023)

`src/pipeline/covid.py` holds `parse_covid(pages, fiscal_year, columns)`. One two-page spread lists the fund's programmes and a grand total (`Jumlah Keseluruhan`). The columns differ by year, so each source names its left- and right-page columns in `covid_columns`. Each row must satisfy allocation + supplementary + virement = revised, revised − actual = variance, and spent before the year + actual = spent to date, which proves the column naming. The `covid_fund_reconciliation` view checks the grand total in all eight stored columns. % Prestasi is not stored; FY2021 prints one row's percentage on the line below it, and that line is skipped.

## MOF budget books (Budget 2025, 2026, 2027)

```bash
uv run python -m pipeline ingest-budget --year 2027 --database-url postgresql:///buildmalaysia_pipeline
```

One document, `BUDGET_SOURCES` in `sources.py`, three parsers, one transaction:

- `budget.py`: the vote summary (book pp. 21-33): every vote's 2024 and 2025 actuals, 2026 original estimate and 2027 estimate, with its parts (emoluments and other; or direct and loan). Every printed total is checked as it is read: parts against the vote, agency blocks, ministry groups (a capitals heading starts a ministry, a title-case heading an agency within it), the charged-votes summary and the grand summary.
- `budget_detail.py`: each operating vote's object-group summary and its programme -> activity -> object-group table with 2026 and 2027 estimates and posts; for B/P ministries also the development object-group table and the RINGKASAN tying the two. Wrapped names may share a line with an object row or follow it. `budget_operating_reconciliation` recomputes every printed total from the activity lines (posts only where printed) and `budget_vote_consistency` checks each vote against the summary pages; the load rolls back otherwise.
- `budget_development.py`: each P vote's projects, with group headings and Jumlah lines, and Lampiran D, the development appendix, which every vote table must match. `budget_development_reconciliation` and `budget_development_consistency` gate the load the same way. P.70's own table prints the contingency as direct spending while Lampiran D and the summary keep it apart, so only its total is compared.

- `budget_word.py`: the summary pages of Word-typeset books (Budget 2025, `layout="word"`): vote code and name first, a Mengurus total for B votes only (a T vote's total is its block's Jumlah), parts that are zero may be left out, "Jumlah .." closes a block and "Jumlah <ministry>" the ministry, and footnote marks may sit on a heading, a vote line or a wrapped vote name. Leader dots ("... ...") are stripped throughout. Small votes print their object-group summary at the top of the detail page; a few pages lack a printed page number and take it from the book's page offset.
- Known misprints (`BudgetSource.known_misprints`, label -> exact difference) are accepted only as registered and fail the parse if they disappear: Budget 2025 has four (see `specs/external-checks.md`).
- `budget_development.parse_dropped_projects`: Lampiran F, the current year's projects the budget drops. Its JUMLAH must equal the printed rows; a project printed more than once with identical figures (Budget 2026: P.24 00200) is stored once with `printed_times`; and no dropped project may appear in the book's project tables.

Budget 2026 rounds each summary figure on its own, so in the two actual columns a total may differ from the sum of its n printed parts by up to 50 sen x (n + 1) (logged as ROUNDED_INDEPENDENTLY); grand-summary lines are checked against the vote figures they total. Estimates must add exactly. Heading footnotes on ministry renames and mergers are stored in `budget_vote_figure.note`. `budget_original_check` compares a book's original estimate for the current year with the statement's Asal per operating vote (Budget 2026: 53 of 53 equal for 2025).

`budget_actual_check` compares the summary's actuals with the audited statements and is reported, not gated: 272 of 272 figures agree, within RM1.45. Activity codes are reused for different activities across years, so nothing joins activities between documents by code.

## Known misprints

A printed total that disagrees with its own rows in the published PDF is registered in `sources.py` as a `KnownMisprint` with its evidence. The load accepts exactly that mismatch (same total, same difference in sen), fails if it no longer occurs, and leaves it visible in the reconciliation view. Each was found by re-adding the printed lines and checked on the rendered page.

- FY2021: programme B.24 060000 prints Sebenar 6,293,310.19; its only activity and its per-object lines sum to 7,293,310.19, and the vote total agrees with the rows (PDF p142).
- FY2018 (18 totals):
  - B.09 programme 030000's per-object line for 40000 prints Dipinda 5,537,000; its two leaves print 331,687 and 52,713. The programme total equals its activities (PDF p107).
  - B.28 activity 050300's only leaf is 30000 Aset, Dipinda 280,000, Amaun 102,863.15. Every object total above it (programme 050000, vote B.28, supply section, statement) counts the 280,000 under 20000 and the 102,863.15 under 30000: eight totals, ±RM280,000 in Dipinda (PDF p157, p216).
  - B.63 programmes 080000, 090000, 100000 and 110000 all print the same per-object Dipinda for 10000 (41,140,500) and 20000 (31,402,870), whatever their leaves: eight totals. The programme totals and B.63's object totals agree with the leaves (PDF p212-213).
  - Lampiran 2, P.23 'Jumlah FRIM': its left page (Kos Keseluruhan, RMKe-11 to 2017) sums its three projects, its right page (Anggaran, Sebenar) sums them plus the eight unheaded projects printed above its heading, 06400-07800 (PDF p228-229).

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

## FY2016-2019 statements

The FY2016-2019 statements are InDesign files laid out differently from FY2021 on. FY2018 is loaded. FY2019 is not: its PDF skips a page of Lampiran 1. PDF p89 (book p.77) ends inside B.05 programme 030000 after "Jumlah 030100" and "(disambung...)"; p90 (book p.78) opens "B.06 JABATAN PERDANA MENTERI – (SAMB.)" and programme 010000 "(SAMB.)" at activity 010600. B.05's 030000 programme total and vote total, and B.06's activities 010100-010500, are not in the file (the hidden appendix counter jumps from 41 to 43). The English section (p335) has only vote totals, so B.05 and B.06 cannot be reconciled and the year cannot load.

- **Four columns.** Lampiran 1 prints Anggaran Asal, Anggaran Dipinda (the revised estimate), Sebenar Amaun and % (`parse_statement(..., columns=4)`, `SourceDocument.operating_columns`). Tambahan/(Kurangan) and Viremen are not printed, so they are stored as null (migration `20261104140000_four_column_statements.sql`; the `reconciliation` view compares null-safely). The only row check is % = Amaun / Dipinda (the convention above), so columns are proven by the reconciliation views, which check Asal, Dipinda and Amaun against every printed total.
- **Side tab.** The book page and "LAMPIRAN 1 - PERBELANJAAN MENGURUS" are printed in a tab at the page edge, level with table rows, and `-layout` interleaves the tab's text with those rows (FY2018 p85 breaks two rows into one column per line). Lampiran 1 and 2 are therefore read with `pdftotext -x 78 -W 500` (`SourceDocument.crop`); every table word lies inside x 83-575 on every page of these years. Note 5(a) is read whole, and a line holding only the page's book number is skipped.
- **Book pages.** The running head has no page number. The page carries the book page and the appendix's own counter (not drawn), so the book page is read from the printer slug (`... BM.indd 68 02/10/2019 ...`) and must also start a line of the page's `-raw` text; the offset from the PDF page must stay constant (`parse.slug_book_page`).
- **Page furniture.** `PENYATA KEWANGAN KERAJAAN PERSEKUTUAN` (with `[2O18]`), `$10 Excellent Accounting @ Your Service`, the tab's words and bare page numbers inside the table area are ignored. FY2016-2018 text layers end column heads, `(disambung...)` and other lines with a `!` the pages do not draw: a trailing `!` is dropped in Lampiran 1 (one anywhere else in a line stops the parse), and every `!` is blanked in Lampiran 2, where they also sit inside note lines (`Nota: !*P.06–`).
- **Lampiran 2 notes** are read from `-raw` text, which keeps each note on one line; `-layout` scatters them (FY2018 p236).

| Rule | What it does | FY2018 occurrences (PDF page) |
|---|---|---|
| `BLANK_CELL_READ_AS_ZERO` (four columns) | As above, for Asal, Dipinda or Amaun; % is never blank. | p113, p115 (Amaun) |
| `BLANK_CELL_READ_AS_ZERO` (Lampiran 2 left page) | A left-page row with one of its two amounts, placed by its right edge against the nearest complete row (within 2 characters); the empty cell reads as zero. | p220 (P.06 95000, no Kos Keseluruhan) |
| `SPLIT_ROW_JOINED` (four columns) | As above: an activity total whose % sits on the next line. | p147 (×6) |
| `STRAY_GLYPH_IGNORED` | A lone lowercase letter after a row's last amount, or on a line of its own, that the page does not draw. | p141 ("99.94 b", "u") |
| `SAMB_HEADING_OPENS` | A programme heading marked "(SAMB.)" for a programme never opened, straight after the previous programme's total, opens it. | p168 (B.32 040000; p167 ends with "Jumlah 030000") |
| `PROGRAMME_TOTAL_CODE_MISPRINTED` | Like `ACTIVITY_TOTAL_CODE_MISPRINTED`, for a programme total. A missed programme header cannot hide here: its activities would fail the code-prefix check. | p213 ("Jumlah 100000" closes B.63 110000) |
| Activity notes (FY2018) | A note may wrap onto the next line, name several activities (`120100, 130300 dan 130600`; a code named twice is logged as `NOTE_CODE_REPEATED`), or start "– Program/Aktiviti - 050600 -" under the previous note's vote. | p92, p97, p119, p198-202 |
| `HEADING_WITHOUT_TOTAL` | A heading still open when its vote's total is printed, or followed after a blank line by another heading with no project between, is a caption: it is dropped and its projects belong to the vote only. | p220 (P.10 "PERBADANAN KEMAJUAN NEGERI"), p228 (P.22 "MAJLIS AMANAH RAKYAT (MARA)" reprinted over SLDB, LKTS, ...), p248 (P.60 "PENGURUSAN DASAR DALAM NEGERI") |
| `SUBHEADING_NOT_TOTALLED` | Inside an open group, a heading that extends the group's own heading, or one set off by a blank line after projects. Its projects stay in the open group, whose total covers them. | p220 (P.10 "KASTAM DIRAJA MALAYSIA"), p236 (P.28 "PROJEK KTMB", "PENGANGKUTAN DARAT SEMENANJUNG") |
| `TITLE_CASE_HEADING` | A line in title case with no project above it and no group open cannot continue a name; it opens a group. | p242 (P.43 "Kerajaan Tempatan", ...), p246-250 (P.60, P.62) |
| `OWN_PROJECTS_TOTAL_IN_CAPITALS` | "JUMLAH <vote name>" under the ministry's own projects, followed by a heading of the same vote, totals those projects; the vote's total is the second such line. | p232 (P.24) |
| `DUPLICATE_PROJECT_CODE` | Two different projects printed with one code, in different groups under different names, are both stored (`development_project` is keyed by code and citation, migration `20261104150000`). If both carry a note mark the note is ambiguous and the parse fails. | p224 (P.21 90700), p248/p250 (P.62 16000) |
| `DOUBLED_TEXT_LAYER` (Note 5(a)) | A wrapped word held twice in the text layer a few points apart; the page draws the second, indented copy. The first is dropped. | p65 ("Kerajaan", "Wilayah", "Persekutuan") |

## Footnotes

- `(*) Termasuk pindahan ke Kumpulan Wang Pembangunan sebanyak RM5,293,447,361.93` marks the statement-level Sebenar for Pemberian & Kenaan Bayaran Tetap (p211). The transfer is a leaf, B.12 activity 050100 object 40000 on PDF page 138 / book page 124 (Jumlah RM100, Sebenar RM5,293,447,361.93), so the total reconciles without any special rule.
- `(**) Tidak termasuk pindahan ke Kumpulan Wang Pembangunan.` is in the text layer of p211 but does not appear on the rendered page, and no line in Lampiran 1 (BM) carries `**`. It is reported as an unreferenced note and stored nowhere.
