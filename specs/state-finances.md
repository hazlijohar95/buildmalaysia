# State finances

Status: four statements loaded (Melaka 2023, Perak 2024, Sabah 2024, Terengganu 2024), 13 Nov 2026. The registry is
`pipeline/src/pipeline/state_sources.py`; the parser `pipeline/src/pipeline/state.py`; the load
`pipeline/src/pipeline/state_load.py`; the schema `supabase/migrations/20261112000000_state_finances.sql`.

## What is read

Each state publishes its own audited _Penyata Kewangan Kerajaan Negeri_. Every state prints the same two notes to it,
each laid out by its own designer:

- _Hasil mengikut penjenisannya_ (revenue by type): Hasil Cukai, Hasil Bukan Cukai and Terimaan Bukan Hasil, each a
  list of items with a "Jumlah ..." total, then JUMLAH HASIL. Columns: original estimate, revised estimate, actual, a
  percentage, the year before's actual and its percentage.
- _Perbelanjaan Mengurus mengikut Maksud Perbelanjaan_ (operating expenditure by vote): the Tanggungan (charged) votes
  and the Bekalan or Perbekalan (supply) votes, each with its total, then the statement's total. Columns: original,
  revised, actual and a percentage.

Development spending (each state's Lampiran 2 equivalent) and the statement of financial position are not read yet.
The site says so on `/states` and on each state's page.

## How a table is read

The words each page draws are read with `pdftotext -bbox`, not `-layout`: a name wrapped over two or three lines sits
level with, above or below its row's amounts depending on the state, and only its position on the page places it.
Words are grouped into lines by height; a line with amounts is a row, and every other line of the table is a heading,
a column header or part of a row's name.

A `TableSpec` per note describes its layout: its pages, the line it starts below and the line it ends on, where the
amounts begin (`amount_x`), where a wrapped name sits (`wrap`: `middle`, `bottom` or `coded_top`), the vote code
pattern, the heading and total spellings, running heads to skip, and the rows that move money to the Development Fund.

A name the rules place wrongly is fixed by a `RowName` that names the printed text it replaces (Perak 2024 p32), so a
parser change cannot leave it stale.

## Reconciliation

`ingest-state` loads one statement in a transaction that commits only if `state_reconciliation` recomputes every
printed total from its rows. The Development Fund transfer is printed differently by each state, and the total's
`scope` records how:

| State      | Operating total as printed                                        | Scope                                  |
| ---------- | ----------------------------------------------------------------- | -------------------------------------- |
| Melaka     | Before and after the transfer; the votes (B09) exclude it         | `statement`, `statement_plus_transfer` |
| Perak      | Before and after the contribution (caruman); the votes include it | `statement_less_transfer`, `statement` |
| Terengganu | Before and after the contribution; the votes include it           | `statement_less_transfer`, `statement` |
| Sabah      | One total for Tanggungan and Perbekalan                           | `statement`                            |

One printed total disagrees with its own rows, and is registered as a `StateMisprint`: Sabah 2024's Note 10 (pdf p43)
prints Perbekalan's revised estimate as 6,467,330,663.00 where its votes sum to 6,467,330,673.00, RM10 less. The total
for Tanggungan and Perbekalan below it, and Penyata C2's JUMLAH KESELURUHAN (pdf p73), both agree with the votes. The
load accepts exactly that difference and fails if it disappears.

## Survey of the 13 states

Searched on each state's treasury site, November 2026. The reasons the site shows are `STATE_GAPS`.

| State           | Loaded | Published online                                                           | Why not loaded                                                                  |
| --------------- | ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Johor           | –      | No; the treasury lists only the circulars on preparing them                | Not published                                                                   |
| Kedah           | –      | Not found; pkpk.kedah.gov.my returned server errors                        | Not found                                                                       |
| Kelantan        | –      | Annual reports to 2018 only                                                | Not published                                                                   |
| Melaka          | 2023   | 2018 to 2023                                                               | 2024 not yet online                                                             |
| Negeri Sembilan | –      | 2024                                                                       | Each note is drawn twice, overlapping at two sizes                              |
| Pahang          | –      | Budget books only                                                          | Not published                                                                   |
| Perak           | 2024   | 2024                                                                       |                                                                                 |
| Perlis          | –      | 2006 to 2016 only                                                          | Nothing recent                                                                  |
| Pulau Pinang    | –      | 2015 to 2024                                                               | 2023 and 2024 are scanned pages with no text layer; needs OCR checked to totals |
| Sabah           | 2024   | 2024, on Google Drive, linked from jbns.sabah.gov.my                       |                                                                                 |
| Sarawak         | –      | Not found; tabled in the state assembly                                    | Not found                                                                       |
| Selangor        | –      | 2024 on pwn.selangor.gov.my (114 pages; the notes, pdf pp50–53, have text) | Its table layout is not registered yet                                          |
| Terengganu      | 2024   | 2024                                                                       |                                                                                 |

The Auditor-General's report on each state (Laporan Ketua Audit Negara, LKAN Negeri) reprints the audited statements,
so it is a route to every state. The one checked (Kedah, LKAN 3/2025) reprints them as page images with no text layer,
and lkan.audit.gov.my refused connections during the survey. data.gov.my's `state_finance_revenue` and
`state_finance_expenditure` cover all 13 states from that source, but only for 2020–2022 and only by object group.

## Next

1. Selangor 2024: register its two notes (pdf pp50–53). Its summary on p49 prints the operating total before and after
   the transfer to the Development Fund and Forest Fund.
2. Pulau Pinang 2024: OCR, checked against every printed total, as FY2020's federal Lampiran 1 is.
3. Development spending for the loaded states.
