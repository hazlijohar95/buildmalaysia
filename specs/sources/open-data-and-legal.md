# Malaysian open data platforms, reference data, and legal context

Researched 2026-11-04 by fetching pages and calling APIs. Anything not checked against a primary source is marked **UNVERIFIED**. This is a summary of what the sources say, not legal advice.

## TL;DR

- **Licence:** each data.gov.my / OpenDOSM dataset page says *"made open under the Creative Commons Attribution 4.0 International License (CC BY 4.0)"*. The site footer's "Open Data" link goes to Pekeliling Am Bil. 1/2015, whose Lampiran B is the **Terma Penggunaan Data Terbuka Kerajaan 1.0** (also attribution-only, commercial use allowed). DOSM's main portal cites Terms of Use 1.0. Comply with both: credit the source agency, link CC BY 4.0, and link the Terms.
- **API:** `https://api.data.gov.my`, no token, **4 requests/minute** per endpoint (we got 429 on the 5th rapid call). Too slow for ingestion. Download the CSV/Parquet files from `storage.data.gov.my` / `storage.dosm.gov.my` instead (no published limit; **UNVERIFIED** whether any applies).
- **Ministry codes:** no machine-readable list exists. The usable key is the **budget vote number** (B./P./BP.nn, e.g. BP.42 = Kementerian Kesihatan) in MOF's Anggaran Perbelanjaan Persekutuan PDFs. Vote numbers are mostly stable, but the ministry behind a number changes after cabinet reshuffles (see table).
- **Constituencies:** DOSM population tables give 222 `P.nnn Name` parliamentary seats and 600 `N.nn Name` DUN seats (2020–2024). ElectionData.MY (CC0) has boundaries, results from 1955 onward, and an API.
- **MPs:** parlimen.gov.my publishes HTML only. The old CSV on archive.data.gov.my covers the 13th Parliament and is stale.

## 1. data.gov.my (national open data portal)

| Item | Finding |
|---|---|
| URL | https://data.gov.my (catalogue `/data-catalogue`, dashboards `/dashboard`) |
| Operator | JDN (Jabatan Digital Negara) with KD (Kementerian Digital), per the `source` field on the portal's own metadata datasets |
| Size | **356 datasets** in `https://storage.data.gov.my/metrics/dataset_list.csv` (newest `date_created` 2026-10-30). By category: Labour 43, Demography 40, Prices 35, Healthcare 33, Economic Sectors 32, Households 29, National Accounts 29, **Public Administration 24**, Financial Markets 17, others smaller. 167 are sourced solely from DOSM. |
| Delivery | Each dataset has `link_csv`, `link_parquet` and usually `link_preview`. Some are marked API-excluded (`exclude_openapi: true`, e.g. `population_parlimen`, `population_dun`) and are download-only; the API returns 404 for them. |
| Metadata | Per dataset: id, title/description EN+BM, fields with definitions, `frequency`, `data_source`, `last_updated`, `next_update`, `dataset_begin/end`. All of it is in the public repo `data-gov-my/datagovmy-meta` (`data-catalogue/*.json`). |
| Language | Bilingual EN / BM (`i18n/en-GB`, `i18n/ms-MY` in the meta repo) |
| Update frequency | Per dataset: YEARLY 161, MONTHLY 83, DAILY 51, QUARTERLY 31, ANNUAL 16, INFREQUENT 12 |
| Licence | Dataset page: *"This data is made open under the Creative Commons Attribution 4.0 International License (CC BY 4.0)."* (checked on `/data-catalogue/population_state`). See §6 for the government Terms of Use. |
| Open source | Yes, MIT. GitHub account `data-gov-my`: `datagovmy-front` (Next.js), `datagovmy-back` (Django), `datagovmy-meta` (catalogue and dashboard metadata), `datagovmy-ai`, `datagovmy-docs`, all pushed Oct–Nov 2026. `datagovmy-tileserver` has no licence and was last pushed in 2023. The front repo includes district GeoJSON (`packages/datagovmy-ui/src/lib/geojson/district/`). |

