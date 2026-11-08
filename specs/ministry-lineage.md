# Ministry lineage by vote number, FY2016–Budget 2027

Status: research, 5 Nov 2026. No code changed. Data: local `buildmalaysia` database (JANM statements FY2016–FY2025, MOF budget books 2025–2027).

## 0. Findings

1. **63 printed-name transitions.** Of 87 vote codes, 45 either change name or are missing in some year. Counting B and P codes separately, the 63 transitions are:

   | Type | Count |
   |---|---|
   | Printing variants of an unchanged name | 10 |
   | Parser artifact | 1 |
   | Renames of the same body | 26 |
   | Renames that came with functions moving between votes | 22 |
   | Transitions where a number is reused for a different ministry (2 numbers × B and P) | 4 |

   **Numbers that appear or vanish.** On top of these transitions:
   - Five numbers appear: B/P.14, B/P.15, B/P.26, B/P.33 and B/P.50.
   - Five vanish for at least one year: B/P.15 (FY2021–2022), B/P.29, B/P.32, B/P.33 (FY2023) and B/P.64 (FY2019).

   **Evidence.** 60 of the 63 classifications rest on a primary source: a gazette order, a budget-book note or masthead, or the JANM statement itself. Three are Medium confidence: T.08, B.40 and T.10. Separately, three agency-level moves are data-only or UNVERIFIED: E1c corridors, E1h and E6b in §3.
2. **Two vote numbers are reused for different ministries.** The site currently merges each pair into one ministry page:
   - **B/P.15**: Kementerian Hal Ehwal Ekonomi (MEA), FY2018–2020, then nothing in FY2021–2022 (P.15 FY2021 is printed with zero), then Kementerian Ekonomi from FY2023. The MOF budget book calls the second a new ministry: "Kementerian Ekonomi diwujudkan pada tahun 2023".
   - **B/P.33**: Kementerian Alam Sekitar dan Air (KASA), FY2020–2022. KASA was dissolved into B.23 in 2023. The number was reused from FY2024 for Kementerian Peralihan Tenaga dan Transformasi Air (PETRA), and the Budget 2025 book prints KASA's 2022 actual on PETRA's row.
3. **Water, energy and environment have each moved three or four times.** The functions behind B.23, B.29, B.30 and B.33 are never the same from one government to the next (§3, E2–E5). No single vote number gives a like-for-like series for any of these portfolios.
4. **Each transition year is split between two votes.** In FY2018, FY2020 and FY2024 the JANM statement prints the same agency under both the old and the new vote, each with part of the year's spending. For example, in FY2018 the Unit Perancang Ekonomi is under B.06 (RM23.2m) and B.15 (RM25.5m), and MARA is under B.22 (RM722.5m) and B.15 (RM493.7m). A lineage edge therefore needs an effective date, not just a year.
5. **The printed vote name does not always follow the gazetted name.** From 3 Dec 2022 to 12 Dec 2023 the gazette named the housing ministry "Kementerian Pembangunan Kerajaan Tempatan" (P.U.(A) 27/2023, reversed by P.U.(A) 20/2024), but B.43 is printed "KEMENTERIAN PERUMAHAN DAN KERAJAAN TEMPATAN" throughout. Aliases must come from both the gazette and the printed sources.
6. **The "fastest growth" finding is reorganisation-sensitive, and its same-name guard does not catch moves.**
   - **FY2021:** KPT is ranked #2 at +105%. KPT was re-created in March 2020, so FY2020 is a partial year, and JANM FY2020 notes the KPM→KPT project transfer.
   - **FY2024:** JPA is the top finding at +65%. The Budget 2026 book flags B.07 as affected by "penyusunan semula Kementerian tahun 2024". However, the JANM data puts almost all of the increase in one activity of programme 030000 (RM197m → RM1,195m), not in the moved unit (programme 060000, RM5m). So reorganisation explains little of this jump. Whether it is a reorganisation at all is UNVERIFIED.

## 1. Sources

Source keys used in the tables below.

| Key | Document | URL |
|---|---|---|
| J16–J25 | JANM, Penyata Kewangan Kerajaan Persekutuan FY2016–FY2025 | URLs in `pipeline/src/pipeline/sources.py`, e.g. J23 <https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2023_Penyata_Kewangan_Kerajaan_Persekutuan.pdf>, J20 <https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2020_PENYATA_KEWANGAN_KERAJAAN_PERSEKUTUAN.pdf> |
| AP25/26/27 | MOF, Anggaran Perbelanjaan Persekutuan 2025/2026/2027 | <https://belanjawan.mof.gov.my/pdf/belanjawan2025/perbelanjaan/Anggaran_Perbelanjaan_Persekutuan_2025.pdf> (same pattern for 2026 and 2027) |
| BB*yyyy*-*nn* | MOF per-vote budget chapter for Budget *yyyy*, vote *nn* | 2018: `https://www.mof.gov.my/portal/arkib/perbelanjaan/2018/B.nn.pdf`; 2019: `https://govdocs.sinarproject.org/documents/ministry-of-finance/budget/2019-anggaran-perbelanjaan-persekutuan/b-nn_p-nn.pdf` (mirror); 2021: `https://belanjawan.mof.gov.my/pdf/2021/perbelanjaan/BP.nn.pdf`; 2023 (re-tabled Feb 2023): `https://belanjawan.mof.gov.my/pdf/belanjawan2023/perbelanjaan/BP.nn.pdf`; 2025: `https://belanjawan.mof.gov.my/pdf/belanjawan2025/perbelanjaan/BP.nn.pdf` |
| G *n*/*yyyy* | Perintah Menteri-Menteri Kerajaan Persekutuan, P.U.(A) *n*/*yyyy*, made under Akta Fungsi-Fungsi Menteri 1969 [Akta 2] | Base `https://lom.agc.gov.my/ilims/upload/portal/akta/outputp/`. G 27/2023 `1767004/PUA27.pdf`; G 184/2023 `1826105/PUA%20184%20(2023).pdf`; G 361/2023 `1902655/PUA%20361.pdf`; G 20/2024 `1997060/PUA20_2024.pdf`; G 21/2024 `1997045/PUA%2021.pdf`; G 111/2024 `2097315/PUA%20111.pdf`; G 146/2025 `2848747/PUA%20146.pdf`; G 383/2021 `1711444/MFO%20(No.%203)%202021%20PUA%20383.pdf`; G 5/2022 `1720047/PUA%205.pdf` |

