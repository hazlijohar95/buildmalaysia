# Parliament, legislation and government-commitment sources (Malaysia)

Researched 2026-11-04 by fetching pages, probing endpoints and downloading sample documents. Anything not checked against the live source is marked **UNVERIFIED**. Difficulty is 1 (structured data, trivial) to 5 (no reliable source, or manual work).

## TL;DR

- **The evidence side of a promise tracker is strong.** Every legislative step has a stable ID and a date: bill `D.R. 23/2026` (parlimen.gov.my) → Act `A1801` with `ROYALASSENTDATE`, `PUBLICATIONDATE` and `COMMENCEMENTREMARK "NOT YET IN FORCE"` (LOM) → subsidiary legislation `P.U. (A) 381/2026` linked to its parent Act (LOM). Hansard is already parsed into per-speech CSV back to 1959.
- **The promise side is weak.** No party hosts its GE15 manifesto officially. The PH manifesto survives as a 98-page text PDF on a third-party blog. BN and PN copies were not found. There are no published mandate letters or ministerial KPIs.
- **The government already runs a partial tracker.** PetaRI (BHEUU, JPM) gives chronologies for about 30 institutional-reform items. Its front end was in maintenance mode on 2026-11-04, but its WordPress JSON API was open.
- **TLS:** parlimen.gov.my fails standard certificate verification (curl error 60). Large PDFs from it drop mid-transfer over HTTP/2, so use `--http1.1`.

## Mapping

| Canadian source | Malaysian equivalent | Status |
|---|---|---|
| Party election platform | GE15 (2022) manifestos: PH *Tawaran Harapan*, BN *PADU*, PN *Prihatin, Bersih, Stabil* | PH: third-party copy only. BN, PN: **UNVERIFIED**, no copy found |
| Speech from the Throne | Titah Diraja at the opening of each parliamentary term | Available, 2014–2026, BM text PDFs. Weaker as a commitment source (see §6) |
| Budget commitments | Budget speech (Ucapan Belanjawan) + 13th Malaysia Plan (RMK-13) | Available, text PDFs |
| Mandate letters | None. Ministry KPIs exist but are not published | **Gap** |
| LEGISinfo | parlimen.gov.my bills lists (DR, DN) + XML archive tree, 1990– | Available, HTML/XML, coarse stages |
| Hansard | Hansard Digital (hansard.parlimen.gov.my) + PDFs | Excellent: per-speech CSV, 1959– |
| Canada Gazette Part II | Federal Gazette P.U.(A)/(B) on LOM (lom.agc.gov.my) | Available 2011–, encrypted JSON listing |
| Royal Assent records | LOM `ROYALASSENTDATE` field + page 2 of each Act PDF | Available |
| Dept news releases / RSS | PMO (HTML only), MOF (RSS), malaysiamadani.gov.my (RSS), Bernama (RSS) | Mixed |
| *(no Canadian analogue)* | PetaRI, the government's institutional-reform tracker | Partial, front end down |

## 1. Hansard: Hansard Digital (Parliament of Malaysia)

