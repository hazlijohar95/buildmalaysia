"""Source documents: where each comes from, its pinned hash, and reading its pages."""

import hashlib
import shutil
import ssl
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol
from datetime import UTC, datetime
from pathlib import Path

import certifi

from pipeline.ocr import ManualReading
from pipeline.parse import PageText

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"


@dataclass(frozen=True)
class KnownMisprint:
    """A printed total that disagrees with the rows under it in the source itself.

    The load accepts exactly this mismatch (same total, same difference in sen) and fails
    if it is absent, so a fix in the parser or a corrected PDF cannot leave it stale.
    The mismatch stays visible in the reconciliation view.
    """

    key: str  # as the loader names the total, e.g. "programme total vote=B.24 programme=060000"
    diffs_sen: tuple[int, ...]  # printed minus the sum of rows, per column
    evidence: str


@dataclass(frozen=True)
class GapScope:
    """A programme whose rows are partly on a missing page: the last activity printed before
    the gap and the first printed after it (None where the gap runs to the programme's end
    or start)."""

    vote_code: str
    programme_code: str
    printed_before: str | None
    printed_after: str | None


@dataclass(frozen=True)
class KnownGap:
    """A Lampiran 1 page missing from the published PDF.

    Every printed total whose rows are all present must reconcile as usual. The totals over
    `scopes` (those programmes, their votes, sections and the statement) are reported with
    result 'missing_page' and checked against the totals printed below them instead
    (gap.fill_gap). A gap the parser does not reach fails the parse.
    """

    id: str
    after_pdf_page: int  # the last page printed before the gap
    before_pdf_page: int  # the first page printed after it
    scopes: tuple[GapScope, ...]
    evidence: str


@dataclass(frozen=True)
class SourceDocument:
    id: str
    publisher: str
    title: str
    fiscal_year: int
    url: str
    sha256: str
    page_count: int
    raw_path: str  # relative to the raw data directory
    operating_pages: tuple[int, int]  # Lampiran 1 (BM), PDF pages, 1-based, inclusive
    development_pages: tuple[int, int]  # Lampiran 2 (BM), whole two-page spreads
    revenue_pages: tuple[int, int]  # Note 5(a), "Hasil mengikut penjenisan", PDF pages
    known_misprints: tuple[KnownMisprint, ...] = ()
    # Lampiran 3 (COVID-19 Fund, FY2020-2023): its spread and the column names on each page.
    covid_pages: tuple[int, int] | None = None
    covid_columns: tuple[tuple[str, ...], tuple[str, ...]] = ((), ())
    # FY2020: Lampiran 3 is read from the words its pages draw (covid.parse_covid_drawn).
    covid_drawn: bool = False
    # Lampiran 1's columns: 7 (FY2021 on), or 4 (FY2016-2019: Asal, Dipinda, Amaun, %).
    operating_columns: int = 7
    # FY2016-2019: no page number in the running head; book pages come from the printer slug.
    slug_pages: bool = False
    # The part of each Lampiran 1 / Lampiran 2 page `-layout` reads, (x, y, width, height) in
    # points. FY2016-2019 print the book page in a side tab level with table rows, which
    # -layout would interleave with them; their tables lie inside x 83-575.
    operating_crop: tuple[int, int, int, int] | None = None
    development_crop: tuple[int, int, int, int] | None = None
    known_gaps: tuple[KnownGap, ...] = ()
    # FY2020: Lampiran 1's tables have no text layer and are read by OCR (ocr.py), cached in
    # data/ocr/<raw path without .pdf>/.
    operating_ocr: bool = False
    # Cells of those pages that no OCR setting reads to their shape, read by eye from the crop.
    ocr_manual_readings: tuple[ManualReading, ...] = ()
    # Years whose Lampiran 1 words are the vocabulary for choosing among OCR label readings.
    ocr_vocabulary_years: tuple[int, ...] = ()
    # Lampiran 2 right pages whose rows are read from -raw (rule HIDDEN_PAGE_IN_TEXT_LAYER).
    development_raw_right_pages: frozenset[int] = frozenset()
    # Attachment 1 (English, vote totals only): read where Lampiran 1 has a known gap.
    english_operating_pages: tuple[int, int] | None = None


# FY2016-2019 print Lampiran 1 in four columns, with the book page in a side tab. FY2019's PDF
# omits a page of Lampiran 1 (KnownGap below).
# Lampiran 1 is also read from y 124: its units line is never above y 149, and FY2017 p199
# holds a copy of a page shrunk to 6 x 9 points at x 86-92, y 114-123, which -layout would
# spread over the table.
_OPERATING_CROP = (78, 124, 500, 718)
_DEVELOPMENT_CROP = (78, 0, 500, 842)