**API** (https://developer.data.gov.my)
- Base URL: `https://api.data.gov.my`. Static endpoints are `/data-catalogue?id=` and `/opendosm?id=`. Realtime endpoints cover GTFS, GTFS-R and Weather. The URL without a trailing slash 301-redirects to `/data-catalogue/?…`.
- Auth: the Quickstart says *"The Open API does not require an API token."*
- Rate limit: *"4 requests per minute"* for Data Catalogue, OpenDOSM, Weather, GTFS Static and GTFS Realtime, then `429 Too Many Requests`. Verified: 4×200 then 429. No rate-limit headers are returned.
- Query parameters: `filter`/`ifilter`/`contains`/`icontains` (`value@column`), `range=col[a:b]`, `sort`, `date_start`/`date_end`, `timestamp_start`/`timestamp_end`, `limit`, `include`, `exclude`. `meta=true` wraps the response as `{meta:{catalogue_id,data_as_of,last_updated,next_update,data_source,update_frequency,total},data:[…]}`. The `meta` parameter is not in the docs page; we observed it directly.

**Datasets relevant to spending, parliament and maps** (ids; source agency in brackets)
- Federal finance [JANM]: `federal_finance_year`/`_qtr` (revenue, OE, DE, balance, financing; annual from 1970), `_revenue`, `_oe` (OE by object), `_de` (DE by function), `_debt_mat` [BNM], and `lookup_federal_finance` (category/variable → EN/BM labels). Storage path `storage.data.gov.my/publicadmin/…`. This is aggregate data with **no ministry dimension**.
- Budget by ministry [MOF]: only `federal_budget_moe` (B/P.63) and `federal_budget_moh` (B/P.42), 2015–2027, by category.
- State finance [AUDIT]: `state_finance_expenditure`, `state_finance_revenue` (2022 only).
- Parliament / government: `parliament_sex` [Parlimen] (gender counts only, no names), `local_authority_sex` [KPKT] (lists local authorities by state), `government_apps*`.
- Geography reference: `population_state`, `population_district`, `population_parlimen` (222 seats, `P.001 Padang Besar` format), `population_dun` (600 seats, `N.01 Titi Tinggi`), 2020–2024 [DOSM]. `poskod` (postcode→city→state) [MCMC].
- Indicators by constituency [DOSM]: `hh_income_parlimen`/`_dun`, `hh_expenditure_*`, `hh_poverty_*`, `hh_inequality_*`, `lfs_parlimen`/`lfs_dun`. District level: `gdp_district_real_supply`, `crime_district`, `schools_district` and others.
- Election results are **not** in the current catalogue.

**archive.data.gov.my** (legacy CKAN portal, still online)
- CKAN API at `https://archive.data.gov.my/data/api/3/action/` (`package_list`, `package_search`, `package_show`). **12,338 packages from 403 organisations.** Licence field `cc-by`. Mostly BM. Metadata last modified 2019–2023, so treat it as stale.
- Useful but old: `parlimen-maklumat-ahli-parlimen-dewan-rakyat` (13th Parliament MPs, CSV/XLS), `senarai-bahagian-pilihanraya-parlimen-pru-14` (CSV/JSON), `keputusan-pilihan-raya-umum-ke-13`, per-ministry allocation files, `kontrak-pusat-kementerian-kewangan` (MOF central contracts list, 2018).

## 2. OpenDOSM (open.dosm.gov.my) and DOSM

| Item | Finding |
|---|---|
| URL | https://open.dosm.gov.my: catalogue, 23 dashboards (incl. **Kawasanku**: area profiles by state, district, parlimen and DUN), `/publications` |
| Size | 243 unique `/data-catalogue/` links on the catalogue page (HTML count, approximate). The OpenDOSM catalogue largely overlaps with the DOSM-sourced sets on data.gov.my. The meta repo holds 1,522 DOSM publication metadata files (`pub-dosm/publications`). |
| Delivery | CSV/Parquet at `storage.dosm.gov.my/<subject>/<id>.{csv,parquet}`. API `https://api.data.gov.my/opendosm?id=` (verified with `cpi_core`), same 4 req/min limit. |
| Licence | Dataset pages carry the same CC BY 4.0 text. DOSM's main portal Terms of Use (dosm.gov.my/portal-main/article/term-of-use) cites **Terms of Use Government Open Data 1.0** and General Circular 1/2015. It requires the attribution *"Data source: Department of Statistics Malaysia"* and prohibits presenting analysis as DOSM's, implying endorsement, intentionally misleading, or presenting outdated data as current. |
| Language | EN / BM |
| Update frequency | Per dataset. DOSM publishes an Advance Release Calendar (`arc_dosm`, daily). |
| Open source | `dosm-malaysia/opendosm-front` (MIT, pushed 2026-10). Backend is shared with `datagovmy-back`. `kawasanku-front` and `aksara-*` are MIT and inactive since 2023. |

## 3. Sibling dashboards by the same team

- **KKMNow**: https://data.moh.gov.my (MOH). Covers COVID cases and vaccination, bed utilisation, blood and organ donation, PeKa B40, MOH budget, and health expenditure accounts. Open source under `MoH-Malaysia`: `kkmnow-front`, `kkmnow-data` (MIT, active), `kkmnow-back` (MIT, 2022). Data repos `covid19-public`, `data-darah-public`, `data-organ-public`, `data-pekab40-public` have no SPDX licence.
- **data.gov.my dashboards**: around 22 live (e.g. income taxation, household debt, immigration, public transport). Dashboard configs are in `datagovmy-meta/dashboards/`.
- **ElectionData.MY**: https://electiondata.my. **Not a government site.** Curated pro bono by Thevesh Theva, an independent individual according to the About page. See §4.

## 4. Reference data for a spending and parliament app

**Ministries and agencies (codes)**
- No official open dataset lists ministries and agencies with codes. Searched data.gov.my (no such dataset) and the archive (`kod agensi` returned 0 hits).
- **Budget vote numbers are the practical key.** https://belanjawan.mof.gov.my/ms/perbelanjaan publishes Budget 2027 as one PDF per vote, e.g. `/pdf/belanjawan2027/perbelanjaan/BP.42.pdf`. Prefixes: `T.n` for charged expenditure (Tanggungan, T.1–T.14), `B.n` for supply only, `BP.n` for supply plus development, `P.70` for contingency reserve. The 2027 list has B.1 Parlimen … BP.6 JPM, BP.10 Perbendaharaan, BP.13–15, BP.20–28, BP.30, 31, 33, B.40, BP.42–48, BP.50 Kementerian Digital, BP.60–64. The data is PDF only, with no CSV.
- Change over time, from the same site's archived lists:

| Vote | Budget 2022 | Budget 2024 | Budget 2027 |
|---|---|---|---|
| BP.10 | Kementerian Kewangan | Perbendaharaan | Perbendaharaan |
| BP.15 | none | Kementerian Ekonomi | Kementerian Ekonomi |
| BP.23 | Kem. Tenaga dan Sumber Asli | Kem. Sumber Asli, Alam Sekitar dan Perubahan Iklim | Kem. Sumber Asli dan Kelestarian Alam |
| BP.32 | Kem. Wilayah Persekutuan | none | none |
| BP.33 | Kem. Alam Sekitar dan Air | none | Kem. Peralihan Tenaga dan Transformasi Air |
| BP.47 | Kem. Komunikasi dan Multimedia | Kem. Komunikasi dan Digital | Kem. Komunikasi |
| BP.50 | none | none | Kementerian Digital |

  Model votes as `(budget_year, vote_code) → ministry name`, not as a fixed code→ministry map. The same number can be retired and later reused for a different ministry, as BP.33 was.
- JANM accounting codes (Kod Kementerian/Jabatan, PTJ): only guides are public, e.g. anm.gov.my `kodjabatan.pdf` (2015). That guide says profile codes can change only at the start of a financial year, and that a new ministry gets a new profile while the old one is cancelled. The full list of codes is **not published** (**UNVERIFIED** beyond the anm.gov.my pages found).

**MPs and constituencies**
- parlimen.gov.my `ahli-dewan.html?uweb=dr` is an HTML list with seat codes (P001…). The legacy XLS link (`/data/ahlidewan-dr-semasa.xls`) returns 404. The site's TLS chain fails standard verification (curl error 60), so fetchers need a CA bundle fix. Hansard is published as PDFs at `/hansard-dewan-rakyat.html`.
- Constituency codes and names: DOSM `population_parlimen` (222) and `population_dun` (600), via CSV.
- Pending change: the Sarawak DUN passed a bill in July 2025 to go from 82 to 99 seats. As of Aug–Sep 2026 press reports, EC redelineation was pending and polls could proceed on 82 seats (Malay Mail, Borneo Post). Final status is **UNVERIFIED**, so DUN reference data must be versioned by delimitation.

**Election results**
- SPR (spr.gov.my): official results are published as gazette notices in PDF (e.g. KM Bil 55/2022 for GE15). https://dashboard.spr.gov.my ("Dashboard Keputusan") is a JS app with no documented download or API (**UNVERIFIED**).
- archive.data.gov.my: GE13 results and the GE14 seat list (CC-BY, stale).
- **ElectionData.MY**: results from 1955 onward for GE, all state elections and by-elections, at seat level and saluran (polling-stream) level for GE12–GE15. It also has delimitation boundaries 1954–2026 (GeoJSON/GeoParquet/FlatGeobuf, served as static files only), anonymised voter rolls, and candidates and parties. Licence: *"Dedicated to the Public Domain (CC0)"*. API: free, *"no hard rate limit"*, needs an API key from its console. Results are typically finalised 1–3 months after an election. Precursor code repo `Thevesh/analysis-election-msia` is GPL-3.0 and inactive since 2023.

## 5. Legal context (what the sources say)

**Copyright Act 1987 (Act 332).** Text read from the 2013 reprint (govdocs.sinarproject.org mirror); later amendments not checked.
- s.3, "literary work": includes *"tables or compilations"* but *"does not include official texts of the Government or statutory bodies of a legislative or regulatory nature, or judicial decisions, or political speeches and political debates … and the official translation thereof"*. Statutes, regulations, judgments, and political speeches and debates (arguably including Hansard) therefore fall outside literary-work copyright.
- s.11(1): *"Copyright shall subsist in every work which is eligible for copyright and which is made by or under the direction or control of the Government"* and prescribed government organisations. s.12: the responsible Ministry or Department administers it. s.23: the term is 50 years from the year after first publication. Budget documents, reports and statistical tables are therefore Crown-style copyright works unless released under an open licence.
- s.7(2A): no protection for *"any idea, procedure, method of operation or mathematical concept as such"*.
- s.13(2)(a): fair dealing for *"research, private study, criticism, review or the reporting of news or current events"*, with acknowledgement of title and authorship. s.13(2A) lists the four fairness factors. s.13(2)(l) covers use for proceedings of a legislative body or government inquiry.

**Open-data policy**
- *Pekeliling Am Bil. 1 Tahun 2015 – Pelaksanaan Data Terbuka Sektor Awam* (JPM/MAMPU, 30 Sep 2015). It is linked from the data.gov.my footer: `dasar.jdn.gov.my/search-g/download-file/25/…`.
  - Lampiran B, **Terma Penggunaan Data Terbuka Kerajaan 1.0**, permits use free of charge. Users may copy, publish, distribute, adapt, use commercially and non-commercially, and combine with other data.
  - Users MUST state the source as specified by the data owner and link to the Terms. If the owner gives no statement, use: *"Data dan maklumat tertakluk di bawah Terma Penggunaan Data Terbuka Kerajaan Malaysia 1.0"*.
  - The Terms grant no rights over personal data, official names/crests/logos, royal and military insignia, third-party rights, patents/trademarks/designs, or identity documents.
  - The data is provided as-is with no warranty, and the data owner remains its principal owner.
  - Agencies must assess data against the *Akta Rahsia Rasmi* and *Arahan Keselamatan* before release (para on penilaian data).

**Official Secrets Act 1972 (Act 88).** The official AGC text was not fetched; summary from a secondary transcription (lexborneoofficialsecrets.blogspot.com) and press. Treat the details as **UNVERIFIED** until checked against the AGC reprint.
- s.2: an "official secret" is a Schedule document (Cabinet and State Executive Council documents and deliberations; national security, defence and international relations documents) or material classified Top Secret/Secret/Confidential/Restricted under s.2B. s.2C allows declassification. s.8 criminalises wrongful communication and also *receiving* an official secret knowing it was communicated in breach.
- Officially published documents (budget books, gazettes, Hansard, open-data releases) have by definition gone through the publication path above. OSA risk applies to leaked or classified material, not to republishing what the government itself published. This is an inference, not a source statement.
- FOI Bill 2026: first reading on 13 Jul 2026, then referred to a Parliamentary Special Select Committee. Article 19 (17 Aug 2026) says it *"preserves the supremacy of secrecy laws such as the OSA"* and risks *"criminalising the subsequent use of lawfully obtained information"*. Clause text **UNVERIFIED**; watch this if the project uses FOI-obtained data.

**PDPA 2010 (Act 709).** Text read from the official BM reprint as at 15 Sep 2026 (pdp.gov.my).
- s.2(1): applies to persons processing personal data *"berkenaan dengan transaksi komersial"*. s.4 defines a commercial transaction as any transaction of a commercial nature, including supply or exchange of goods or services, agency, investment, financing, banking and insurance.
- s.3(1): does not apply to the Federal and State Governments. Whether a non-commercial civic project is processing data "in respect of commercial transactions" is a judgement question, not settled by the text. Donations, ads or paid tiers could change the analysis (inference).
- s.45(2)(f): data processed only for journalistic, literary or artistic purposes is exempt from the General, Notice & Choice, Disclosure, Retention, Data Integrity and Access principles. Conditions: processing is with a view to publication, the controller reasonably believes publication is in the public interest, and the controller reasonably believes compliance is incompatible with that purpose.
- Relevance: names of MPs and contract awardees that are already officially published are still personal data. The Terms of Use 1.0 also grant no rights over personal data.

## 6. Licence compliance checklist (derived from §1, §2, §5)

1. Per figure, cite the data owner agency (e.g. "JANM via data.gov.my", or "Data source: Department of Statistics Malaysia" for DOSM), the dataset URL and the retrieval date.
2. Link both CC BY 4.0 and the Government Open Data Terms of Use 1.0 in the site footer and in each dataset's provenance.
3. Do not use government crests or logos. Do not imply endorsement, and label stale data with its `data_as_of`.
4. Budget-book PDFs (MOF) and Parliament material carry no stated open licence (**UNVERIFIED**: their sites' terms were not fetched). Rely on s.3 (official texts, debates) and s.13(2)(a) fair dealing as described, or seek permission.