- **URLs:** portal https://hansard.parlimen.gov.my/ (Next.js). Per-sitting pages at `/hansard/dewan-rakyat/YYYY-MM-DD`, plus `/dewan-negara/` and `/kamar-khas/`. Catalogues at `/katalog/dewan-rakyat`. Other routes, read from the build manifest but not opened: `/kehadiran/dewan-rakyat` (attendance), `/sejarah/individu`, `/sejarah/parti`, `/cari-mp`.
- **Bulk files:** `https://downloads-hansard.parlimen.gov.my/{dewanrakyat|dewannegara|kamarkhas}/{dr|dn|kk}_YYYY-MM-DD.{pdf|csv}`. Verified: `dr_2026-10-29.csv` (938 rows), `dr_1959-09-11.csv`, `dr_1990-12-03.csv`, `dn_2026-07-21.csv`. `.json` and `.parquet` return 403.
- **CSV columns:** `level_1, level_2, level_3, timestamp, author, speech, source_page_start, source_page_end, pdf_page_start, pdf_page_end`. The `level_*` columns hold the agenda hierarchy (e.g. `WAKTU PERTANYAAN-PERTANYAAN MENTERI`). The page's `__NEXT_DATA__` JSON carries the same speeches plus an `author_id` (numeric MP ID), `cycle` (term/session/meeting) and `is_final`.
- **Coverage:** DR catalogue terms 1–15, 1959-09-11 onward. DN terms 1–15, from 1959-09-11 to 2026-08-04 at the time of checking. Content is BM, except early sittings, which are English (1959 is *"Official Report … Dewan Ra'ayat"*).
- **Format of source PDFs:** current PDFs are Word-generated text with a good text layer (the 2026-10-29 sitting is 192 pp, marked *"Naskhah belum disemak"*, i.e. unrevised). The 1959 PDFs are scans with an Acrobat ClearScan OCR layer, so expect OCR noise in early CSVs.
- **Divisions:** recorded votes appear in the transcript as named lists. Example: the 2026-03-02 CSV has blocks headed `Ahli-Ahli Yang Tidak Mengundi:` for the failed constitutional amendment D.R.4/2026. Voice votes leave no per-MP record.
- **Code:** GovTech Malaysia published the stack under permissive licences: `govtechmy/hansards-front` (MIT, pushed 2026-10-31), `govtechmy/hansards-back` (MIT, includes OpenAI summarisation), `govtechmy/hansards-dataproc` (MIT, the PDF→CSV parser), `govtechmy/hansard-mod-api` (Apache-2.0).
- **Licence:** footer reads "Hak Cipta Terpelihara © 2026". There is no robots.txt. The code is MIT, but no data licence is stated. Copyright Act s.3 excludes "political speeches and political debates" from literary works (see `open-data-and-legal.md`).
- **Update frequency:** within about 2 days of each sitting. On 2026-11-04, the 2026-11-02 sitting's CSV was already up (an unrevised draft, `is_final: false`).
- **Difficulty: 1.** Use the CSVs. Map `author` strings to `author_id` from `__NEXT_DATA__`.

## 2. Hansard PDFs, order papers and archives (parlimen.gov.my)

- **Hansard PDFs:** `https://www.parlimen.gov.my/files/hindex/pdf/DR-DDMMYYYY.pdf`, listed on `/hansard-dewan-rakyat.html?uweb=dr&`. This is the fallback if the Digital portal goes away. **Difficulty 2.**
- **Order papers (Aturan Urusan Mesyuarat):** `/files/opindex/pdf/AUMDR-DDMMYYYY.pdf`, listed on `/aum-dewan-rakyat.html?uweb=dr&`. The current meeting's papers are posted ahead of each sitting. The PDF format itself was not opened.
- **Archive trees:** every "Arkib" page loads a dhtmlx XML tree from `?…&arkib=yes&ajx=0` (root) and `&ajx=1&id=<node>` (children). Each leaf carries `loadResult('<pdf path>')`. Machine-readable and easy to crawl.
- **Repository:** https://repositori.parlimen.gov.my (DSpace) has a working **OAI-PMH** endpoint at `/oai/request`. Its sets cover order papers (AUM) and Hansard per Parliament from 1959–1964 onward. Records are Dublin Core. **Difficulty 2.**
- **Votes page:** `/senarai-undi.html?uweb=dr` (*Undi-Undi Dan Perjalanan Mesyuarat*) was empty, and its archive tree returned `<tree id='0'></tree>`. Use the Hansard divisions instead.

## 3. Bills (Rang Undang-Undang)

