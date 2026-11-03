"""Rebuild the test fixtures from the FY2025 PDF: `uv run python tests/fixtures/build.py`.

Every fixture line is copied verbatim from the PDF page and line named below.
p105 and p106 are whole pages. The closing page is assembled from real lines into
one short statement that ends the way the real one does. Its parts are joined in
an order the real document never has, so its totals do not reconcile; only the
parser reads it.
"""

import subprocess
from pathlib import Path

from pipeline.sources import DEFAULT_RAW_DIR, SOURCES

HERE = Path(__file__).parent
PDF = DEFAULT_RAW_DIR / SOURCES[2025].raw_path

CLOSING: list[tuple[int, int, int]] = [  # (pdf page, first line, last line), 1-based inclusive
    (211, 1, 12),  # page head
    (113, 72, 78),  # charged section per-object totals and JUMLAH PERBELANJAAN TANGGUNGAN
    (114, 14, 14),  # PERBELANJAAN BEKALAN
    (208, 17, 17),  # B.64 KEMENTERIAN PENDIDIKAN TINGGI
    (108, 36, 37),  # programme 010000, name wraps
    (108, 53, 58),  # 010500 leaf with an empty Tambahan cell, then 010600
    (108, 74, 75),  # programme per-object total and Jumlah 010000
    (156, 50, 50),  # programme 020000
    (156, 79, 84),  # activity printed as 20600
    (151, 21, 24),  # activity 020700 whose leaf starts with a stray backtick
    (156, 92, 92),  # Jumlah 020000
    (130, 76, 80),  # programme 050000, leaf printed with object code 010000
    (158, 26, 28),  # activity printed as 50200
    (130, 81, 82),  # programme per-object total and Jumlah 050000
    (211, 27, 70),  # programme 990000 through the statement total, notes and footer
]


def page_text(page: int, mode: str) -> str:
    args = ["pdftotext", "-enc", "UTF-8", mode, "-f", str(page), "-l", str(page), str(PDF), "-"]
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout.removesuffix("\f")


def main() -> None:
    for page in (105, 106):
        (HERE / f"janm2025_p{page}.layout.txt").write_text(page_text(page, "-layout"))
    pages = {page: page_text(page, "-layout").split("\n") for page, _, _ in CLOSING}
    closing = [line for page, first, last in CLOSING for line in pages[page][first - 1 : last]]
    (HERE / "janm2025_closing.layout.txt").write_text("\n".join(closing) + "\n")
    (HERE / "janm2025_closing.raw.txt").write_text(page_text(211, "-raw"))


if __name__ == "__main__":
    main()
