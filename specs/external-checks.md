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