- **URLs:** current DR list at `https://www.parlimen.gov.my/bills-dewan-rakyat.html?uweb=dr&`, DN list at `/bills-dewan-negara.html?uweb=dn&`. Archive: `/bills-dewan-rakyat.html?uweb=dr&arkib=yes&ajx=1&id=0_YYYY`, with years **1990–2024** in the tree.
- **Fields per bill:** code (`D.R.27/2026`), year, title, status, *Bacaan Pertama Pada* (1st reading date), *Bacaan Kedua Pada* (2nd reading date), *Diluluskan Pada* (passed date), *Dirujuk JKPK Pada* (referred to a special select committee), *Dibentang Oleh* (minister or deputy who tabled it), and the PDF link.
- **Status values seen (63 DR bills, 2024–26):** `Lulus` 50, `Bacaan Kali Pertama` 8, `Dirujuk ke JKPK` 4, `Tidak Mendapat Undi 2/3 Peringkat Bacaan Ke-2` 1. There is no separate committee or third-reading stage, and no Senate or assent status on the DR page. Senate dates come from the DN page, and assent from LOM (§4).
- **Bill PDFs:** `/files/billindex/pdf/YYYY/DR/<free-form filename>.pdf`. Filenames are inconsistent (`RUU DR25 - BM.pdf`, `DR 23 Tahun 2026 - RUU Makanan 2026.pdf`), so take URLs from the listing rather than building them. The sample (D.R.23/2026) is an InDesign text PDF in BM with a *HURAIAN* (explanatory statement), which is useful for matching a bill to a promise. No English bill texts were found in the listing (all 71 links). English versions appear on LOM after enactment.
- **Format:** HTML table (current) and XML (archive). **Difficulty 2.** The join key across systems is the bill title, because LOM Acts don't carry the D.R. number. Expect fuzzy matching on titles like "RUU X (Pindaan) 2026" vs "Akta X (Pindaan) 2026".

## 4. Laws of Malaysia and the Federal Gazette (AGC, lom.agc.gov.my)

- **URLs:** https://lom.agc.gov.my/: Acts (`principal.php?type=original|updated|revised|repealed|amendment`), subsidiary legislation (`subsid.php?type=pua|pub`), Constitution, search. The agc.gov.my homepage is reachable (200), but legislation lives on LOM.
- **Listing API:** DataTables POST to `json-subsid-2024.php` (P.U.) and `json-amendment-2024.php` (amending Acts), and presumably siblings for other types. The response is `{"encrypted":true,"data":…}` **AES-256-GCM**. The key is hard-coded in each page (`SEARCH_RESPONSE_KEY`), and the layout is IV(12) | tag(16) | ciphertext (see `js/responseCrypto.js`). Decrypting it is what the browser does, but it shows a deliberate anti-scraping stance.
- **Decrypted P.U.(A) record (7,375 in total):** `noPU, titleBI, titleBM, publicationDate, commencementDate, statusOfLegislation, ACT_NO` (parent Act), `LRA_BI` (parent Act link) and a PDF token.
- **Decrypted amending-Act record (414 in total):** `ACTNO_LEGISLATION` (A1801), `TajukBM/BI`, `ROYALASSENTDATE` (08/10/2026), `PUBLICATIONDATE` (23/10/2026), `COMMENCEMENTREMARKBI` ("NOT YET IN FORCE") and the BM/BI PDF paths.
- **Links:** detail pages need a signed token (`processFile.php?…&token=base64(url|sha256-hmac)`). A bare `act-detail.php?act=A1801` returns "Invalid request". PDFs are also reachable directly: `/ilims/upload/portal/akta/outputp/<id>/P.U. (A) 381_2026.pdf` and `/ilims/upload/portal/akta/outputaktap/<id>_BI/Act A1801.pdf`.
- **PDF format:** text PDFs (Word or Adobe). Gazette items are bilingual (*Warta Kerajaan Persekutuan / Federal Government Gazette*). Act PDFs give the Royal Assent date and gazette publication date on page 2.
- **Coverage:** per the T&C, online gazetting of P.U.(A)/(B) started on **26 April 2011** and of Acts in **March/June 2011**. Earlier gazettes are not on LOM. The "What's New" feed is updated daily.
- **Terms:** *"Copyright 2023 by Attorney General's Chambers, Malaysia, all rights reserved."* A print-out *"is NOT A COPY of the Gazette"* for evidential purposes. Act PDFs carry a PNMB copyright notice. robots.txt returns 500. Treat the data as citable evidence, link back to LOM, and keep request rates low.
- **Difficulty: 3.** Plan for the encryption layer, signed links, and title matching back to bills.