The gazette PDFs I downloaded and read: 383/2021, 5/2022, 27/2023, 184/2023, 361/2023, 20/2024, 21/2024, 111/2024 and 146/2025. The 2018–2020 orders were located but not read, because lom returns HTTP 500 for those paths:

| Order | Date | Content |
|---|---|---|
| G 125/2018 | 22 May 2018 | Interim order |
| G 132/2019 | 14 May 2019 | Full 2018–2019 schedule |
| G 77/2020 | 28 Feb 2020 | Interim order |
| G 84/2020 | 4 Mar 2020 | Interim order |
| G 201/2020 | 9 Jul 2020 | Full 2020 schedule |

A third-party mirror of their text is at `https://mylaw.my/legislation/perintah-menteri-menteri-kerajaan-persekutuan-<suffix>`. They are cited below only as the instrument, never for content.

## 2. Printed-name timeline per vote number

These are the codes whose printed name changed or that are missing in some year. The other 42 of the 87 codes have the same name in every source FY2016–Budget 2027. An unchanged name does not mean unchanged functions: B.06 (JPM) gained and lost agencies in every reorganisation (§3).

"FY" is a JANM statement year, and "Budget" is the budget book for that year. **Type** classifies the change from the row above:

| Type | Meaning |
|---|---|
| V | Printing variant only |
| a | Same body, renamed |
| b | Functions moved between ministries (create, split, merge, dissolve) |
| c | Number reused for a different body |
| R | Residual vote printed with zero after the body ended |
| D | Our parser or data artifact |

**Confidence:**
- **High**: a primary source (gazette, budget-book note or masthead, or JANM note or data) states or shows the change.
- **Medium**: a secondary source or data alone.
- **UNVERIFIED**: no source found.

The E-numbers point to the events in §3.

