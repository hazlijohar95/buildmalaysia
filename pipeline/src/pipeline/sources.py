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
    # Lampiran 1's columns: 7 (FY2021 on), or 4 (FY2016-2019: Asal, Dipinda, Amaun, %).
    operating_columns: int = 7
    # The part of each Lampiran 1 and 2 page `-layout` reads, (x, y, width, height) in points.
    # FY2016-2019 print the book page in a side tab level with table rows, which -layout
    # would interleave with them; their tables lie inside x 83-575.
    crop: tuple[int, int, int, int] | None = None


# FY2016-2019 print Lampiran 1 in four columns, with the book page in a side tab. FY2019 is
# not registered: its PDF omits a page of Lampiran 1 (README, "FY2016-2019 statements").
_SIDE_TAB_CROP = (78, 0, 500, 842)

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
        crop=_SIDE_TAB_CROP,
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