SOURCES: dict[int, SourceDocument] = {
    2025: SourceDocument(
        id="janm-penyata-kewangan-2025",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2025",
        fiscal_year=2025,
        url="https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2025_Penyata_Kewangan_Kerajaan_Persekutuan.pdf",
        sha256="5dd1673c6c42420be1b1f70cd68881358e21768e82850e864c26f2421b24a515",
        page_count=458,
        raw_path="janm/2025.pdf",
        operating_pages=(103, 212),
        development_pages=(214, 249),
        revenue_pages=(89, 90),
    ),
    2024: SourceDocument(
        id="janm-penyata-kewangan-2024",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2024",
        fiscal_year=2024,
        url="https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2024_Penyata_Kewangan_Kerajaan_Persekutuan.pdf",
        sha256="779d4d313583dbeef14fbd3adfab9475305d7128165af7ae6ad8702124700d87",
        page_count=447,
        raw_path="janm/2024.pdf",
        operating_pages=(99, 203),
        development_pages=(206, 241),
        revenue_pages=(83, 84),
    ),
    2023: SourceDocument(
        id="janm-penyata-kewangan-2023",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2023",
        fiscal_year=2023,
        url="https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2023_Penyata_Kewangan_Kerajaan_Persekutuan.pdf",
        sha256="5181b69847f4a76446453d543832a2434b9553d6e7bb543484330874e37abf77",
        page_count=444,
        raw_path="janm/2023.pdf",
        operating_pages=(95, 194),
        development_pages=(196, 231),
        revenue_pages=(79, 80),
        covid_pages=(234, 235),
        covid_columns=(
            ("ceiling", "spent_prior"),
            ("allocation", "virement", "revised", "actual", "variance", "percent", "spent_to_date"),
        ),
    ),
    2022: SourceDocument(
        id="janm-penyata-kewangan-2022",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2022",
        fiscal_year=2022,
        url="https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2022_PENYATA_KEWANGAN_KERAJAAN_PERSEKUTUAN.pdf",
        sha256="32a37d4d8ef374e92710bc987ccbf4ec63a847609accc56941c124d7c8b80871",
        page_count=443,
        raw_path="janm/2022.pdf",
        operating_pages=(97, 195),
        development_pages=(198, 229),
        revenue_pages=(81, 82),
        covid_pages=(232, 233),
        covid_columns=(
            ("ceiling", "spent_prior"),
            ("allocation", "virement", "revised", "actual", "variance", "percent", "spent_to_date"),
        ),
    ),
    2020: SourceDocument(
        id="janm-penyata-kewangan-2020",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2020",
        fiscal_year=2020,
        url="https://www.anm.gov.my/images/dokumen/arkib/penyata-kewangan/2020_PENYATA_KEWANGAN_KERAJAAN_PERSEKUTUAN.pdf",
        sha256="9f11465bd467e29e828a589875ba7e7e5dc85c2691b76bcbf259b4fde55e6695",
        page_count=461,
        raw_path="janm/2020.pdf",
        operating_pages=(95, 206),
        development_pages=(208, 247),
        revenue_pages=(77, 78),
        operating_columns=4,
        operating_ocr=True,
        ocr_vocabulary_years=(2019, 2021),
        # Read by eye from 600-dpi crops of the page (data/ocr/janm/2020/manual/), where the OCR
        # panel did not agree or a total proved its reading wrong.
        ocr_manual_readings=(
            ManualReading(
                158,
                477.82,
                1,
                "2,520,190",
                "manual/p158-477.82-c1.png: B.28 010500 10000 Emolumen, Dipinda; panel split 9/5/1 between "
                "2,520,190, 2,020,190 and 2,920,190; the crop shows 2,520,190",
            ),
            ManualReading(
                183,
                358.63,
                2,
                "7,582,228.65",
                "manual/p183-358.63-c2.png: B.46 'Jumlah 040100', Amaun; panel split 8/7 between 7,582,228.65 "
                "and 7,982,228.65; the crop shows 7,582,228.65",
            ),
            ManualReading(
                100,
                362.83,
                -1,
                "021000 Yuran Tambahan Saham Islamic Corporation for",
                "manual/p100-362.83-label.png: label; OCR read '/slamic'",
            ),
            ManualReading(
                133,
                549.88,
                -1,
                "020000 JABATAN PERPADUAN NEGARA DAN INTEGRASI",
                "manual/p133-549.88-label.png: label; OCR read 'INTEGRAS|'",
            ),
            ManualReading(
                142,
                573.71,
                -1,
                "050500 Rural Basic Infrastucture",
                "manual/p142-573.71-label.png: label; OCR read 'Aural'; 'Infrastucture' is as printed",
            ),
            ManualReading(
                160,
                664.89,
                -1,
                "031700 Penyelenggaraan STOLports",
                "manual/p160-664.89-label.png: label; OCR read 'S7OLports'",
            ),
            ManualReading(
                177,
                266.41,
                -1,
                "010200 Institut Latihan Perumahan dan Kerajaan Tempatan",
                "manual/p177-266.41-label.png: label; OCR read 'Latinan'",
            ),
        ),
        slug_pages=True,
        development_crop=_DEVELOPMENT_CROP,
        development_raw_right_pages=frozenset({239}),
        covid_pages=(250, 251),
        covid_columns=(
            ("ceiling", "allocation", "supplementary"),
            ("withdrawal", "virement", "revised", "actual", "variance", "spent_to_date", "percent"),
        ),
        covid_drawn=True,
        # 18 totals; each re-added from the OCR'd lines and checked on the rendered page.
        known_misprints=(
            KnownMisprint(
                key="programme total vote=B.27 programme=060000 object=20000",
                diffs_sen=(0, 0, 0, 0, -20),
                evidence=(
                    "PDF p157: programme 060000's 'Perkhidmatan dan Bekalan' line prints Amaun 369,802 with no sen; "
                    "its leaf (060100) prints 369,802.20"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.27 programme=060000 object=30000",
                diffs_sen=(0, 0, 0, 0, -23),
                evidence=(
                    "PDF p157: programme 060000's 'Aset' line prints Amaun 5,031,934 with no sen; its leaves "
                    "(060200, 060300) print 3,294,559.43 and 1,737,374.80"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.32 programme=030000 object=40000",
                diffs_sen=(2100000, 0, 0, 1800000, 1713000),
                evidence=(
                    "PDF p167-168: leaf B.32 030300 50000 Perbelanjaan-perbelanjaan Lain (21,000; 18,000; 17,130.00) is "
                    "counted by programme 030000's per-object lines, and every object total above them, under "
                    "Pemberian dan Kenaan Bayaran Tetap (checked on the rendered pages)"
                ),
            ),
            KnownMisprint(
                key="vote total vote=B.32 object=40000",
                diffs_sen=(2100000, 0, 0, 1800000, 1713000),
                evidence=(
                    "PDF p167-168: leaf B.32 030300 50000 Perbelanjaan-perbelanjaan Lain (21,000; 18,000; 17,130.00) is "
                    "counted by programme 030000's per-object lines, and every object total above them, under "
                    "Pemberian dan Kenaan Bayaran Tetap (checked on the rendered pages)"
                ),
            ),
            KnownMisprint(
                key="vote total vote=B.32 object=50000",
                diffs_sen=(-2100000, 0, 0, -1800000, -1713000),
                evidence=(
                    "PDF p167-168: leaf B.32 030300 50000 Perbelanjaan-perbelanjaan Lain (21,000; 18,000; 17,130.00) is "
                    "counted by programme 030000's per-object lines, and every object total above them, under "
                    "Pemberian dan Kenaan Bayaran Tetap (checked on the rendered pages)"
                ),
            ),
            KnownMisprint(
                key="activity total vote=B.42 programme=070000 activity=070300",
                diffs_sen=(0, 0, 0, 0, -32),
                evidence=(
                    "PDF p176: leaf B.42 070300 20000 prints Amaun 11,630,289 with no sen; 'Jumlah 070300' and every "
                    "total above it print 11,630,288.68 (checked on the rendered page)"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.42 programme=070000 object=20000",
                diffs_sen=(0, 0, 0, 0, -32),
                evidence=(
                    "PDF p176: leaf B.42 070300 20000 prints Amaun 11,630,289 with no sen; 'Jumlah 070300' and every "
                    "total above it print 11,630,288.68 (checked on the rendered page)"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.42 programme=070000",
                diffs_sen=(0, 0, 0, 0, -32),
                evidence=(
                    "PDF p176: leaf B.42 070300 20000 prints Amaun 11,630,289 with no sen; 'Jumlah 070300' and every "
                    "total above it print 11,630,288.68 (checked on the rendered page)"
                ),
            ),
            KnownMisprint(
                key="vote total vote=B.42 object=20000",
                diffs_sen=(0, 0, 0, 0, -32),
                evidence=(
                    "PDF p176: leaf B.42 070300 20000 prints Amaun 11,630,289 with no sen; 'Jumlah 070300' and every "
                    "total above it print 11,630,288.68 (checked on the rendered page)"
                ),
            ),
            KnownMisprint(
                key="vote total vote=B.42",
                diffs_sen=(0, 0, 0, 0, -32),
                evidence=(
                    "PDF p176: leaf B.42 070300 20000 prints Amaun 11,630,289 with no sen; 'Jumlah 070300' and every "
                    "total above it print 11,630,288.68 (checked on the rendered page)"
                ),
            ),
            KnownMisprint(
                key="section total section=supply object=20000",
                diffs_sen=(0, 0, 0, 0, -32),
                evidence=(
                    "PDF p176: leaf B.42 070300 20000 prints Amaun 11,630,289 with no sen; 'Jumlah 070300' and every "
                    "total above it print 11,630,288.68 (checked on the rendered page)"
                ),
            ),
            KnownMisprint(
                key="section total section=supply object=40000",
                diffs_sen=(2100000, 0, 0, 1800000, 1713000),
                evidence=(
                    "PDF p167-168: leaf B.32 030300 50000 Perbelanjaan-perbelanjaan Lain (21,000; 18,000; 17,130.00) is "
                    "counted by programme 030000's per-object lines, and every object total above them, under "
                    "Pemberian dan Kenaan Bayaran Tetap (checked on the rendered pages)"
                ),
            ),
            KnownMisprint(
                key="section total section=supply object=50000",
                diffs_sen=(-2100000, 0, 0, -1800000, -1713000),
                evidence=(
                    "PDF p167-168: leaf B.32 030300 50000 Perbelanjaan-perbelanjaan Lain (21,000; 18,000; 17,130.00) is "
                    "counted by programme 030000's per-object lines, and every object total above them, under "
                    "Pemberian dan Kenaan Bayaran Tetap (checked on the rendered pages)"
                ),
            ),
            KnownMisprint(
                key="section total section=supply",
                diffs_sen=(0, 0, 0, 0, -32),
                evidence=(
                    "PDF p176: leaf B.42 070300 20000 prints Amaun 11,630,289 with no sen; 'Jumlah 070300' and every "
                    "total above it print 11,630,288.68 (checked on the rendered page)"
                ),
            ),
            KnownMisprint(
                key="statement total object=20000",
                diffs_sen=(0, 0, 0, 0, -32),
                evidence=(
                    "PDF p176: leaf B.42 070300 20000 prints Amaun 11,630,289 with no sen; 'Jumlah 070300' and every "
                    "total above it print 11,630,288.68 (checked on the rendered page)"
                ),
            ),
            KnownMisprint(
                key="statement total object=40000",
                diffs_sen=(2100000, 0, 0, 1800000, 1713000),
                evidence=(
                    "PDF p167-168: leaf B.32 030300 50000 Perbelanjaan-perbelanjaan Lain (21,000; 18,000; 17,130.00) is "
                    "counted by programme 030000's per-object lines, and every object total above them, under "
                    "Pemberian dan Kenaan Bayaran Tetap (checked on the rendered pages)"
                ),
            ),
            KnownMisprint(
                key="statement total object=50000",
                diffs_sen=(-2100000, 0, 0, -1800000, -1713000),
                evidence=(
                    "PDF p167-168: leaf B.32 030300 50000 Perbelanjaan-perbelanjaan Lain (21,000; 18,000; 17,130.00) is "
                    "counted by programme 030000's per-object lines, and every object total above them, under "
                    "Pemberian dan Kenaan Bayaran Tetap (checked on the rendered pages)"
                ),
            ),
            KnownMisprint(
                key="statement total",
                diffs_sen=(0, 0, 0, 0, -32),
                evidence=(
                    "PDF p176: leaf B.42 070300 20000 prints Amaun 11,630,289 with no sen; 'Jumlah 070300' and every "
                    "total above it print 11,630,288.68 (checked on the rendered page)"
                ),
            ),
        ),
    ),
    2019: SourceDocument(
        id="janm-penyata-kewangan-2019",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2019",
        fiscal_year=2019,
        url="https://www.anm.gov.my/images/dokumen/arkib/penyata-kewangan/2019_PENYATA_KEWANGAN_KERAJAAN_PERSEKUTUAN.pdf",
        sha256="b69e78c0f0a31f14b0e48f1f83716c578ab09330dbef65cbb408d5c4c8495c36",
        page_count=396,
        raw_path="janm/2019.pdf",
        operating_pages=(77, 173),
        development_pages=(176, 211),
        revenue_pages=(60, 61),
        operating_columns=4,
        slug_pages=True,
        operating_crop=_OPERATING_CROP,
        development_crop=_DEVELOPMENT_CROP,
        english_operating_pages=(333, 339),
        known_misprints=(
            KnownMisprint(
                key="programme total vote=B.03 programme=010000",
                diffs_sen=(0, 0, 0, -4_000_000, -2_929_445),
                evidence=(
                    "PDF p87: 'Jumlah 010000' (PENGURUSAN KORPORAT) prints Dipinda 36,973,440 and Amaun "
                    "33,127,669.46; its activities 010100 (30,362,180; 27,085,284.70) and 010200 (6,651,260; "
                    "6,071,679.21) and its per-object lines sum to 37,013,440 and 33,156,963.91"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.10 programme=040000",
                diffs_sen=(0, 0, 0, -486_340_000, -490_164_058),
                evidence=(
                    "PDF p101: 'Jumlah 040000' prints Dipinda 209,559,750 and Amaun 209,511,375.44; its seven "
                    "activities and its per-object lines sum to 214,423,150 and 214,413,016.02; the vote total "
                    "agrees with the rows"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.23 programme=050000",
                diffs_sen=(0, 0, 0, 0, -23_432_045_763),
                evidence=(
                    "PDF p122: 'Jumlah 050000' prints Amaun 22,207,912.22 (10.16%), leaving out activity 050500's "
                    "234,320,457.63; its per-object lines include it"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.43 programme=030000",
                diffs_sen=(0, 0, 0, 923_442_000, 923_425_388),
                evidence=(
                    "PDF p152: 'Jumlah 030000' prints Dipinda 939,528,207 and Amaun 939,527,194.19; its eight "
                    "activities and its per-object lines sum to 930,293,787 and 930,292,940.31. The difference is "
                    "activity 030800 (9,234,420; 9,234,253.88), counted twice"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.47 programme=010000 object=30000",
                diffs_sen=(0, 0, 0, -28_710_000, 0),
                evidence=(
                    "PDF p157: programme 010000's 'Aset' line prints Dipinda 364,460 (the first leaf's); its three "
                    "30000 leaves print 364,460, 242,000 and 45,100. Its Amaun, 341,633.00, is their sum"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.47 programme=020000 object=30000",
                diffs_sen=(0, 0, 0, -677_237_400, 0),
                evidence=(
                    "PDF p158: programme 020000's 'Aset' line prints Dipinda '–'; its two 30000 leaves print "
                    "2,279,570 and 4,492,804. Its Amaun, 6,054,688.50, is their sum"
                ),
            ),
        ),
        known_gaps=(
            KnownGap(
                id="janm-2019-lampiran-1-book-p77-78",
                after_pdf_page=89,
                before_pdf_page=90,
                scopes=(
                    GapScope("B.05", "030000", printed_before="030100", printed_after=None),
                    GapScope("B.06", "010000", printed_before=None, printed_after="010600"),
                ),
                evidence=(
                    "PDF p89 (book p.77) ends inside B.05 programme 030000 after 'Jumlah 030100' and "
                    "'(disambung...)'; PDF p90 (book p.78) opens 'B.06 JABATAN PERDANA MENTERI – (SAMB.)' and "
                    "programme 010000 '(SAMB.)' at activity 010600. The appendix's own page counter, printed "
                    "beside the book page, goes from 41 to 43: one page of Lampiran 1 is not in the file. "
                    "Missing: the rest of B.05 programme 030000, its programme and vote totals, B.06's heading "
                    "and programme 010000's activities before 010600. B.05's vote totals are taken from "
                    "Attachment 1 (English), PDF p335. Searched without finding a complete copy: JANM's current "
                    "file and penyata-kewangan-2019.pdf, the 2022 Wayback capture, and CMD.28.2020"
                ),
            ),
        ),
    ),
    2018: SourceDocument(
        id="janm-penyata-kewangan-2018",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2018",
        fiscal_year=2018,
        url="https://www.anm.gov.my/images/dokumen/arkib/penyata-kewangan/2018_PENYATA_KEWANGAN_KERAJAAN_PERSEKUTUAN.pdf",
        sha256="6a3a5936dc682e31a058956cdfc9c23a87fd3d507e415b18701b0c02792c30e7",
        page_count=422,
        raw_path="janm/2018.pdf",
        operating_pages=(80, 216),
        development_pages=(218, 253),
        revenue_pages=(64, 65),
        operating_columns=4,
        slug_pages=True,
        operating_crop=_OPERATING_CROP,
        development_crop=_DEVELOPMENT_CROP,
        known_misprints=(
            KnownMisprint(
                key="programme total vote=B.09 programme=030000 object=40000",
                diffs_sen=(0, 0, 0, 515_260_000, 0),
                evidence=(
                    "PDF p107: programme 030000's line 'Pemberian dan Kenaan Bayaran Tetap' prints Dipinda "
                    "5,537,000 (and 5.16%), but its two 40000 leaves print 331,687 (030100) and 52,713 (030300), "
                    "384,400 in all. 'Jumlah 030000' (50,847,805) equals its activities and equals Emolumen "
                    "31,730,000 + Perkhidmatan 18,633,405 + Aset 100,000 + 384,400; the vote's object totals "
                    "agree with the leaves"
                ),
            ),
            *(
                KnownMisprint(
                    key=f"{total} object={code}",
                    diffs_sen=(0, 0, 0, sign * 28_000_000, 0),
                    evidence=(
                        "PDF p157: B.28 activity 050300's only leaf prints '30000 Aset', Dipinda 280,000, Amaun "
                        "102,863.15. Every object total above it counts that 280,000 Dipinda under Perkhidmatan dan "
                        "Bekalan and the 102,863.15 actual under Aset: programme 050000 prints Perkhidmatan Dipinda "
                        "1,191,080 (its leaves: 911,080) and Aset 1,785,920 (its leaves: 2,065,920), and the vote, "
                        "supply section and statement object totals (PDF p157, p216) carry the same 280,000 shift"
                    ),
                )
                for total in (
                    "programme total vote=B.28 programme=050000",
                    "vote total vote=B.28",
                    "section total section=supply",
                    "statement total",
                )
                for code, sign in (("20000", 1), ("30000", -1))
            ),
            *(
                KnownMisprint(
                    key=f"programme total vote=B.63 programme={programme} object={code}",
                    diffs_sen=(0, 0, 0, diff, 0),
                    evidence=(
                        "PDF p212-213: the per-object lines of B.63 programmes 080000, 090000, 100000 and 110000 all "
                        "print Emolumen Dipinda 41,140,500 (95.38%) and Perkhidmatan dan Bekalan Dipinda 31,402,870 "
                        "(89.94%), whatever their own leaves and Amaun. Each programme's 'Jumlah' equals its "
                        "activities, and B.63's 'Jumlah Emolumen' and 'Jumlah Perkhidmatan dan Bekalan' agree with "
                        "the leaves. Programme 110000's total is printed 'Jumlah 100000' (rule "
                        "PROGRAMME_TOTAL_CODE_MISPRINTED)"
                    ),
                )
                for programme, code, diff in (
                    ("080000", "10000", 4_106_960_000),
                    ("080000", "20000", 3_092_934_000),
                    ("090000", "10000", 3_347_603_200),
                    ("090000", "20000", -455_921_200),
                    ("100000", "10000", 1_590_108_400),
                    ("100000", "20000", 638_552_400),
                    ("110000", "10000", 2_452_246_500),
                    ("110000", "20000", 2_244_660_200),
                )
            ),
            KnownMisprint(
                key="group total vote=P.23 group=3",
                diffs_sen=(
                    0,
                    0,
                    8_763_643_300,
                    3_573_761_400,
                    12_337_404_700,
                    8_672_146_850,
                    3_090_512_848,
                    11_762_659_698,
                    11_762_659_698,
                ),  # fmt: skip
                evidence=(
                    "PDF p228-229: 'Jumlah FRIM' prints Kos Keseluruhan 143,970,000.00 and RMKe-11 to 2017 "
                    "41,384,000.00, the sums of its three projects (08100, 08400, 08510), but on the right page "
                    "Anggaran 147,011,642.00 and Sebenar 141,000,596.98: its projects (23,637,595.00; "
                    "23,374,000.00) plus the eight unheaded projects printed above its heading, 06400 to 07800 "
                    "(123,374,047.00; 117,626,596.98). The P.23 vote total agrees with the projects"
                ),
            ),
        ),
    ),
    2016: SourceDocument(
        id="janm-penyata-kewangan-2016",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2016",
        fiscal_year=2016,
        url="https://www.anm.gov.my/images/dokumen/arkib/penyata-kewangan/2016_PENYATA_KEWANGAN_KERAJAAN_PERSEKUTUAN.pdf",
        sha256="f2b9c42832890eb2a6521229341d7814c52aee7f8f523a4bca8a3cf502a6c26c",
        page_count=293,
        raw_path="janm/2016.pdf",
        operating_pages=(77, 223),
        development_pages=(225, 256),
        revenue_pages=(63, 64),
        operating_columns=4,
        slug_pages=True,
        operating_crop=_OPERATING_CROP,
        development_crop=_DEVELOPMENT_CROP,
        known_misprints=(
            KnownMisprint(
                key="programme total vote=T.08 programme=010000 object=40000",
                diffs_sen=(3_900_000, 0, 0, 3_900_000, 3_158_712),
                evidence=(
                    "PDF p79: as in FY2017, T.08 programme 010000's second per-object line is labelled "
                    "'Pemberian dan Kenaan Bayaran Tetap' (39,000; 39,000; 31,587.12), the figures of its only "
                    "activity's leaf '20000 Perkhidmatan dan Bekalan'; the vote prints them as 'Jumlah "
                    "Perkhidmatan dan Bekalan'"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.06 programme=520000 object=40000",
                diffs_sen=(0, 0, 0, 0, -13),
                evidence=(
                    "PDF p105: programme 520000's 'Pemberian dan Kenaan Bayaran Tetap' line prints Amaun "
                    "39,965,322 with no sen; its only 40000 leaf (520300) prints 39,965,322.13, and 'Jumlah "
                    "520000' (272,253,356.92) includes the 13 sen"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.10 programme=090000",
                diffs_sen=(-410_000_000, 0, 0, 0, 0),
                evidence=(
                    "PDF p122: 'Jumlah 090000' prints Asal 288,084,900; its ten activities sum to 292,184,900, as "
                    "do its per-object lines (70,492,000 + 9,592,900 + 208,000,000 + 4,100,000). The 4,100,000 "
                    "left out is activity 090500's (Bayaran Balik Hasil); the vote total includes it"
                ),
            ),
            KnownMisprint(
                key="programme total vote=B.31 programme=020000 object=20000",
                diffs_sen=(0, 0, 0, 0, -6),
                evidence=(
                    "PDF p170: programme 020000's 'Perkhidmatan dan Bekalan' line prints Amaun 29,444,834 with no "
                    "sen; its six 20000 leaves sum to 29,444,834.06"
                ),
            ),
        ),
    ),
    2017: SourceDocument(
        id="janm-penyata-kewangan-2017",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2017",
        fiscal_year=2017,
        url="https://www.anm.gov.my/images/dokumen/arkib/penyata-kewangan/2017_PENYATA_KEWANGAN_KERAJAAN_PERSEKUTUAN.pdf",
        sha256="d3a9e1d4de3af0c20a0e54984fd3a834f5f7410bee1f4a22e402c4d58ed3eae9",
        page_count=400,
        raw_path="janm/2017.pdf",
        operating_pages=(75, 216),
        development_pages=(219, 250),
        revenue_pages=(61, 62),
        operating_columns=4,
        slug_pages=True,
        operating_crop=_OPERATING_CROP,
        development_crop=_DEVELOPMENT_CROP,
        known_misprints=(
            KnownMisprint(
                key="programme total vote=T.08 programme=010000 object=40000",
                diffs_sen=(3_900_000, 0, 0, 3_900_000, 1_561_500),
                evidence=(
                    "PDF p77: T.08 programme 010000's second per-object line is labelled 'Pemberian dan Kenaan "
                    "Bayaran Tetap' (39,000; 39,000; 15,615.00), but the programme's only activity, 010100, has "
                    "no 40000 leaf: those are the figures of its leaf '20000 Perkhidmatan dan Bekalan', and the "
                    "vote total prints them as 'Jumlah Perkhidmatan dan Bekalan'"
                ),
            ),
            KnownMisprint(
                key="activity total vote=B.11 programme=020000 activity=020700",
                diffs_sen=(0, 0, 0, -102_390_000, -102_390_000),
                evidence=(
                    "PDF p118: 'Jumlah 020700' prints Dipinda 723,707,340 and Amaun 723,707,264.89, its 40000 "
                    "leaf alone; its 20000 leaf (Dipinda 1,023,900, Amaun 1,023,900.00) is left out. Programme "
                    "020000's totals and the vote's include it"
                ),
            ),
            KnownMisprint(
                key="activity total vote=B.11 programme=020000 activity=020800",
                diffs_sen=(0, 0, 0, -87_190_000, -87_180_837),
                evidence=(
                    "PDF p118: 'Jumlah 020800' prints Dipinda 27,448,100 and Amaun 27,448,001.96, its 40000 leaf "
                    "alone; its 20000 leaf (Dipinda 871,900, Amaun 871,808.37) is left out. Programme 020000's "
                    "totals and the vote's include it"
                ),
            ),
        ),
    ),
    2021: SourceDocument(
        id="janm-penyata-kewangan-2021",
        publisher="Jabatan Akauntan Negara Malaysia",
        title="Penyata Kewangan Kerajaan Persekutuan 2021",
        fiscal_year=2021,
        url="https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2021_PENYATA_KEWANGAN_KERAJAAN_PERSEKUTUAN.pdf",
        sha256="8fe75e5b7d7e1c839bd3f426a97d941ca76e732501dc17d5baaceb773e96763f",
        page_count=456,
        raw_path="janm/2021.pdf",
        operating_pages=(89, 199),
        development_pages=(202, 245),
        revenue_pages=(73, 74),
        covid_pages=(248, 249),
        covid_columns=(
            ("ceiling", "spent_prior", "allocation", "supplementary"),
            ("virement", "revised", "actual", "variance", "spent_to_date", "percent"),
        ),
        known_misprints=(
            KnownMisprint(
                key="programme total vote=B.24 programme=060000",
                diffs_sen=(0, 0, 0, 0, -100_000_000),
                evidence=(
                    "PDF p142: 'Jumlah 060000' prints Sebenar 6,293,310.19, but its only activity (060100, "
                    "Persidangan APEC 2020) and its per-object lines both sum to 7,293,310.19; the vote total "
                    "agrees with the rows"
                ),
            ),
        ),
    ),
}


class SourceError(Exception):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


class Fetchable(Protocol):
    @property
    def url(self) -> str: ...
    @property
    def sha256(self) -> str: ...
    @property
    def raw_path(self) -> str: ...


@dataclass(frozen=True)
class BudgetSource:
    """A MOF budget book (Anggaran Perbelanjaan Persekutuan)."""

    id: str
    publisher: str
    title: str
    budget_year: int
    url: str
    sha256: str
    page_count: int
    raw_path: str
    summary_pages: tuple[int, int]  # "Ringkasan Perbelanjaan Sebenar dan Anggaran ...", PDF pages
    # Summary totals that disagree with their own parts beyond rounding: label -> printed
    # minus computed, sen per column. Accepted exactly; an absent one fails the parse.
    known_misprints: tuple[tuple[str, tuple[int, ...]], ...] = ()
    layout: str = "latex"  # "word" for Budget 2025, whose summary pages are laid out differently


BUDGET_SOURCES: dict[int, BudgetSource] = {
    2025: BudgetSource(
        id="mof-anggaran-perbelanjaan-2025",
        publisher="Kementerian Kewangan Malaysia",
        title="Anggaran Perbelanjaan Persekutuan 2025",
        budget_year=2025,
        url="https://belanjawan.mof.gov.my/pdf/belanjawan2025/perbelanjaan/Anggaran_Perbelanjaan_Persekutuan_2025.pdf",
        sha256="0a96d0a4c468b701482c2b1d0b00a1770c6c0d24391c52bc5d5bf28fda6710e6",
        page_count=541,
        raw_path="mof/2025/Anggaran_Perbelanjaan_Persekutuan_2025.pdf",
        summary_pages=(32, 42),
        layout="word",
        known_misprints=(
            # Lampiran D (book p.524) prints P.60's total project cost as 58,124,929,556; the
            # P.60 table's total and the sum of its 14 projects are 58,174,929,556.
            ("Lampiran D P.60", (-5_000_000_000, 0, 0, 0)),
            # Its JUMLAH prints total project cost 676,988,446,255; its rows (with P.60 as
            # printed) sum to 676,988,446,256.
            ("Lampiran D total", (-100, 0, 0, 0)),
            # The grand summary (book p.31) prints the 2025 estimate's Emolumen as
            # 105,916,537,000 and Lain as 229,083,463,000; the votes sum to 105,908,537,000 and
            # 229,091,463,000, the figures Budget 2026 restates. Mengurus is right.
            ("Emolumen", (0, 0, 0, 800_000_000)),
            ("Lain", (0, 0, 0, -800_000_000)),
        ),
    ),
    2026: BudgetSource(
        id="mof-anggaran-perbelanjaan-2026",
        publisher="Kementerian Kewangan Malaysia",
        title="Anggaran Perbelanjaan Persekutuan 2026",
        budget_year=2026,
        url="https://belanjawan.mof.gov.my/pdf/belanjawan2026/perbelanjaan/Anggaran_Perbelanjaan_Persekutuan_2026.pdf",
        sha256="e2eaeedf711be21dff09ef4409882de25b3e48f936bc3c9c07f95dc8fac7cdf0",
        page_count=584,
        raw_path="mof/2026/Anggaran_Perbelanjaan_Persekutuan_2026.pdf",
        summary_pages=(32, 45),
    ),
    2027: BudgetSource(
        id="mof-anggaran-perbelanjaan-2027",
        publisher="Kementerian Kewangan Malaysia",
        title="Anggaran Perbelanjaan Persekutuan 2027",
        budget_year=2027,
        url="https://belanjawan.mof.gov.my/pdf/belanjawan2027/perbelanjaan/Anggaran_Perbelanjaan_Persekutuan_2027.pdf",
        sha256="5caf1cc1a4416e21912e4a450f66add2e7d34ee684d8e10de4e5717be42457a9",
        page_count=586,
        raw_path="mof/2027/Anggaran_Perbelanjaan_Persekutuan_2027.pdf",
        summary_pages=(32, 44),
    ),
}


def ensure_pdf(source: Fetchable, raw_dir: Path) -> Path:
    """Return the local PDF, downloading it if absent. Refuses any file whose hash differs."""
    path = raw_dir / source.raw_path
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_name(path.name + ".part")
        request = urllib.request.Request(source.url, headers={"User-Agent": "buildmalaysia-pipeline"})
        # certifi's CA bundle: some Python installs (python.org on macOS) ship without one.
        context = ssl.create_default_context(cafile=certifi.where())
        try:
            with urllib.request.urlopen(request, context=context) as response, partial.open("wb") as out:
                shutil.copyfileobj(response, out)
        except (urllib.error.URLError, OSError) as error:
            partial.unlink(missing_ok=True)
            raise SourceError(f"could not download {source.url}: {error}") from error
        actual = _sha256(partial)
        if actual != source.sha256:
            partial.unlink()
            raise SourceError(f"downloaded {source.url} has sha256 {actual}, expected {source.sha256}")
        partial.rename(path)
        return path
    actual = _sha256(path)
    if actual != source.sha256:
        raise SourceError(f"{path} has sha256 {actual}, expected {source.sha256}; refusing to continue")
    return path


def retrieved_at(path: Path) -> datetime:
    """When the local copy was fetched: the file's modification time."""
    return datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)


def page_count(path: Path) -> int:
    info = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True, check=True).stdout
    for line in info.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[1])
    raise SourceError(f"pdfinfo reported no page count for {path}")


def _pdftotext(
    path: Path, first: int, last: int, mode: str, crop: tuple[int, int, int, int] | None = None
) -> list[str]:
    box = (
        []
        if crop is None
        else [arg for flag, value in zip("xyWH", crop, strict=True) for arg in (f"-{flag}", str(value))]
    )
    out = subprocess.run(
        ["pdftotext", "-enc", "UTF-8", mode, *box, "-f", str(first), "-l", str(last), str(path), "-"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    pages = out.split("\f")
    expected = last - first + 1
    if len(pages) != expected + 1 or pages[-1].strip():
        raise SourceError(f"pdftotext {mode} returned {len(pages) - 1} pages for {first}-{last}, expected {expected}")
    return pages[:-1]


def extract_pages(path: Path, pages: tuple[int, int], crop: tuple[int, int, int, int] | None = None) -> list[PageText]:
    """Each page's -layout text (inside `crop`, if given) and its whole -raw text."""
    first, last = pages
    layout = _pdftotext(path, first, last, "-layout", crop)
    raw = _pdftotext(path, first, last, "-raw")
    return [
        PageText(pdf_page=first + i, layout=layout_text, raw=raw_text)
        for i, (layout_text, raw_text) in enumerate(zip(layout, raw, strict=True))
    ]
