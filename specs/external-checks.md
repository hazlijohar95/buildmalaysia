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