| Vote | Years | Printed name | Type | Evidence | Confidence |
|---|---|---|---|---|---|
| B.01 | FY2016–2025 | PARLIMEN | — | | |
| B.01 | Budget 2025–2027 | Parlimen Malaysia / PARLIMEN MALAYSIA | V | AP25 p34, AP26 p35 (budget book prints the full name) | High |
| B.10 | FY2016–2025, Budget 2025 | PERBENDAHARAAN | — | | |
| B.10 | Budget 2026–2027 | KEMENTERIAN KEWANGAN / Perbendaharaan | V | AP26 p37, AP27 p37 | High |
| P.10 | FY2016–2025 | PERBENDAHARAAN | — | | |
| P.10 | Budget 2025 | KEMENTERIAN KEWANGAN | V | AP25 vote summary (differs from B.10's heading in the same book) | High |
| P.10 | Budget 2026–2027 | KEMENTERIAN KEWANGAN / Perbendaharaan | V | AP26, AP27 | High |
| B/P.14 | FY2020–2025, Budget 2025–2027 | KEMENTERIAN PERPADUAN NEGARA | b (new) | E7. Created 10 Mar 2020; JPNIN moved from B.06 (J20 p113 B.06, p133 B.14) | High |
| B.15 | FY2018–2020 | KEMENTERIAN HAL EHWAL EKONOMI | b (new) | E1. Created 12 May 2018 from JPM (EPU, DOSM, TERAJU) and KPLB (RISDA, MARA for part of 2018) | High |
| P.15 | FY2018–2021 | KEMENTERIAN HAL EHWAL EKONOMI | R (FY2021) | P.15 FY2021 printed with zero estimate and actual (development_printed_total) | High |
| B/P.15 | FY2023–2025, Budget 2025–2027 | KEMENTERIAN EKONOMI | c | E10. AP25 p36 note 1: "B/P.15 - Kementerian Ekonomi diwujudkan pada tahun 2023"; Budget 2025 book prints B.15 2022 actual = 0 | High |
| B/P.20 | FY2016–2017 | KEMENTERIAN PERUSAHAAN PERLADANGAN DAN KOMODITI | — | | |
| B/P.20 | FY2018–2019 | KEMENTERIAN INDUSTRI UTAMA | a | E1. BB2019-20 masthead; Malay Mail 2 Jul 2018: "The Ministry of Primary Industries is the new ministry taking over the functions of the previous Ministry of Plantation Industries and Commodities". Minor gain: activity "PEMBANGUNAN KOMODITI" moves B.21→B.20 (J18) | High |
| B/P.20 | FY2020–2022 | KEMENTERIAN PERUSAHAAN PERLADANGAN DAN KOMODITI | a | BB2021-20 masthead | High |
| B/P.20 | FY2023–2025, Budget 2025–2027 | KEMENTERIAN PERLADANGAN DAN KOMODITI | a | BB2023-20 masthead; G 27/2023 | High |
| B/P.21 | FY2016–2019 | KEMENTERIAN PERTANIAN DAN INDUSTRI ASAS TANI | — | | |
| B/P.21 | FY2020–2022 | KEMENTERIAN PERTANIAN DAN INDUSTRI MAKANAN | a | BB2021-21 masthead | High |
| B/P.21 | FY2023–2025, Budget 2025–2027 | KEMENTERIAN PERTANIAN DAN KETERJAMINAN MAKANAN | a | BB2023-21 masthead; G 27/2023 | High |
| B/P.22 | FY2016–2017 | KEMENTERIAN KEMAJUAN LUAR BANDAR DAN WILAYAH | — | | |
| B/P.22 | FY2018–2022 | KEMENTERIAN PEMBANGUNAN LUAR BANDAR | b | E1. Renamed; RISDA to B.15 (2018–2020); MARA to B.15 for part of FY2018 only (J18 p122 B.15 RM493.7m, p131 B.22 RM722.5m). The Star, 2 Sep 2018: MARA placed back "under the Rural Development Ministry". BB2018-22 / BB2019-22 mastheads | High |
| B/P.22 | FY2023–2025, Budget 2025–2027 | KEMENTERIAN KEMAJUAN DESA DAN WILAYAH | a | BB2023-22 masthead; G 27/2023 | High |
| B/P.23 | FY2016–2017 | KEMENTERIAN SUMBER ASLI DAN ALAM SEKITAR | — | | |
| B/P.23 | FY2018–2019 | KEMENTERIAN AIR, TANAH DAN SUMBER ASLI | b | E2. Environment out to B.30, water in from B.29 | High |
| B/P.23 | FY2020–2022 | KEMENTERIAN TENAGA DAN SUMBER ASLI | b | E3. Water, sewerage and JPS out to B.33; energy in from B.30 | High |
| B/P.23 | FY2023 | KEMENTERIAN SUMBER ASLI, ALAM SEKITAR DAN PERUBAHAN IKLIM | b | E4. Absorbs B.33 (environment, water). J23 p261 note (1); AP25 p39 note 4 | High |
| B/P.23 | FY2024–2025, Budget 2025–2027 | KEMENTERIAN SUMBER ASLI DAN KELESTARIAN ALAM | b | E5. Energy and water out to the new B.33. AP25 p37 note 2: "Nama Kementerian Sumber Asli dan Kelestarian Alam pada tahun 2023 adalah Kementerian Sumber Asli, Alam Sekitar dan Perubahan Iklim"; G 20/2024 | High |
| B.24 | FY2016–2022 | KEMENTERIAN PERDAGANGAN ANTARABANGSA DAN INDUSTRI | — | | |
| P.24 | FY2016–2022 | … INDUSTRI (MITI) | V | JANM P-vote heading carries the acronym | High |
| B/P.24 | FY2023–2025, Budget 2025–2027 | KEMENTERIAN PELABURAN, PERDAGANGAN DAN INDUSTRI | a | G 184/2023, in force 5 Apr 2023: "Kementerian Perdagangan Antarabangsa dan Industri" → "Kementerian Pelaburan, Perdagangan dan Industri". MITI release 12 Apr 2023 <https://www.miti.gov.my/miti/resources/Media%20Release/SIARAN_MEDIA_PENJENAMAAN_SEMULA_KEMENTERIAN_PERDAGANGAN_ANTARABANGSA_DAN_INDUSTRI.pdf> names no transferred agencies | High |
| B.25 | FY2016–2017 | KEMENTERIAN PERDAGANGAN DALAM NEGERI, KOPERASI DAN KEPENGGUNAAN | — | | |
| P.25 | FY2016–2017 | … KOPERASI & KEPENGGUNAAN | V | "&" for "DAN" | High |
| B/P.25 | FY2018–2022 | KEMENTERIAN PERDAGANGAN DALAM NEGERI DAN HAL EHWAL PENGGUNA | b | E1. Cooperatives (SKM, MKM) out to B.26 (J18 p143 B.25, p147 B.26); BB2019-25 masthead | High |
| B/P.25 | FY2023–2025, Budget 2025–2027 | KEMENTERIAN PERDAGANGAN DALAM NEGERI DAN KOS SARA HIDUP | a | BB2023-25 masthead; G 27/2023 | High |
| B/P.26 | FY2018–2019 | KEMENTERIAN PEMBANGUNAN USAHAWAN | b (new) | E1. SME Corp from B.24, SKM and MKM from B.25 (J18 p141/p143/p147); BB2019-26 | High |
| B/P.26 | FY2020–2025, Budget 2025–2027 | KEMENTERIAN PEMBANGUNAN USAHAWAN DAN KOPERASI | a | BB2021-26 masthead; exact 2020 date not found | High (date Medium) |
| B.29 | FY2016–2018 | KEMENTERIAN TENAGA, TEKNOLOGI HIJAU DAN AIR | b (ends) | E2. Dissolved Jul 2018 | High |
| P.29 | FY2016–2021 | KEMENTERIAN TENAGA, TEKNOLOGI HIJAU DAN AIR | R (FY2019–2021) | P.29 printed with zero estimate and actual in FY2019–2021 | High |
| B/P.30 | FY2016–2017 | KEMENTERIAN SAINS, TEKNOLOGI DAN INOVASI | — | | |
| B/P.30 | FY2018–2019 | KEMENTERIAN TENAGA, SAINS, TEKNOLOGI, ALAM SEKITAR DAN PERUBAHAN IKLIM | b | E2 | High |
| B/P.30 | FY2020–2025, Budget 2025–2027 | KEMENTERIAN SAINS, TEKNOLOGI DAN INOVASI | b | E3. Energy out to B.23, environment out to B.33 | High |
| B.31 | FY2016–2017 | KEMENTERIAN PELANCONGAN DAN KEBUDAYAAN | — | | |
| P.31 | FY2016 | KEMENTERIAN PELANCONGAN | V | JANM FY2016 P-vote heading only; B.31 the same year has the full name | High |
| P.31 | FY2017 | KEMENTERIAN PELANCONGAN DAN KEBUDAYAAN | V | | High |
| B/P.31 | FY2018–2025, Budget 2025–2027 | KEMENTERIAN PELANCONGAN, SENI DAN BUDAYA | a | PNM Pelan Strategik 2024–2028 timeline "Jul 2018 … Kementerian Pelancongan, Seni dan Budaya" <https://www.pnm.gov.my/pnm/resources/UploadFile/Maklumat%20Korporat/Pelan%20Strategik%20PNM/eBOOK%20PSPNM%202024-2028C.pdf>; BB2019-31. Libraries, archives and museums out to B.14 in Dec 2022 (E9) | High |
| B/P.32 | FY2016–2022 (Budget 2025 rows) | KEMENTERIAN WILAYAH PERSEKUTUAN | b (ends) | E8. AP25 p39 note 3: "B/P.32 - Kementerian Wilayah Persekutuan dibubar dan dipindahkan kepada Jabatan Perdana Menteri pada tahun 2023" | High |
| P.32 | FY2023–2025 | KEMENTERIAN WILAYAH PERSEKUTUAN | R | Printed with zero in FY2023–2025 | High |
| B/P.33 | FY2020–2022 | KEMENTERIAN ALAM SEKITAR DAN AIR | b (new) | E3 | High |
| P.33 | FY2023 | KEMENTERIAN ALAM SEKITAR DAN AIR | R | Printed with zero; AP25 prints B/P.33 2023 actual = 0 | High |
| B/P.33 | FY2024–2025, Budget 2025–2027 | KEMENTERIAN PERALIHAN TENAGA DAN TRANSFORMASI AIR | c | E5. Gazetted 12 Dec 2023 as "Kementerian Peralihan Tenaga dan Daya Guna Awam" (G 20/2024); renamed by G 111/2024 in force 7 Feb 2024. AP25 p39 note 4 prints KASA's 2022 actual on this row | High |
| P.33 | FY2024 | … TRANFORMASI AIR | V | JANM typo | High |
| B.40 | FY2016–2022 | SURUHANJAYA PERKHIDMATAN PELAJARAN | — | | |
| B.40 | FY2023–2025, Budget 2025–2027 | SURUHANJAYA PERKHIDMATAN PENDIDIKAN | a | Masthead changes between BB2021-40 (Nov 2020, "Pelajaran") and BB2022-40 (Oct 2021, "Pendidikan"). JANM prints the new name on T.10 from FY2022 but on B.40 only from FY2023. Instrument UNVERIFIED | Medium |
| T.10 | FY2016–2021 → FY2022+ | … PELAJARAN → … PENDIDIKAN | a | Same as B.40 | Medium |
| B.43 | FY2016–2017 | KEMENTERIAN KESEJAHTERAAN BANDAR, PERUMAHAN DAN KERAJAAN TEMPATAN | — | | |
| P.43 | FY2016 | KEMENTERIAN PERUMAHAN DAN KERAJAAN TEMPATAN | V | FY2016 P-vote heading only; B.43 that year has the full name | High |
| B/P.43 | FY2018–2025, Budget 2025–2027 | KEMENTERIAN PERUMAHAN DAN KERAJAAN TEMPATAN | b | E1. Urban wellbeing, PLANMalaysia and Landskap Negara out to B.32 (J18 p169 B.32); urban wellbeing back by Budget 2020, PLANMalaysia and landscape by Budget 2021 (BB2019-32, BB2021-43). Gazetted name 3 Dec 2022–12 Dec 2023 was "Kementerian Pembangunan Kerajaan Tempatan" (G 27/2023; G 20/2024 2(f)), never printed on the vote | High |
| B/P.47 | FY2016–2022 | KEMENTERIAN KOMUNIKASI DAN MULTIMEDIA | — | | |
| B/P.47 | FY2023 | KEMENTERIAN KOMUNIKASI DAN DIGITAL | a | G 27/2023 "Kementerian Komunikasi dan Digital"; AP25 p41 note 5 | High |
| B/P.47 | FY2024–2025, Budget 2025–2027 | KEMENTERIAN KOMUNIKASI | b | E6. Digital agencies out to B.50; J-KOM in from B.06. G 20/2024 | High |
| B/P.50 | FY2024–2025, Budget 2025–2027 | KEMENTERIAN DIGITAL | b (new) | E6. AP25 p41 note 6: "B/P.50 - Kementerian Digital diwujudkan pada tahun 2024"; G 20/2024, in force 12 Dec 2023 | High |
| B/P.64 | FY2016–2018 | KEMENTERIAN PENDIDIKAN TINGGI | — | | |
| B/P.64 | FY2019 | (absent) | b | E1. Merged into B.63 (J19: Universiti Malaya and others under B.63, p169); BB2019-63 "PROGRAM 6 : OPERASI PENDIDIKAN TINGGI"; no B.64 in Budget 2019 | High |
| B/P.64 | FY2020–2022 | KEMENTERIAN PENGAJIAN TINGGI | b | E7. Re-created 10 Mar 2020. Parliament written reply 178, 7 Dec 2020 <https://pardocs.sinarproject.org/documents/2020-november-december-parliamentary-session/written-replies-soalan-bertulis/20201207-p14m3p2-soalan-bukanlisan-178.pdf>; J20 p281 note: "sebahagian projek dari KPM dipindahkan kepada KPT" | High |
| B.64 | FY2023–2025, Budget 2025–2027 | KEMENTERIAN PENDIDIKAN TINGGI | a | BB2023-64 (Feb 2023) vs the Oct 2022 book; G 27/2023 "Kementerian Pendidikan Tinggi" | High |
| P.64 | FY2023 | KEMENTERIAN PENGAJIAN TINGGI | V | JANM FY2023 lags on the P-vote heading; P.64 changes from FY2024 | High |
| P.70 | FY2016–2025, Budget 2025 | SIMPANAN LUAR JANGKA | — | | |
| P.70 | Budget 2026–2027 | P.70 | D | Our parser took the code as the heading; source_text reads "P.70 Simpanan Luar Jangka" (AP26 p45, AP27 p44) | High |
| T.05, T.06 | FY2016–2019 → FY2020+ | YANG DI - PERTUA … → YANG DI-PERTUA … | V | Spacing only | High |
| T.08 | FY2016–2017 | SURUHANJAYA PERKHIDMATAN PERUNDANGAN | — | | |
| T.08 | FY2018–2025, Budget 2025–2027 | SURUHANJAYA PERKHIDMATAN KEHAKIMAN DAN PERUNDANGAN | V | Budget T.8 books for 2017, 2018, 2020, 2022 and 2023 all print the full name with "Perkara 138(2) Perlembagaan Persekutuan" (e.g. `https://www.mof.gov.my/portal/arkib/perbelanjaan/2018/T.8.pdf`). The FY2016–2017 JANM heading is a truncation, not a rename | Medium |

The P rows that mirror their B rows exactly (P.14, P.20–P.23, P.26, P.30, P.47, P.50) are folded into the "B/P" rows. B.14, B.26, B.50 and the second B.15/B.33 periods are creations, so they have no "previous" name.

**Counts.** The 63 transitions in §0 are counted per code, B and P separately:

| Type | Count | Codes |
|---|---|---|
| V | 10 | B.01, B.10, P.10 ×2, P.31 (2016→17), P.33 (typo fix), P.43 (2016→17), T.05, T.06, T.08 |
| D | 1 | P.70 |
| a | 26 | B/P.20 ×3, B/P.21 ×2, B/P.22 (2023), B/P.24, B/P.25 (2023), B/P.26, B.31, P.31 (2017→18), B.40, B/P.47 (2023), B/P.64 (2023/2024), T.10 |
| b | 22 | B/P.22 (2018), B/P.23 ×4, B/P.25 (2018), B/P.30 ×2, B/P.43 (2018), B/P.47 (2024), B/P.64 (2020) |
| c | 4 | B/P.15, B/P.33 |

UNVERIFIED items:
- The instrument for the B.40/T.10 rename.
- Whether T.08 FY2016–2017 is only a truncation (the Art. 138 Malay text was not read).
- The exact date of the 2020 B.20, B.21 and B.26 renames.
- The exact date of the Dec 2022 B.20, B.21, B.22 and B.25 renames. G 27/2023 confirms the names by 20 Jan 2023.

## 3. Reorganisation events (lineage edges)

Each row is an edge from a predecessor body to a successor body. **Whole** means the entire predecessor became the successor. Otherwise the named functions moved, and the share is computed from the data (§4), never typed in.

| Event | Effective | Instrument | From → To | Functions moved | Whole? | Evidence | Confidence |
|---|---|---|---|---|---|---|---|
| E1a | 12 May 2018 | G 125/2018 (interim), G 132/2019 (schedule) | JPM B.06 → MEA B.15 (new) | EPU/UPE, DOSM, TERAJU | no | MEA media statement, 17 Jan 2019: "ditubuhkan pada 12 Mei 2018 bagi mengambil alih peranan dan fungsi … Unit Perancang Ekonomi (EPU), Jabatan Perdana Menteri" <https://ekonomi.gov.my/sites/default/files/2020-03/69-%20Kementerian%20Hal%20Ehwal%20Ekonomi%20Sebagai%20Kementerian%20Peneraju%20Pembangunan%20Sosioekonomi.pdf>; J18 p98 (UPE under B.06), p121 (under B.15) | High |
| E1b | 2018 | as E1a | KKLW B.22 → MEA B.15 | RISDA (2018–2020). MARA for part of FY2018 only | no | BB2019-15 "Aktiviti 4 … (RISDA)"; The Star, 2 Sep 2018 <https://www.thestar.com.my/news/nation/2018/09/02/dr-m-mara-will-not-be-split-up-agency-back-to-rural-development-ministry-where-it-originally-belonge/>; J18 p122/p131 | High |
| E1c | 2018 | as E1a | JPM B.06 → MOF B.10 | UKAS; corridor authorities (ECERDC, NCIA, RECODA, IRDA, SEDIA) printed under B.10 in FY2018 and FY2020 | no | UKAS: BB2019-10 "Aktiviti 5: Unit Kerjasama Awam Swasta (UKAS)". Corridors: J18 p113, J20 p123–124 only. No external source says the authorities were transferred | UKAS High; corridors Medium (data only) |
| E1d | Jul 2018 | as E1a | KPDNKK B.25 → MED B.26 (new); MITI B.24 → MED B.26 | SKM and MKM; SME Corp | no | BB2019-26 lists SME Corp, TEKUN, SKM, MKM; J18 p141, p143, p147 | High |
| E1e | 2018 | as E1a | KKBPKT B.43 → KWP B.32 | Urban wellbeing, PLANMalaysia, Landskap Negara (returned 2019–2020, E7c) | no | BB2019-32 "Aktiviti 5 : Kesejahteraan Bandar", "Aktiviti 3 : Perancangan Bandar dan Desa", "Aktiviti 4 : Landskap Negara"; J18 p169 | High |
| E1f | 2018 | as E1a | KPT B.64 → KPM B.63 | Whole ministry (merged); B.64 absent FY2019 | yes | BB2019-63; J19 p169 | High |
| E1g | Jul 2018 | as E1a | JPM B.06 → KDN B.62 (APMM, ESSCOM); → MOT B.28 (SPAD, replaced by APAD); → KSM B.46 (TalentCorp) | Named agencies | no | The Star, 2 Jul 2018 <https://thestar.com.my/news/nation/2018/07/02/macc-and-ec-to-report-to-parliament-seven-others-answerable-to-august-house-as-agencies-under-pms-de>; The Star, 7 Jun 2018 (APAD); Malay Mail, 24 Jan 2019 (TalentCorp); BB2019-62 | High |
| E1h | 2018 (part-year) | not found | MOTAC B.31 → KPM B.63; JPM B.06 → KKMM B.47 | Arkib Negara and Perpustakaan Negara (J18 p212–213, about half of FY2018 spending under B.63); MAMPU (J18 p192, about half of FY2018 under B.47). Both are back under B.31 and B.06 from FY2019 | no | JANM FY2018 data only. The PNM strategic plan (above) says PNM was with tourism from Jul 2018 and does not mention MOE. The Budget 2019 JPM book lists MAMPU under JPM | UNVERIFIED (conflicting sources) |
| E2 | 2 Jul 2018 | as E1a | KeTTHA B.29 → MESTECC B.30 (energy, green tech, MGTC) and KATS B.23 (water); NRE B.23 → MESTECC B.30 (environment, climate); MOSTI B.30 → MESTECC (whole) | as stated | KeTTHA dissolved; B.29 ends FY2018, P.29 residual to FY2021 | MOSTI "Mengenai Kami": "the whole component of … (MOSTI), the components of the energy and green technology from … (KeTTHA) and related components of climate change and environment of … (NRE) has been reorganized and formed … (MESTECC)" <https://www.mosti.gov.my/en/mengenai-kami/>; MESTECC report card "Hari Pertama 2 Julai 2018" <https://www.mosti.gov.my/wp-content/uploads/repository/penerbitan/2019/Kad%20Laporan%20MESTECC%20Julai%202018-Oktober%202019.pdf>; PETRA Pelan Strategik 2026–30 timeline "KETTHA → MESTECC & KATS (Julai 2018)" <https://www.petra.gov.my/uploads/content-downloads/file_20260203170716.pdf>; J18 p139/p158 (Bekalan Air under both B.23 and B.29) | High |
| E3 | 10 Mar 2020 (KAS); water added 2 Apr 2020 | G 84/2020 (interim), G 201/2020 (schedule) | MESTECC B.30 → MOSTI B.30 (rename back), → KeTSA B.23 (energy), → KASA B.33 (environment, MetMalaysia, MGTC); KATS B.23 → KASA B.33 (water, sewerage, JPS, NAHRIM) | as stated | no | MOSTI page above: "MESTECC has been re-structured and its name was changed to … (MOSTI) following the Formation of the Cabinet … announced on 9 March 2020"; Malaysiakini, 2 Apr 2020 <https://www.malaysiakini.com/news/518354>; BB2021-23, BB2021-33; J20 p281 note: "sebahagian projek dari MOSTI dipindahkan kepada KETSA dan KASA kesan daripada penyusunan semula (MDM) kementerian" | High |
| E4 | 3 Dec 2022 | G 370/2022 (interim), G 27/2023 | KASA B.33 → NRECC B.23 (whole); KeTSA B.23 → NRECC B.23 (rename + absorb) | Environment, water, JPS, MetMalaysia, MGTC; energy stays | KASA whole | AP25 p39 note 4: "B/P.33 - Kementerian Alam Sekitar dan Air dibubar dan dipindahkan kepada B/P.23 - Kementerian Sumber Asli, Alam Sekitar dan Perubahan Iklim pada tahun 2023"; J23 p261 note (1): "projek di bawah … Kementerian Alam Sekitar dan Air dipindahkan kepada … Kementerian Sumber Asli, Alam Sekitar dan Perubahan Iklim kesan daripada penyusunan semula (MDM)"; G 27/2023 lists JAS, MetMalaysia, JPP, JPS, MGTC and Suruhanjaya Tenaga under NRECC | High |
| E5 | 12 Dec 2023 | G 20/2024, G 21/2024; name G 111/2024 (7 Feb 2024) | NRECC B.23 → NRES B.23 (rename); NRECC B.23 → PETRA B.33 (new, number reused) | To PETRA: JPP, JPS, NAHRIM, IWK, PAAB, SPAN, Bahagian Bekalan Air, MyPower, SEDA, Suruhanjaya Tenaga. MGTC listed under PETRA then moved to NRES (G 21/2024 2(b), 2(f)) | no | G 20/2024 2(c), 2(l); G 111/2024 2(b); PETRA plan: "PETRA telah ditubuhkan pada 12 Disember 2023 … Pada 8 Februari 2024 … perubahan nama"; J24 p171 (Bekalan Air under B.33) and p149 (under B.23) | High |
| E6 | 12 Dec 2023 | G 20/2024, G 21/2024, G 111/2024 | KKD B.47 → KD B.50 (new); JPM B.06 → KD B.50 (MAMPU, renamed JDN); JPM B.06 → KK B.47 (J-KOM) | JPDP, MYNIC, MDEC, DNB, CyberSecurity Malaysia, MyDIGITAL Corporation (from Kementerian Ekonomi) | no | digital.gov.my: "officially established on December 12, 2023" <https://www.digital.gov.my/en-GB/profil-kementerian>; FMT, 10 Jan 2024 <https://www.freemalaysiatoday.com/category/nation/2024/01/10/dnb-cybersecurity-malaysia-now-under-digital-ministry>; Sinar Harian, 13 Dec 2023 (J-KOM) <https://www.sinarharian.com.my/ampArticle/639488>; J24 p186/p192 (CSM under both B.47 and B.50), p114/p187 (J-KOM under both B.06 and B.47) | High |
| E6b | 2024 | Budget 2026 book footnote | ? → B.07, B.15, B.21, B.23, B.45, B.47, B.50, B.62 | AP26 pages for these votes (book pp. 129, 209, 227, 261, 431, 453, 479, 501) footnote: "Perbelanjaan sebenar tahun 2023 adalah tidak termasuk penyusunan semula Kementerian tahun 2024". For B.07, JANM FY2024 adds programme 060000 "Pemodenan Tadbiran dan Perancangan" (p121). The units behind B.21, B.45 and B.62 are not identified | no | AP26 p140 etc. | UNVERIFIED (which units) |
| E7a | 10 Mar 2020 | G 84/2020, G 201/2020 | JPM B.06 → KPN B.14 (new) | JPNIN | no | Parliament oral reply 11, 13 Jul 2020: "Sejak ditubuhkan pada 10 Mac 2020, Kementerian Perpaduan Negara…" <https://pardocs.sinarproject.org/documents/2020-july-august-parliamentary-session/oral-questions-soalan-lisan/2020-07-13-parliamentary-replies/20200713-par14s3m2-soalan-lisan-11.pdf>; BB2021-14; J20 p113/p133 | High |
| E7b | 10 Mar 2020 | as E7a | KPM B.63 → KPT B.64 (re-created) | Higher education: universities, polytechnics | no | Parliament reply 178 (above); J20 p281 note; J20 p199/p203 (UM under both B.63 and B.64) | High |
| E7c | 2019–2020 | not found | KWP B.32 → KPKT B.43 | Urban wellbeing (by Budget 2020), PLANMalaysia and landscape (by Budget 2021) | no | Budget 2020 B.43 and B.32 chapters; BB2021-43 | High (dates Medium) |
| E7d | 2020 | G 201/2020 | MEA B.15 → JPM B.06 (EPU, DOSM); MEA B.15 → KPLB B.22 (RISDA); MOF B.10 → JPM B.06 (UKAS, corridors, by FY2021–2022) | MEA dissolved; B.15 absent FY2021–2022, P.15 residual FY2021 | MEA whole (split) | ekonomi.gov.my history: "The EPU was re-established as an agency under the Prime Minister's Department following the formation of the new Cabinet on 10 March 2020" <https://ekonomi.gov.my/en/department-profile/profile/history>; BB2021-22 (RISDA); Budget 2022 JPM chapter lists UPE, DOSM, UKAS and the corridor authorities | High |
| E8 | 3 Dec 2022 | G 27/2023 | KWP B.32 → JPM B.06 (whole, as Jabatan Wilayah Persekutuan) | DBKL, Perbadanan Putrajaya, Perbadanan Labuan, PPKB, MSWP. FT grants in B.11 move to B.06 from FY2024 | yes | AP25 p39 note 3; J23 p261 note (1); Malay Mail, 22 Dec 2022 <https://www.malaymail.com/news/malaysia/2022/12/22/ft-ministry-restructured-into-ft-dept-says-chief-secretary/46678>; J22 p163 vs J23 p114 (Perbadanan Putrajaya) | High |
| E9 | 7 Dec 2022 | G 27/2023 | MOTAC B.31 → KPN B.14 | Perpustakaan Negara, Arkib Negara, Jabatan Muzium Malaysia | no | Utusan Sarawak, 8 Dec 2022 <https://utusansarawak.com.my/?p=40282>; PNM plan "7 Dis 2022 - Kini: Kementerian Perpaduan Negara"; G 27/2023 lists the three under KPN; J23 p133 | High |
| E10 | 3 Dec 2022 (EPU dissolved 23 Dec 2022) | G 27/2023, G 361/2023 | JPM B.06 → Kementerian Ekonomi B.15 (number reused) | EPU, DOSM, ECERDC, IRDA, RECODA, NCIA, SEDIA, EKUINAS, MPRC, JPDC, SEDCs, MyDIGITAL (MyDIGITAL to KD in Dec 2023) | no | ekonomi.gov.my history: "On 23 December 2022, the EPU was dissolved … taken over by the Ministry of Economy"; AP25 p36 note 1; G 361/2023; J22 p112 vs J23 p135 (DOSM) | High |
| E11 | 2018–2021 | — | MOSTI B.30 → MITI B.24 (Standards Malaysia, Budget 2019); MOSTI → MITI → MOSTI (MIMOS: MITI 2019–2020, MOSTI from 2021); JPM → MOSTI (MIGHT, FY2022) | Agencies | no | BB2019-24 "Aktiviti 6: Standard Malaysia"; BB2021-30 "040300 MIMOS Berhad"; G 21/2024 2(d) (MIMOS under MOSTI) | High |

## 4. How to measure a partial move

A "share" should not be typed in. Compute it from the agencies an edge names, using data already loaded:

- **Operating:** sum `printed_total.actual_sen` at `scope = 'activity'` for the named activities (matched by `activity.name_ms`) in the predecessor vote in the last full year before the move. Divide by the predecessor's vote total in that year.
- **Development:** do the same over `development_group` / `development_project`.

The FY2018/2020/2024 statements already print the split for the transition year itself (§0 point 4).

Exact-name matching over `activity`, `programme`, `development_group`, `budget_heading` and `budget_development_group` found **164 vote-to-vote unit transitions**. Many are generic names ("Penyelenggaraan Bangunan", "Pengurusan Kementerian") that move only because codes are reused, so this cannot be automated. An edge should list its agencies explicitly.

## 5. Proposed schema

The goal is the fewest concepts that let a page show "this body, across its names and numbers" and let a comparison refuse to compare unlike things.

```sql
-- A body that holds a vote: ministry, department, commission, or charged head.
create table body (
  id          text primary key,          -- stable slug chosen once, e.g. 'kasa-2020', 'petra-2023'
  kind        text not null check (kind in ('ministry','department','commission','charged','fund')),
  established date,                       -- null when before our data
  dissolved   date
);

-- Every name a body has carried, printed or gazetted, with the period it applies to.
create table body_alias (
  body_id    text not null references body(id),
  name_ms    text not null,               -- as printed; matched case/space-insensitively
  valid_from date not null,
  valid_to   date,                         -- null = current
  origin     text not null check (origin in ('printed','gazetted','acronym')),
  citation_id bigint not null references citation(id),
  primary key (body_id, name_ms, valid_from)
);

-- Which body a vote number belongs to, per fiscal year. B and P share the number; T is separate.
create table vote_holder (
  vote_number text not null,               -- 'B/P.33', 'T.10'
  fiscal_year smallint not null,
  body_id     text not null references body(id),
  residual    boolean not null default false, -- printed with zero after the body ended (P.29 2019-21, P.32 2023-25, P.33 2023, P.15 2021)
  primary key (vote_number, fiscal_year)
);

-- Machinery-of-government changes.
create table lineage_edge (
  id            bigint generated always as identity primary key,
  predecessor   text not null references body(id),
  successor     text not null references body(id),
  effective     date not null,              -- in force date (gazette deemed date where one exists)
  kind          text not null check (kind in ('rename','create','merge','split','transfer','dissolve')),
  whole         boolean not null,           -- true: predecessor became successor entirely
  functions     text[] not null default '{}', -- agency/activity names as printed, used to compute the share (section 4)
  citation_id   bigint not null references citation(id),
  confidence    text not null check (confidence in ('high','medium','unverified'))
);

create table citation (
  id        bigint generated always as identity primary key,
  url       text not null,
  title     text not null,
  locator   text,                            -- 'P.U.(A) 20/2024 para 2(c)', 'PDF p39 note 4'
  quote     text,
  retrieved date not null
);
```

**Rules:**

- **A rename is an alias, not an edge.** Use an edge with `kind = 'rename'` only when the name change came with a function move. Examples: B.23 every time, B.30 in 2018 and 2020, B.47 in 2024.
- **A reused number gets a new body.** B/P.15 holds `mea-2018` for FY2018–2021 (2021 residual) and `ekonomi-2022` from FY2023. B/P.33 holds `kasa-2020` for FY2020–2023 (2023 residual) and `petra-2023` from FY2024. `vote_holder` makes this explicit, so `ministry_spending` can key on `body_id` instead of the number.
- **B.64 is one body with a one-year gap.** It is "re-established", has the same portfolio and the same number. `merge` to KPM effective 2018, then `split` back effective 10 Mar 2020. KASA and PETRA, by contrast, are two bodies.
- **JPM (B.06) and MOF (B.10) are long-lived bodies** that are predecessor or successor in many partial edges. Their pages should list incoming and outgoing edges by year.
- **The printed name in `vote.name_ms` stays as printed.** `body_alias` maps it. Loading rejects a year whose printed name has no alias covering that date, which catches the next reorganisation at ingest time.

## 6. Site features this changes

| Feature | Today | Problem | With lineage |
|---|---|---|---|
| Ministry pages (`web/src/lib/queries/ministry.ts`, `getMinistry`) | One page per vote number; slug from the latest printed name; every year of the number in one series | B.33 shows KASA 2020–22 and PETRA 2024–25 as one ministry. B.15 merges MEA and Kementerian Ekonomi. B.32 shows zero years 2023–25. B.23's series spans five portfolios. B.64 has an unexplained 2019 gap | Key pages on `body_id`. Show predecessors and successors with dates and citations. Draw a break in the year series at each edge where `whole = false`. Drop residual years or mark them. Redirect old slugs through `body_alias` |
| "Fastest growth" finding (`getTopGrowthMinistryData` in `web/src/lib/queries/findings.ts`) | Joins year-on-year on `number` and requires `name_ms` to be equal | The name guard drops genuine renames (B.20, B.21, B.24, B.25 in 2023) but passes function moves under an unchanged name: KPT FY2021 +105% (partial FY2020), JPM FY2020 (EPU back), JPA FY2024 (flagged by AP26). It compares FY2018 and FY2020 even though both are split years | Join on `body_id`. Exclude a pair when any `lineage_edge` with `whole = false` touching the body has `effective` in or between the two years, or show it with a "reorganised" note. Renames then compare correctly |
| Search (`web/src/lib/search.ts`) | Ministry hits come from `ministry_spending.name_ms ilike`; hrefs use the latest-name slug | "Alam Sekitar dan Air" lands on PETRA. "Kementerian Kewangan" finds nothing in JANM years. Gazetted-only names ("Kementerian Peralihan Tenaga dan Daya Guna Awam", "Kementerian Pembangunan Kerajaan Tempatan") and acronyms (KASA, MESTECC, KATS, KeTTHA, NRECC, PETRA) find nothing | Search `body_alias` (all origins). Return the body valid at the alias's dates. Show "formerly …" in the hit |
| Vote pages (`/[year]/vote/[code]`) | Per year, as printed | None for the printed figures. They are correct as single-year documents | Add a "this vote's body" line and a link to the body page |
| Budget pages | Budget book rows | AP25 prints KASA's 2022 actual on B.33 (PETRA) and KWP's on B.32 | Annotate rows whose prior-year actual belongs to a different body (`vote_holder` for that year ≠ this year) |

## 7. Open questions

1. **2018 part-year moves the external sources contradict.** JANM FY2018 prints Arkib Negara and Perpustakaan Negara under B.63 and MAMPU under B.47 for about half the year. The PNM strategic plan and the Budget 2019 JPM chapter do not show these moves. The likely explanation is a short-lived placement between May and Jul 2018 that the 2019 schedule (G 132/2019) no longer reflects, but this needs the text of G 125/2018 or a cabinet statement. Reading G 132/2019 and G 201/2020 (lom returned HTTP 500; a mirror exists) would also confirm E1 and E3 at the instrument level.
2. **Which units moved in the 2024 reorganisation** flagged by AP26 for B.07, B.15, B.21, B.45 and B.62 (E6b). The JPA FY2024 jump that drives the current finding sits in one activity of programme 030000. Is that a transfer in or a policy change?
3. **Corridor authorities under MOF (B.10) in FY2018 and FY2020.** The JANM data shows it; no external source states a transfer. Was it a funding channel or a change of portfolio?
4. **Instrument and date for the Suruhanjaya Perkhidmatan Pelajaran → Pendidikan rename.** The mastheads bracket it between Nov 2020 and Oct 2021. JANM prints it a year apart on T.10 (FY2022) and B.40 (FY2023).
5. **Body boundaries are a modelling choice.** Treating MEA and Kementerian Ekonomi as different bodies follows MOF's own note ("diwujudkan pada tahun 2023") even though both took EPU from JPM. Treating KPT 2020 as the same body as KPT 2016 is a judgment, and KPT has no MOF note either way. Confirm these before loading.
6. **Exact dates of the 2020 and Dec 2022 renames** (B.20, B.21, B.22, B.25, B.26). G 27/2023 fixes the Dec 2022 names but its in-force date is "date of each appointment". The 3 Dec 2022 cabinet date is the working assumption.
7. **Pre-2016 lineage** (for example KKBPKT's 2013 formation) is out of scope. The first `body.established` date is null for bodies older than FY2016.
