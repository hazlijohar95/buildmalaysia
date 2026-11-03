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
class SourceDocument:
    id: str
    publisher: str
    title: str
    fiscal_year: int
    url: str
    sha256: str
    page_count: int
    raw_path: str  # relative to the raw data directory
    first_page: int  # Lampiran 1 (BM) PDF page range, 1-based, inclusive
    last_page: int


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
        first_page=103,
        last_page=212,
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


def extract_pages(path: Path, source: SourceDocument) -> list[PageText]:
    layout = _pdftotext(path, source.first_page, source.last_page, "-layout")
    raw = _pdftotext(path, source.first_page, source.last_page, "-raw")
    return [
        PageText(pdf_page=source.first_page + i, layout=layout_text, raw=raw_text)
        for i, (layout_text, raw_text) in enumerate(zip(layout, raw, strict=True))
    ]
