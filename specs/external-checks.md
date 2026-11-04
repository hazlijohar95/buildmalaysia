# External checks

Independent figures used to confirm totals extracted from source documents.

## FY2025 operating expenditure: JANM Lampiran 1 vs data.gov.my

data.gov.my datasets `federal_finance_year` and `federal_finance_year_oe` (CC BY 4.0, RM million, fetched 2026-11-04 from `https://api.data.gov.my/data-catalogue?id=<id>&date_start=2025-01-01@date`).

| Item | JANM Lampiran 1 (book p.197, appendix p.129, PDF p.211) | data.gov.my | Result |
|---|---|---|---|
| Total operating expenditure, actual | RM336,069,262,968.50 | 330,776 (`spending_oe` / `total`) | Differs by RM5,293.4m. See below. |
| Total less transfer to Development Fund | 336,069,262,968.50 − 5,293,447,361.93 = RM330,775,815,606.57 | 330,776 | Match after rounding |
| Emoluments | RM101,451,345,014.71 | 101,451 | Match |
| Supplies and services | RM42,174,005,391.28 | 42,174 | Match |
| Assets | RM1,281,216,588.64 | 1,281 | Match |
| Other expenditure | RM787,927,170.13 | 788 | Match |

The RM5,293,447,361.93 gap is the transfer to the Development Fund (*pindahan ke Kumpulan Wang Pembangunan*). Lampiran 1's footnote (*) says the grants and fixed charges total includes it; data.gov.my reports operating expenditure without it. Any page showing total operating spending must say which definition it uses.

data.gov.my splits grants and fixed charges differently (retirement charges, debt service, subsidies, grants and transfers), so that object group is not compared one-to-one here.

## FY2025 development expenditure: JANM Lampiran 2 vs data.gov.my

Same dataset and fetch as above (`federal_finance_year`, 2025, RM million).

| Item | JANM Lampiran 2 (book p.235, PDF p.249) | data.gov.my | Result |
|---|---|---|---|
| Development expenditure, actual | RM81,920,526,113.41 | 81,921 (`spending_de_gross`) | Match after rounding |

data.gov.my also publishes `spending_de_net` (80,582), which Lampiran 2 does not print. The site reports the gross figure.

Observed, not yet explained by a source: data.gov.my `revenue` for 2025 (336,069) equals Lampiran 1's operating total including the transfer to the Development Fund (RM336,069,262,968.50) to the million.

## FY2023 and FY2024: JANM vs data.gov.my

`federal_finance_year`, fetched 2026-11-04, RM million. "Operating" is Lampiran 1's total less the transfer to the Development Fund.

| Year | Item | JANM | data.gov.my | Result |
|---|---|---|---|---|
| 2024 | Operating, actual | 324,617,649,248.33 − 3,108,700,856.86 = RM321,508,948,391.47 | 321,509 (`spending_oe`) | Match after rounding |
| 2024 | Development, actual | RM84,011,595,463.78 | 84,012 (`spending_de_gross`) | Match after rounding |
| 2023 | Operating, actual | 314,959,481,731.21 − 3,692,563,903.74 = RM311,266,917,827.47 | 311,267 (`spending_oe`) | Match after rounding |
| 2023 | Development, actual | RM96,089,737,122.54 | 96,091 (`spending_de_gross`) | **Differs by about RM1.26m.** Not explained by any source read so far. |

As in 2025, data.gov.my `revenue` equals Lampiran 1's operating total including the transfer, to the million, in both years (314,959; 324,618).

## FY2021 and FY2022: JANM vs data.gov.my

`federal_finance_year`, fetched 2026-11-04, RM million.

