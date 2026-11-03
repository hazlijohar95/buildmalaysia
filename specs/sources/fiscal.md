# Malaysian fiscal data sources

Research date: 2026-11-04. Each "Verified" claim below comes from fetching the page or downloading the sample file named. Claims I could not check are marked **UNVERIFIED**.

Extraction difficulty runs from 1 (clean machine-readable data) to 5 (image-only, needs OCR plus manual reconciliation).

## Mapping: Canada Spends source → Malaysian equivalent

| Canadian source | Malaysian equivalent | Status |
|---|---|---|
| Public Accounts (audited financial statements, multi-year PDFs) | JANM *Penyata Kewangan Kerajaan Persekutuan* 2009–2025, audited by JAN | **exists** |
| Main Estimates (appropriations by department/vote) | MOF *Anggaran Perbelanjaan Persekutuan* (by Maksud Bekalan/vote → programme → activity → object) | **exists** |
| Supplementary Estimates | *Rang Undang-Undang Perbekalan Tambahan* (vote-level schedule) on the Parliament repository, plus the "Tambahan" column in the JANM statements | **partial** |
| InfoBase (government-wide spending CSVs) | data.gov.my `federal_finance_*` series (aggregate by object/sector only) | **partial** |
| Contracts over $10k | MyProcurement tender/quotation award results (winner + accepted price) | **partial** |
| Grants and contributions disclosures | No recipient-level grant disclosure. Grants are visible only as activity lines in the estimates and statements | **none** |
| Federal transfers to provinces | Fiscal Outlook table 3.1 (aggregate) plus JANM vote B.11 activity lines (capitation, road grants, Sabah/Sarawak special grants) | **partial** |
| Provincial financial statements | State *Penyata Kewangan*, published unevenly (Selangor and Penang on state sites, all 13 states inside LKAN Negeri) | **partial** |
| Municipal financial statements | DBKL publishes budget speeches only. Aggregate local-government totals appear in the Fiscal Outlook | **none / partial** |
| (no direct Canadian analogue) Auditor-General findings | LKAN portal (1999–2026) plus the AG Dashboard tracking issue status | **exists** |

## 1. Federal Government Financial Statements (JANM)

- **URL (index):** https://www.anm.gov.my/arkib/terbitan/penyata-kewangan-kerajaan-persekutuan
- **URL patterns:**
  - 2009–2019: `https://www.anm.gov.my/images/dokumen/arkib/penyata-kewangan/{YYYY}_PENYATA_KEWANGAN_KERAJAAN_PERSEKUTUAN.pdf`
  - 2020–2025: `https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/{YYYY}_Penyata_Kewangan_Kerajaan_Persekutuan.pdf`. File-name casing changes from 2023.
