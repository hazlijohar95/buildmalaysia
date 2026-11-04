"""Source documents: where each comes from, its pinned hash, and reading its pages."""

import hashlib
import shutil
import subprocess
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

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
    known_misprints: tuple[KnownMisprint, ...] = ()


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


def ensure_pdf(source: SourceDocument, raw_dir: Path) -> Path:
    """Return the local PDF, downloading it if absent. Refuses any file whose hash differs."""
    path = raw_dir / source.raw_path
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_name(path.name + ".part")
        with urllib.request.urlopen(source.url) as response, partial.open("wb") as out:
            shutil.copyfileobj(response, out)
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


def _pdftotext(path: Path, first: int, last: int, mode: str) -> list[str]:
    out = subprocess.run(
        ["pdftotext", "-enc", "UTF-8", mode, "-f", str(first), "-l", str(last), str(path), "-"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    pages = out.split("\f")
    expected = last - first + 1
    if len(pages) != expected + 1 or pages[-1].strip():
        raise SourceError(f"pdftotext {mode} returned {len(pages) - 1} pages for {first}-{last}, expected {expected}")
    return pages[:-1]


def extract_pages(path: Path, pages: tuple[int, int]) -> list[PageText]:
    first, last = pages
    layout = _pdftotext(path, first, last, "-layout")
    raw = _pdftotext(path, first, last, "-raw")
    return [
        PageText(pdf_page=first + i, layout=layout_text, raw=raw_text)
        for i, (layout_text, raw_text) in enumerate(zip(layout, raw, strict=True))
    ]