| Year | Item | JANM | data.gov.my | Result |
|---|---|---|---|---|
| 2022 | Operating less Development Fund transfer | RM292,693,212,509.94 | 292,693 (`spending_oe`) | Match after rounding |
| 2022 | Development | RM71,573,961,425.79 | 71,574 (`spending_de_gross`) | Match after rounding |
| 2022 | COVID-19 Fund (Lampiran 3) | RM30,979,119,546.53 | 30,979 (`spending_covid19`) | Match after rounding |
| 2021 | Operating less Development Fund transfer | RM231,516,358,812.41 | 231,516 (`spending_oe`) | Match after rounding |
| 2021 | Development | RM64,256,665,754.57 | 64,257 (`spending_de_gross`) | Match after rounding |
| 2021 | COVID-19 Fund (Lampiran 3) | RM37,711,016,365.10 | 37,711 (`spending_covid19`) | Match after rounding |

data.gov.my's balance identity treats the COVID-19 Fund as spending on top of operating and development: 2021 revenue 233,752 − 231,516 − development net 63,265 − 37,711 = −98,740 (`balance`). No operating line transfers money into the fund, so adding it counts nothing twice.

FY2020 is not loaded: its Lampiran 1 tables have no text layer (outlined glyphs, no images), so they need OCR.

## Budget 2027 (MOF) against the audited statements

Source: MOF, *Anggaran Perbelanjaan Persekutuan 2027* (586 pp, sha256 5caf1cc1…). The summary on book pp. 21-33 prints each vote's 2024 and 2025 actuals. `budget_actual_check` compares them with JANM FY2024 and FY2025:

- 272 figures (every vote total, and every operating vote's emoluments) agree. 254 match the statement rounded to the ringgit; 18 differ by 51 to 145 sen in either direction (largest: T.04 emoluments 2024, MOF 480,589, JANM 480,587.55), consistent with MOF adding parts already rounded to the ringgit.
- The summary's JUMLAH BESAR adds operating (which includes the transfer to the Development Fund) and development: 2025 RM417,989,789,082 = 336,069,262,969 + 81,920,526,113. Net of the transfer it is the site's RM412.70 bn.

**Activity codes are not stable across years.** Of the 1,091 activities in the 2027 book, 1,024 reuse a code that JANM FY2025 also has, but only 765 under the same name; many of the rest are different activities (B.64 020400 is Universiti Putra Malaysia in FY2025 and Universiti Sains Malaysia in Budget 2027; B.64 020100 is Universiti Malaya, then Jabatan Pendidikan Tinggi). The site therefore compares budget and spending at vote level, where MOF restates past actuals itself and they agree with JANM, and never joins activities across documents by code.

## Budget 2026 (MOF)

*Anggaran Perbelanjaan Persekutuan 2026* (584 pp, LaTeX re-saved through macOS Quartz, sha256 e2eaeedf…).

- Its actuals for 2023 and 2024 agree with JANM for 272 of 272 vote figures (270 to the ringgit, 2 within RM1.45).
- Unlike Budget 2027, it rounds every printed figure on its own, so 19 totals are a ringgit or two off the sum of their printed parts in the actual columns (T.7 2024: 1,907,044 + 377,686 = 2,284,730, printed 2,284,731; JANM 2,284,730.59). The parser allows 50 sen x (parts + 1) in the actual columns and logs each case; estimates must add exactly.
- Its original estimate for 2025 equals JANM FY2025's original estimate (Asal) for all 53 operating votes. Below vote level it restates 2025 in the 2026 structure: of 2,084 activity x object lines present in both, 1,249 are equal. The 2025 public service pay adjustment (activity "Pelarasan Sistem Saraan Perkhidmatan Awam (SSPA)" in JANM) is spread across other activities.
- Development is not comparable this way: JANM's Lampiran 2 prints RM83.87 bn as the 2025 estimate, while the 2025 development budget as first approved was RM88.00 bn including the RM2 bn contingency reserve (Budget 2026, book p.34).
- Headings carry footnotes on ministry changes, stored as `budget_vote_figure.note`: B/P.23 was Kementerian Sumber Asli, Alam Sekitar dan Perubahan Iklim in 2023; B/P.33 (Kementerian Alam Sekitar dan Air) was dissolved into B/P.23 in 2023; B/P.47 was Kementerian Komunikasi dan Digital in 2023; B/P.50 was created in 2024.

## Budget books: project-level figures and Lampiran F

- MOF's project-level "Perbelanjaan Sebenar 2025" in the Budget 2027 project tables is not JANM's project actual: of 605 projects in both, 114 agree after rounding (P.60 02000 PPP/PFI: JANM RM219.6m, MOF 0). The site does not show that column.
- Lampiran F (projects dropped): Budget 2027 drops 32 of 2026's projects (RM264,620,300 of 2026 allocation); none appears in its project tables, and 31 of 32 carry the 2026 allocation Budget 2026 gave them (P.50 01600: 11,350,000 there, 10,850,000 here). Budget 2026 drops 84 of 2025's projects; it prints P.24 00200 twice (checked on the rendered page, book p.571) and its JUMLAH (987,416,473) counts it twice, RM10m more than the distinct projects. JANM's 2025 project estimates agree for 40 of 83, as JANM prints revised allocations.

## Budget 2025 (MOF)

*Anggaran Perbelanjaan Persekutuan 2025* (541 pp, Microsoft Word 2019, sha256 0a96d0a4…). The summary pages use a different layout (vote code and name first, B votes print a Mengurus total, T votes do not), parsed by `budget_word.py`.

- Actuals for 2022 and 2023: 278 of 278 vote figures agree with JANM (267 to the ringgit, 11 within rounding).
- Original estimate for 2024 against JANM FY2024 Asal: 42 of 53 operating votes equal; the other 11 differences sum to exactly zero. The book restates 2024 in the 2025 ministry structure: B.33 takes RM340,087,300 from B.23, B.50 (Kementerian Digital, created 2024) RM182,265,600 from B.06, B.47 and others.
- Four printed figures disagree with the book's own tables, registered as known misprints: Lampiran D prints P.60's total project cost as 58,124,929,556 (its table and 14 projects: 58,174,929,556); Lampiran D's grand total is RM1 below its rows; the grand summary's 2025 Emolumen is RM8,000,000 too high and Lain RM8,000,000 too low (the votes sum to 105,908,537,000 and 229,091,463,000, as Budget 2026 restates).
- Project actuals and Lampiran F's actual column are rounded per project, so their totals differ from the rows by RM1-2; the checks allow that rounding in those columns only.

## FY2021-FY2025 revenue (Note 5(a)): internal checks

Each statement's revenue note was checked against two figures in the same set of statements. No discrepancy was found.

- **Lampiran 1.** HASIL Sebenar equals Lampiran 1's operating total including the transfer to the Development Fund, within the note's rounding to whole ringgit: -13, +3, -21, -33 and +50 sen for 2021 to 2025. This is the source for the observation above that data.gov.my `revenue` equals that operating total. The Consolidated Revenue Account transfers its surplus to the Development Fund, so revenue and spending after the transfer are equal by construction.
- **Previous statement.** Each statement's prior-year Sebenar equals the previous statement's Sebenar for all seven categories and every item, FY2022 to FY2025. Four items match only across a rename: FY2022 renames `Aktiviti Carigali Minyak dan Gas MTJA`, `Faedah dan Perolehan daripada Pelaburan` and `Sumbangan dan Bayaran Ganti daripada Luar Negeri ...`, and FY2024 renames `Duti Eksais` to `Duti Eksais Terhadap Barangan Tempatan`. The values are unchanged in each case. FY2022 drops the two GST items, which were zero in FY2021 and FY2020.

## FY2016-FY2019 statements

FY2019 is loaded with a registered gap: its PDF omits one page of Lampiran 1 (see `pipeline/README.md`, "FY2019's missing page"). Lampiran 1's totals above the gap are checked against the statement's English Attachment 1: 49 votes' totals equal it in every object line and column, B.05's (on the missing page) come from it, and every section and statement total equals the sum of the vote totals below it.

### Revenue (Note 5(a))

| Year | HASIL Sebenar (RM) | Lampiran 1 total (RM) | Difference |
|---|---|---|---|
| 2018 | 232,882,562,288 | 232,882,562,287.80 | +20 sen |
| 2019 | 264,414,755,876 | 264,414,755,876.41 | -41 sen |

**Previous statement.** The FY2019 note's 2018 Sebenar column (PDF pp. 60-61) equals FY2018's Sebenar for all 7 categories and all 26 items, matched by value. FY2019 adds one item printed with a dash for 2018 ("Terimaan ... Kerajaan Lain", 12,697 in 2019).

FY2017 and FY2018 (both loaded):

| Year | HASIL Sebenar (RM) | Lampiran 1 total (RM) | Difference |
|---|---|---|---|
| 2017 | 220,406,001,884 | 220,406,001,883.63 | +37 sen |

**FY2018 against FY2017.** The FY2018 note's 2017 Sebenar column (PDF pp. 64-65) equals FY2017's Sebenar for all 26 items and the 5 categories FY2017 prints with amounts. FY2017 prints Cukai Langsung and Cukai Tak Langsung without amounts; the sums of their FY2017 items (116,024,199,520 and 61,634,295,936) equal FY2018's 2017 figures for them.

**Lampiran 2, RMKe-11 spending to date.** FY2018's statement total for RMKe-11 spending to 31.12.2017 (RM86,878,876,528.87) equals FY2017's to-date column. By project, 741 of the 742 (vote, code) pairs in both statements agree; the other is P.21 90700, which FY2018 prints twice (the NATC row alone equals FY2017's).

**Lampiran 1 transfer to the Development Fund.** B.12 'Kumpulan Wang Pembangunan' actual: FY2017 RM2,710,809,215.47 (the note prints RM2,710,809,216), FY2018 RM1,922,069,619.86 (the note prints the same).

FY2016 (loaded):

| Year | HASIL Sebenar (RM) | Lampiran 1 total (RM) | Difference |
|---|---|---|---|
| 2016 | 212,421,098,894 | 212,421,098,894.35 | -35 sen |

**FY2017 against FY2016.** The FY2017 note's 2016 Sebenar column (PDF pp. 61-62) equals FY2016's Sebenar for all 25 items and the 5 categories FY2016 prints; FY2017 adds Cukai Pelancongan (a dash for 2016). FY2016 prints no direct/indirect tax split, and FY2017 prints those two categories without amounts, so they are not compared.

**Lampiran 2.** FY2016 is the first year of RMKe-11: its left page reports RMKe-10 spending to 2015 and its to-date column RMKe-11 (equal to the year's actual, RM41,995,037,696.86). FY2017's statement total for RMKe-11 spending to 31.12.2016 equals it. By project, 708 of 709 (vote, code) pairs agree; P.06 17300 (Pusat Rukun Tetangga) differs: FY2017 prints 3,634,391.97, FY2016 3,563,158.97. Not explained by any source read.

**Transfer to the Development Fund.** FY2016's Lampiran 1 footnote (*) (PDF p223) says RM2,248,437,460.02, but the B.12 'Kumpulan Wang Pembangunan' line it refers to (PDF p126) prints Sebenar RM2,248,437,560.02, and Note 5's Consolidated Revenue Account (PDF p63) and a later note (PDF p66) both print RM2,248,437,560. The footnote is off by RM100; the line, which reconciles with every total above it, is what is loaded and what `federal_spending` subtracts. The footnote text is stored as printed.

**FY2019 transfer to the Development Fund.** B.12 'Kumpulan Wang Pembangunan' actual RM1,071,831,232.82; Note 5 (PDF p60) prints the surplus transferred as RM1,071,831,233.

**FY2019 Lampiran 2 against FY2018.** FY2019's statement total for RMKe-11 spending to 31.12.2018 (RM142,974,332,190.61) equals FY2018's to-date column. By project, 648 of 747 (vote, code) pairs agree. FY2019 restates the others in its own ministry structure: the 99 that differ (16 votes, 90 of them under the same name) are net RM22.76 bn higher in FY2019, offset by projects FY2019 no longer lists under those votes; the largest are P.10 97000 Dana Fasilitasi (RM8.23 bn against RM1.61 bn) and P.10 00113 Pembangunan Lima Koridor (RM3.98 bn against RM0.35 bn). The statement totals agree, so nothing is lost; per-project history across 2018-2019 must not be read as one series.