## 5. Written and oral answers

- **Written (Jawapan Bukan Lisan):** `/jawapan-bukan-lisan-dr.html?uweb=dr&`. The current meeting showed nothing until the meeting ends. The archive tree (`&arkib=yes&ajx=1&id=0_15_5_1`) gives one compiled PDF per meeting, e.g. `/files/jindex/pdf/JBDR1901202603032026.pdf` = **2,148 pages, 41 MB, questions 1–711**, text (iText). Each entry has the question number, MP and seat, target minister, question text and answer. The archive covers Parliaments 14–15 only. Answers often state programme status and figures, which makes them good evidence. **Difficulty 3:** large files, HTTP/2 drops (use `--http1.1`), and you have to split entries on `NO SOALAN :`.
- **Oral (Jawapan Lisan):** `/jawapan-lisan-dr.html?uweb=dr&`. The page exists, but its file format is **UNVERIFIED**. Oral answers are also in the Hansard CSV.
- **PMO** posts its own parliamentary replies under `pmo.gov.my/media/?category=jawapan-parlimen` (link seen, not opened).

## 6. Royal Address (Titah Diraja)

- **URL:** https://www.parlimen.gov.my/titah-seri-paduka-baginda-ydpa.html?uweb=yg&
- **Contents:** 14 PDFs, 2014–2026, under `/images/webuser/TITAH_YDPA/…`. They are BM except `TitahEN_28022022.pdf`, and filenames are irregular. The sample `BM_Titah Diraja 19012026.pdf` is 6 pp, Word, with a text layer.
- **Caveat:** unlike the Throne Speech, the 2026 text is written in the King's personal voice (*"Saya pernah sebut … datang ke Kuala Lumpur untuk memburu perasuah"*). Treat it as context, not as a list of government commitments.
- **Difficulty 2** (it's small; just add the files by hand).

## 7. Government commitments

**GE15 manifestos (Nov 2022)**
- **PH *Kita Boleh! Tawaran Harapan PRU15*:** no official host found. pakatanharapan.com.my and pakatanharapan.my don't resolve, a dapmalaysia.org search found no 2022 copy, and the `dl.dapmalaysia.org` repository has only the 2018 manifesto. A third-party copy is at https://ecentral.my/wp-content/uploads/2022/11/Kita-Boleh-Tawaran-HARAPAN-PRU15.pdf: 98 pp, text layer (12k words), created 2022-11-03. Before relying on it, archive it and checksum it against a second source.
- **BN *PADU* (99 offers) and PN (12 pillars, 30 approaches, 234 offers):** **UNVERIFIED**. Only news coverage was found, no document. PH and BN are both in the governing coalition, so BN pledges matter. PN is the opposition.
- **Difficulty:** PH 2. BN and PN 5 until a copy is found (try the Wayback Machine, or ask the parties).

**Budget speech**
- **URLs:** https://belanjawan.mof.gov.my/ms/: `/pdf/belanjawan2027/ucapan/ub27.pdf` (BM, 240 pp, text, verified) and `bs27.pdf` (EN, linked from `/en/`, not downloaded). Tax measures are in `langkah-cukai.pdf`/`tax-measures.pdf`. The archive page lists 2018–2027.
- **Contents:** structured by *Lunas* (pillars) with RM amounts (103 "RM… bilion/juta" mentions in 2027). It's annual and the best source of concrete, dated commitments. **Difficulty 2–3** (segmenting into commitments needs an LLM plus review).

**RMK-13 (2026–2030)**
- **URL:** https://rmk13.ekonomi.gov.my/. Main document `/wp-content/uploads/2025/08/240825-Buku-Utama-e-Book.pdf` (212 pp, 55 MB, InDesign), executive summary, pamphlet, and the tabling speeches for DR and DN.
- **Contents:** about 260 "Sasaran" (target) mentions. The targets sit inside infographic layouts, so `pdftotext -layout` mixes columns. **Difficulty 4.**

**Malaysia MADANI and delivery reporting**
- https://malaysiamadani.gov.my/ (WordPress) has a working RSS feed at `/feed/` (10 items), policy pages and booklets (e.g. `MADANIdiHati.pdf`). The "2 Tahun Kerajaan MADANI" page describes a Nov 2024 event, not a progress report.
- **Ministerial KPIs:** news reports (The Star, 2026-02-27) say ministers "met KPI targets", but no KPI list was found published. **Gap.**
- Auditor-General's Dashboard (https://agdashboard.audit.gov.my) tracks follow-up status on audit findings (*Dalam Tindakan / Tiada Tindakan / Selesai*), 2011–2026. It's secondary evidence for delivery. Its data access was not explored.

**PetaRI (Peta Reformasi Institusi), BHEUU / JPM**
- **URL:** https://petari.bheuu.gov.my/. It returned 503 "Penyelenggaraan Portal" on 2026-11-04. The WordPress API `/wp-json/wp/v2/pages?per_page=100` was open and returned **74 pages** (about 30 reform items, each with a "Kronologi Lengkap" page). Items include RUU Ombudsman, RUU Antibuli, the PM term-limit amendment, AG/PP separation, DPA and NHRAP, and the most recent was modified 2026-07-13. The chronologies are dated prose (e.g. *"Kertas Cadangan Dasar … dibentangkan kepada Jemaah Menteri pada 9 Januari 2026"*) in Avia page-builder HTML.
- **Difficulty 3.** It's the closest thing to an official outcome tracker, but it covers only the institutional-reform portfolio of one minister.

## 8. News feeds

| Source | Feed | Verified | Notes |
|---|---|---|---|
| PMO (pmo.gov.my) | None | `/feed/` returns 404 or an HTML page. `/wp-json/` returns 403 | HTML categories: `/ms/kategori/kenyataan-media/`, `/ucapanterkini/` (verbatim speeches), `/beritabahasamelayu/`. Year/month filter 2022–2026. **Difficulty 3** |
| MOF | `https://www.mof.gov.my/portal/ms/berita/siaran-media?format=feed&type=rss` | RSS works, 6 items, latest 2026-10-30 | Joomla. The same `?format=feed&type=rss` pattern likely works on other Joomla ministry sites (**UNVERIFIED** per ministry). **Difficulty 1** |
| malaysiamadani.gov.my | `/feed/` | RSS works | Government messaging, not primary evidence |
| Bernama | `https://www.bernama.com/en/rssfeed.php`, `/bm/rssfeed.php` | EN 200. BM returns valid XML with HTTP 500 | Headlines only. Bernama is a news agency with commercial copyright: link, don't republish. Terms **UNVERIFIED** |

## 9. Existing Malaysian civic tech

| Project | URL | Covers | State (2026-11-04) | Code / licence |
|---|---|---|---|---|
| Hansard Digital (GovTech MY / Parliament) | hansard.parlimen.gov.my | Search, per-speech CSV, attendance, MP history, 1959– | **Active**, official | `govtechmy/hansards-*` MIT, `hansard-mod-api` Apache-2.0 |
| PetaRI (BHEUU) | petari.bheuu.gov.my | Government's institutional-reform tracker | Front end in maintenance, API live | Closed (WordPress) |
| MyMP Dashboard | mymp-dashboard.pages.dev | Per-MP score. Claims 514 promises tracked (Delivered/In Progress/Delayed/Failed), 2.7k news articles | Live. Says "open-source" but no repo was found on GitHub | **UNVERIFIED** |
| MyMP | mymp.org.my | Volunteer MP scoring (attendance, ethics, transparency). Feed updated 2026-10-13 | **Active** | No repo found |
| Sinar Project PARDOCS | pardocs.sinarproject.org | Scanned parliamentary documents, written replies | Newest item 2021-12, **stale** | `Sinar/go-pardocs` AGPL-3.0 (2022). `sinar.pardocs` (2018) |
| Sinar BillWatcher | (no live site) | Bill tracking | **Dead** (repo last pushed 2015) | `Sinar/BillWatcher-2.0` GPL-3.0 |
| Sinar popit / MyMP API | popit.api.sinarproject.org | Popolo MP database | Repos archived 2015–18. Org still active on other work (Politikus, GPL) | `Sinar/popit_ng` AGPL-3.0 |
| C4 Center MyGov Reform Tracker | c4center.org/mygov-reform-tracker-report/ | 13 anti-corruption reform areas | One-off PDF report, 2022-09-30. No live tracker | Not open source |
| Harapan KPI / Harapan Tracker (2018, GE14) | harapankpi.com, harapantracker.com | PH 2018 manifesto (500+ promises) | **Dead** (domains don't resolve) | `harapankpi/harapankpi.github.io` MIT (2018) |
| parlimen-malaysia-data | mohdsyahid.github.io/parlimen-malaysia-data | MPs, seats, parties | New (created and last pushed 2026-08-30) | MIT |
| Bersih scorecard, IDEAS report card (2019), Malaysiakini 100-day tracker (2018) | news only | Reform or manifesto scoring | **UNVERIFIED**, only press coverage seen | — |

Closest overlaps with a promise tracker: **MyMP Dashboard** (promise statuses, MP-level, opaque sourcing), **PetaRI** (official, reform-only), and the 2018 Harapan trackers (dead, wrong manifesto). No live site joins manifesto items to bills, gazettes and Hansard evidence.

## 10. Gaps and risks

1. **No authoritative promise corpus.** No official GE15 manifesto host and no mandate letters. A tracker has to snapshot the PH PDF from a third party, find BN/PN copies, and treat budget speeches, RMK-13 and PetaRI items as government-owned commitments. Recommendation: anchor "government commitments" on budget-speech paragraphs and PetaRI items (official, dated), and treat manifesto items as a separate, clearly sourced layer.
2. **Bill ↔ Act ↔ gazette linkage is by title, not ID.** Parliament uses `D.R.n/yyyy`, LOM uses `A####` / `Act ###`, and commencement orders are separate P.U.(B) items. You need a matching step plus manual review.
3. **LOM anti-scraping.** The encrypted JSON and signed links could change without notice. The "all rights reserved" terms suggest asking AGC for permission or a feed before going to production.
4. **Coverage holes:** LOM has no gazettes before 2011. Written answers go back to Parliament 14 only. Bill archives start in 1990. The Royal Address collection starts in 2014.
5. **Fragile hosting:** parlimen.gov.my has a broken TLS chain and drops large transfers. PetaRI was down during this check. Mirror every evidence document you cite (with a hash and fetch date), the way Outcome Tracker keeps evidence.
6. **Language:** primary sources are BM-first (bills, Hansard, written answers, budget speech). The English versions that exist are the budget speech, LOM Act titles and texts, and the 2022 Titah. Plan for bilingual extraction and display.
7. **Non-legislative promises** (cash aid, programmes, targets) have no gazette trail. Evidence has to come from budget speeches, MOF/PMO releases, written answers and DOSM data, which takes more judgment and gives weaker "kept" verdicts.