- **Publisher:** Jabatan Akauntan Negara Malaysia (Accountant General's Department), under MOF. Audited by Jabatan Audit Negara, which issues the *Sijil Ketua Audit Negara*.
- **Years:** 2009–2025. All 17 links are on the index page. Pre-2009 is **UNVERIFIED**.
- **Basis:** modified cash, under IPSAS "Financial Reporting under the Cash Basis of Accounting" (verified in the 2025 notes). JANM has a notice about *KKS bagi PKKP pra-peralihan tahun kewangan 2026 lejar akruan*, so the move to accrual appears to start with FY2026. The first accrual-basis year is **UNVERIFIED**.
- **Contents (verified in 2025):**
  - Principal statements and notes.
  - Lampiran 1, *Perbelanjaan Mengurus*: vote (B.nn) → programme (010000) → activity (010100) → object group (10000 Emolumen, 20000 Perkhidmatan dan Bekalan, 30000 Aset, 40000 Pemberian…, 50000 Lain-lain). Columns are Asal, Tambahan/(Kurangan), Viremen, Jumlah, Sebenar, % Prestasi and Varian. This is the closest analogue to Public Accounts Vol II, and it holds budget-versus-actual in one table.
  - Lampiran 2, *Perbelanjaan Pembangunan*: by project code.
  - Lampiran 3–10: loans, investments, federal debt, PFI, guarantee and lease commitments, statutory guarantees.
- **Federal-to-state transfers:** vote B.11 activities, for example 010100 *Pemberian Mengikut Bilangan Orang*, state road maintenance grants, 010500/010600 *Pemberian Khas Tahunan Sarawak/Sabah*, 010900 *Pemberian Tahunan Selangor* (RM25,805,638.00 actual in 2025) and 010800 annual grants to local authorities. A per-state breakdown of capitation grants was not seen.
- **Format (verified):**
  - 2025: 458 pages, 66 MB, InDesign, full text layer, `pdftotext -layout` keeps columns aligned.
  - 2012: 265 pages, text layer, passed through a "PDF Security Shell". Copy or extract restrictions are possible but did not block `pdftotext`.
  - Other years: **UNVERIFIED**.
- **Language:** bilingual in one file. The BM section comes first and the English section follows. The English Lampiran 1 gives only vote × object totals. Programme and activity detail is BM only.
- **Frequency:** annual. Tabled about 9–10 months after year end (FY2025 tabled with LKAN 2/2026 on 5 Oct 2026).
- **Licence:** "Hakcipta Terpelihara © JANM" (all rights reserved). No open licence is stated.
- **Difficulty: 3.** The text layer is clean and the codes are regular (6-digit programme/activity, 5-digit object), so a code-anchored parser works. Problems:
  - Tables continue across pages with "(samb.)" and "(disambung...)" markers.
  - Long names wrap onto two lines.
  - Each page carries three numbering schemes: PDF index, the book page and the appendix page (PDF p.160 = book p.146 = appendix p.78).
  - The layout differs between years. 2009–2019, 2020–22 and 2023–25 come from different InDesign builds.

## 2. Federal Expenditure Estimates (MOF Budget portal)

- **URLs:** https://belanjawan.mof.gov.my/ms/perbelanjaan (EN: `/en/expenditure`, which links the same BM PDFs). Archive: `/ms/arkib` → `/ms/{2018..2026}/perbelanjaan/`.
- **Files:**
  - Full book: `/pdf/belanjawan2027/perbelanjaan/Anggaran_Perbelanjaan_Persekutuan_2027.pdf`.
  - Per-vote files: `B.nn` (operating), `BP.nn` (operating + development), `P.nn`, `T.nn` (charged expenditure).
  - Summaries: `ringkasan.pdf`, `ringkasan_sebenar.pdf` (actuals), `ringkasan_bp.pdf`, `lampiran_a…f.pdf`.
  - Older paths: `/pdf/2018/perbelanjaan/…`, `/pdf/2020/…`, `/pdf/belanjawan2023/…`.
- **Publisher:** Kementerian Kewangan (MOF).
- **Years on the portal:** Budget 2018–2027 (2018, 2020, 2023 and 2027 listings fetched). Pre-2018 is **UNVERIFIED**. The civil-society mirror govdocs.sinarproject.org (reachable, HTTP 200) has some older documents.
- **Granularity (verified in B.40, BP.42 2027):**
  - Operating: vote → programme → activity × object group, prior-year and current-year estimates, and established posts (Bil. Jawatan) per activity.
  - Each ministry also has KPI/outcome tables, which are useful for an OutcomeTracker-type feature.
  - Development (P.nn): project-programme code (e.g. `00400 Hospital Baharu`) with total project cost, actual prior year, revised current year and estimate. These codes are project groupings, not individual sites.
- **Actuals:** `ringkasan_sebenar.pdf` (13 pp) gives two prior years of actuals by vote (2024 and 2025 actual, 2026 original, 2027 estimate).
- **Format (verified):** text PDF throughout, but the producer changes by year: 2018 InDesign CS6, 2023 InDesign CC, 2025 Word 2019, 2027 LaTeX/pdfTeX. The 2027 book is 586 pages and prints "ANGGARAN PERBELANJAAN PERSEKUTUAN 2027 | <page>" on every page, which is good for citations.
- **Language:** BM only for the estimates.
- **Frequency:** annual, tabled in October for the following year.
- **Licence:** "Hakcipta Terpelihara © 2026 Kementerian Kewangan". No open licence.
- **Difficulty: 2 for 2027 (LaTeX, very regular); 3 across years.** Each year's producer change needs its own parser profile. Older years print "..." placeholders in the actual columns.

## 3. Fiscal Outlook / Tinjauan Fiskal and Economic Outlook (MOF)

- **URLs:**
  - EN: `https://belanjawan.mof.gov.my/pdf/belanjawan2027/revenue/fiscal_outlook_2027.pdf`
  - BM: `/pdf/belanjawan2027/hasil/tinjauan_fiskal_2027.pdf`
  - Statistical annex: `/pdf/belanjawan2027/hasil/st_kewangan.pdf`
  - Revenue estimates book: `hasil.pdf`
  - Economic Outlook (BM): `/pdf/belanjawan2027/ekonomi/ekonomi-2027.pdf`
- **Contents (verified):** the Fiscal Outlook is 159 pp, with tables 1.1–6.4. Its *Statistik Kewangan Awam / Public Finance Statistics* annex (19 pp) covers:
  - Federal finance.
  - Revenue.
  - Operating expenditure by component, including *grants and transfers to state governments* split into constitutional and other (2023–2027).
  - Operating expenditure by sector, development expenditure by sector.
  - Debt and guarantees.
  - Consolidated public sector, state governments (6.2), local governments (6.3) and statutory bodies (6.4).
- **Granularity:** national aggregates, about 5 years per table. No per-state or per-council rows.
- **Format:** text PDF re-saved through macOS Quartz. The annex tables put BM and EN labels on alternating lines.
- **Language:** separate EN and BM editions. The annex is bilingual.
- **Frequency:** annual with the budget.
- **Licence:** as section 2.
- **Difficulty: 3.** There are few tables but the interleaved bilingual rows break naive row parsing. Use it for headline context, not line items.
- The English Economic Outlook was not checked (**UNVERIFIED**).

## 4. Supplementary supply

- **Source:** Parliament repository, e.g. `https://repositori.parlimen.gov.my/bitstream/123456789/1605/15/DR%204/2024`. Verified: *RUU Perbekalan Tambahan (2023)*, D.R. 4/2024, 2 pp, text PDF. The schedule covers 10 votes totalling RM23,479,669,350.
- **Granularity:** vote only in the bill. The detailed supplementary estimates are tabled as a separate command paper (Kertas Perintah); its URL pattern is **UNVERIFIED**.
- **Workaround:** the JANM statements' "Tambahan/(Kurangan)" column already gives supplementary amounts at activity × object level after the fact.
- **Difficulty: 2** for the bills (tiny and regular). Discovery is the hard part: the repository has no stable index by year that I could confirm.

## 5. Auditor-General's Reports (Jabatan Audit Negara)

- **URLs:**
  - Report portal: https://lkan.audit.gov.my/laporan, filterable by federal/state, category (Penyata Kewangan, Pematuhan, Aktiviti, Syarikat Kerajaan) and ministry.
  - Downloads: `/component/lkan/?task=manage.download&uid=…`
  - Dashboard: https://agdashboard.audit.gov.my/
  - Corporate site: https://www.audit.gov.my/
- **Series:** LKAN [n]/[year] in up to 3 series a year.
  - Federal: financial statements, compliance, activity/performance, government companies.
  - States: all 13.
  - The portal reports "2283" items, with a year filter from 1999 to 2026.
- **Sample (verified):** *LKAN 2/2026 Penyata Kewangan Kerajaan Persekutuan Tahun 2025*, 279 pp, 142 MB, InDesign, text layer.
- **Dashboard:** follow-up status of each audit issue (Selesai / Dalam Tindakan / Tiada Tindakan) by ministry, state, year and series, from 2011 to 2026. It loads through internal AJAX endpoints (`/public/ajaxKementerian…`). There is no documented API or export.
- **Language:** BM. English editions were not seen (**UNVERIFIED**).
- **Licence:** "Hakcipta Terpelihara © Jabatan Audit Negara".
- **Access quirks (verified):**
  - The TLS chain is incomplete, so curl fails without `-k` or an added intermediate certificate.
  - An F5 WAF rejects non-browser user agents with "Request Rejected" and serves a JS challenge (`/TSPD/`).
  - A full browser user agent plus an `Accept` header worked for listing and download pages.
- **Difficulty: 4.** The text is fine, but the content is narrative findings rather than tables. Files are large, the WAF needs care, and download links use opaque per-report uids. The format of older reports (1999–2012) is **UNVERIFIED**.

## 6. Procurement awards (MyProcurement / ePerolehan)

- **URLs:**
  - Current results: https://myprocurement.treasury.gov.my/results/tender and `/results/quotation`
  - Archive: `/archive/results-tender`, `/archive/results-quotation`, `/archive/direct-negotiations`
  - Tender notices only: https://www.eperolehan.gov.my/quotation-tender-notice
- **Publisher:** Bahagian Perolehan Kerajaan, MOF.
- **Fields (verified):**
  - Award results: tender number, title, ministry, agency, procurement category, result date, winning tenderer and *Harga Setuju Terima* (accepted price, RM).
  - Direct negotiation: company, value and the justification criterion.
- **Coverage (record counts from the endpoint, 2026-11-04):**

  | Listing | Records |
  |---|---|
  | Current tender results | 1,075 |
  | Current quotation results | 5,846 |
  | Archived tender results | 24,564, oldest dated 08/01/2020 |
  | Direct negotiations | 293, mostly 2016–2017 |

  The archive is sparse before 2020. Direct awards are badly under-disclosed.
- **Format:**
  - The UI has PDF and Excel export buttons.
  - There is an undocumented JSON endpoint: `GET /procurements/fetch?type=results&category=tender&itemsPerPage=N&page=P`. The archive uses `type=archive&category=results-tender|direct-negotiations`.
  - The endpoint needs a session cookie and the page's CSRF token, and returns `{html, total, page, lastPage}`. Rows come back as HTML fragments.
- **Open Contracting / OCDS:** none found. The OCP Malaysia page lists only blog items, the latest dated 2023.
- **Language:** BM.
- **Licence:** "Hak Cipta Terpelihara © 2025 Kementerian Kewangan".
- **Difficulty: 2 for scraping, 4 for analysis.** The fields are structured, but there is no contract-value-over-time, amendment or payment data. There is no supplier ID (names only), and nothing links an award to a budget vote or activity. Award thresholds by method are **UNVERIFIED**.

## 7. data.gov.my (and OpenDOSM)

- **URLs:**
  - Catalogue: https://data.gov.my/data-catalogue
  - API: `https://api.data.gov.my/data-catalogue?id={id}&limit=N`
  - Files: `https://storage.data.gov.my/publicadmin/{id}.csv|.parquet`
- **Fiscal datasets (verified from the catalogue, 351 IDs):**

  | Dataset IDs | Coverage | Source | Updated |
  |---|---|---|---|
  | `federal_finance_year` / `_qtr` and `_revenue`, `_oe`, `_de`, `_debt_mat` | `_year_oe`: annual 1979–2025, objects such as emoluments, debt_service, grants_transfers, subsidies_sa | JANM | last 2026-10-11, next 2027-03-31 |
  | `lookup_federal_finance` | lookup table for the federal finance series | — | — |
  | `federal_budget_moe`, `federal_budget_moh` | allocation by OE/DE and object group, 2015–2027, only these two ministries | MOF budget books | — |
  | `state_finance_revenue`, `state_finance_expenditure` | 13 states × OE/DE/object group, 2020–2022 only | Audit | last 2024-09-01, no next update scheduled |

- **Licence:** CC BY 4.0, stated in the developer.data.gov.my footer. This is the only openly licensed source in this list.
- **OpenDOSM** (open.dosm.gov.my): 238 catalogue IDs and no fiscal datasets, only household expenditure.
- **Difficulty: 1.** Clean CSV, Parquet and a public API, but aggregate only (national object/sector totals). There is no vote, programme or activity breakdown except MOE and MOH. Good for validating parsed totals and for long-run charts.

## 8. State governments

### Selangor (Perbendaharaan Negeri Selangor)

- **Budget:** https://pwn.selangor.gov.my/wp-content/uploads/BUKU-ANGGARAN-BELANJAWAN-NEGERI-SELANGOR-TAHUN-2026.pdf. Verified: 260 pp, InDesign. Object-level (5-digit sub-objects such as 11000 Gaji) per vote (e.g. B21 Pejabat Daerah dan Tanah Kuala Langat) and PTJ code. Columns are *dasar sedia ada / dasar baru / one-off* for 2025 and 2026, plus posts.
- **Financial statements:** `…/PENYATA-KEWANGAN-KERAJAAN-NEGERI-SELANGOR-2024.pdf`. Verified: 114 pp.
- **Other years:** search results show 2019 (dewan.selangor.gov.my), 2021, and budget books for 2020 and 2022. Not downloaded.
- **Difficulty: 4.** About 80 of the 260 budget pages and 27 of the 114 statement pages have no text layer. Some totals extract letter-spaced ("1 0 0 0 0 EMOL U MEN").

### Penang (Jabatan Kewangan Negeri)

- **Financial statements:** https://jkn.penang.gov.my/index.php/en/sumber/penyata-kewangan/category/32-penyata-kewangan-kerajaan-negeri-pulau-pinang, years 2015–2024 via jDownloads `send/…` links.
- **Format:** the 2024 file is 92 pp with 92 characters of text in total, so it is effectively image-only (Illustrator → Distiller).
- **Budget:** only the speech and an infographic are published for 2025 and 2026. No estimates book was found (**UNVERIFIED** that none exists).
- **Difficulty: 5.** Needs OCR.

### Sarawak (Pejabat Setiausaha Kewangan Negeri)

- **Budget:** https://sfs.sarawak.gov.my links a Google Drive folder (`1kc1rdQI2NsDiG5Gp2gB2JlvQyyC9U9BF`) holding *Buku Anggaran dan Perbelanjaan bagi Tahun 2026* Jilid 1–3.
- **Sample (verified):** one volume is 455 pp, Ghostscript-flattened, with about 3 KB of text in the whole file. Tesseract OCR on one page worked and showed bilingual heads such as "KEPALA B.106 – Ministry of Public Health, Housing and Local Government".
- **Not found:** the 2027 estimates (tabled Oct 2026) and the state financial statements (**UNVERIFIED**).
- **Hosting risk:** files on Google Drive can disappear or change without notice.
- **Difficulty: 5.**

### All states, via Audit

LKAN Negeri on lkan.audit.gov.my includes each state's audited financial statements. It is the consistent route for all 13 states. data.gov.my's state series (2020–2022) is derived from it.

## 9. Local council: DBKL

- **URLs:** budget speeches at `https://www.dbkl.gov.my/files/arkib-ucapan-belanjawan-dbkl/ucapan-belanjawan-{2023,2024,2025}.pdf` (verified, Word PDFs, about 33 pp). The 2026 file returns 404. The e-participation page (`/en/e-participants/belanjawan-dbkl-2026`) is a consultation notice with no documents.
- **Content:** headline totals only (e.g. a RM2.704b budget split into OE and DE percentages). No estimates book or financial statements were found on the site (**UNVERIFIED** absence).
- The Star (22 Dec 2025, 5 Jan 2026) reported delays and transparency concerns over the 2026 budget.
- **Aggregate fallback:** all local authorities consolidated in Fiscal Outlook table 6.3.
- **Difficulty: 5** for line items, which do not exist publicly. **1** for headline numbers.

## Gaps and risks

1. **No open licence on the primary documents.** MOF, JANM, JAN and MyProcurement all state "Hakcipta Terpelihara". Only data.gov.my is CC BY 4.0. Republishing derived tables with citations is normal civic-tech practice, but get a legal read before launch.
2. **No grants-and-contributions or recipient-level disclosure.** Grants to statutory bodies, GLCs and NGOs appear only as activity lines (object 40000). Development projects are code groups, not sites. There is no equivalent of Canada's per-recipient grant data.
3. **Procurement cannot be joined to the budget.** MyProcurement has no vote or activity code, no supplier registration number, no payments and no amendments. The archive starts in 2020 and direct negotiations are almost absent. There is no OCDS.
4. **Accrual transition.** The statements are modified cash up to FY2025. From FY2026 (expected) they move to accrual (MPSAS). Line-item comparability across that break needs explicit handling.
5. **Format drift.** The estimates changed producer four times between 2018 and 2027, and the statements changed layout at least twice. Write parsers per year-family and reconcile every vote total to the printed "JUMLAH" lines and to data.gov.my aggregates.
6. **Language.** Line-item detail is BM only, in both the estimates and the statements' Lampiran. An English UI needs a translation table for programme and activity names. The vote and object codes are stable keys.
7. **Citation precision.** Each PDF carries several numbering schemes (PDF index, book page, appendix page). Store all three per extracted row.
8. **Fragile hosting.**
   - audit.gov.my has an incomplete TLS chain and a bot-blocking WAF.
   - The Sarawak budget books sit on Google Drive.
   - Penang's files are behind jDownloads redirects.
   - MOF's URL scheme changed between 2020 and 2023.
   - Archive every source file (with a hash) at ingest.
9. **Timeliness.** Audited actuals arrive about 10 months after year end. The FY2025 statements and the Budget 2027 `ringkasan_sebenar` both appeared in October 2026, so the estimates give no earlier view of actuals. In-year spending is visible only through data.gov.my's quarterly aggregates.
10. **States and councils are uneven.** Selangor has partial text, Penang is image-only, Sarawak is image-only on Drive, and DBKL publishes speeches only. OCR is required for 2 of the 3 states sampled.

## Recommendation for v1

Build on the **JANM Federal Government Financial Statements (Lampiran 1 & 2), 2009–2025**:

- They are the audited source and so the true analogue of the Public Accounts.
- One table gives original estimate, supplementary, virement and actual at vote → programme → activity → object, so "budgeted vs spent" needs no cross-document join.
- The text layer is extractable and the codes are stable.
- They also carry the federal-to-state grant lines (B.11).

Pair it with the **MOF Anggaran Perbelanjaan Persekutuan 2027**, the cleanest file found (LaTeX), for the forward-looking year. Use **data.gov.my** `federal_finance_year_*` as an independent check on totals.
