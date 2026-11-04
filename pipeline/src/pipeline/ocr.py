"""Lampiran 1 pages drawn without a text layer (FY2020), and pages whose text layer holds
more than they draw (FY2020 Lampiran 3).

FY2020's PDF draws Lampiran 1's table as filled outlines, one path per glyph, with no text
layer. `pdftocairo -svg` gives every outline, so where each character is, which line it is
on and which column it sits in are read exactly from the geometry. Only what each glyph is
is left to OCR (tesseract):

- Columns are the table's vertical rules. The body starts under the second full-width rule
  (below the column heads) and ends where the vertical rules end; its first line must read
  "RM RM RM %".
- Lines: glyphs taller than 2.5 pt grouped by vertical centre; punctuation joins the line
  whose height it lies in.
- Each amount cell's shape comes from its glyph boxes: "D" a digit, "1" (the one digit whose
  box is under 2 pt wide; the others are 2.3 pt or wider), "," (reaches below the baseline),
  ".", "–" (a flat glyph), "(" and ")" (taller than a digit), "*" (small, high). For example
  "1,DDD,DDD.DD". A cell whose only glyph is a dash is read from its shape.
- Every other amount cell is cropped from renders of the page and read by tesseract (psm 7,
  a whitelist of digits and punctuation) at each of the 15 settings in PANEL. Readings that
  do not fit the cell's shape character for character are discarded; the cell's reading is
  the one at least PANEL_QUORUM of the rest agree on, with no rival holding half as many.
  The cache keeps the vote, and every reading where the panel was not unanimous.
- The label (left of the amounts) and each line under the table (notes, "(disambung...)")
  are read whole (psm 7, no whitelist), first at 600 dpi. A code that starts or ends a label
  must fit its shape; a reading with a word the neighbouring years' Lampiran 1 never prints
  is retried at the other LABEL_READINGS, and the first reading of only known words is kept.

A cell the panel cannot agree on, or a label no reading fits, stops the run (OcrError)
unless a ManualReading registered in sources.py names it: a reading taken from the rendered
crop by eye, with the crop as evidence. Nothing corrects a digit after the panel has read
it; a misread shows up as a % Prestasi that disagrees with its row, or as a total that does
not reconcile.

The result is cached per page in data/ocr/<raw path>/pNNN.json, so a load reads the same text
every time; that text is what `source_text` stores. `ocr_pages(..., refresh=True)` redoes it.
Renders and crops live in a temporary directory and are deleted as soon as a page is read.
"""

import csv
import difflib
import html
import json
import re
import shutil
import subprocess
import tempfile
from collections import Counter
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from itertools import pairwise
from pathlib import Path

from pipeline.parse import PageText

TESSERACT = shutil.which("tesseract") or "/opt/homebrew/bin/tesseract"
_AMOUNT_CHARS = "0123456789,.()-*"
_AMOUNT_ENDS = (88, 106, 124, 136)  # layout columns where each amount ends
UNITS = ("RM", "RM", "RM", "%")


class OcrError(Exception):
    pass


@dataclass(frozen=True)
class Reading:
    """One way of reading a crop: render resolution, the gray level below which a pixel is
    black, and tesseract's page segmentation mode (7 one line, 8 one word, 13 raw line)."""

    dpi: int
    threshold: int
    psm: int

    @property
    def name(self) -> str:
        return f"{self.dpi}dpi-t{self.threshold}-psm{self.psm}"


# Every amount cell is read at each of these settings. A cell's reading is the one most of
# the panel's readings agree on (PANEL_QUORUM), among those that fit the cell's shape.
PANEL: tuple[Reading, ...] = tuple(Reading(dpi, t, 7) for dpi in (300, 400, 500, 600, 800) for t in (128, 170, 210))
PANEL_QUORUM = 8  # of 15; and the runner-up may have at most half the winner's votes
# For labels and lines under the table, all tried until one reads only known words.
LABEL_READINGS: tuple[Reading, ...] = (
    Reading(600, 170, 7),
    Reading(600, 210, 7),
    Reading(800, 170, 7),
    Reading(400, 170, 7),
    Reading(600, 128, 7),
    Reading(500, 170, 7),
    Reading(700, 170, 7),
)
SHAPE_READING = "shape"  # a cell whose only glyph is a dash


@dataclass(frozen=True)
class ManualReading:
    """A cell the OCR panel could not agree on, or misread (a % or a total proves it), read by
    eye from the rendered crop. Only for characters that are unambiguous on the image;
    `evidence` names the crop and what it shows. Column -1 is the label."""

    pdf_page: int
    line_top: float  # the line's top in points, as cached ("top")
    column: int  # 0 Asal, 1 Dipinda, 2 Amaun, 3 %
    text: str
    evidence: str


@dataclass(frozen=True)
class _Box:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0

    @property
    def middle(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass
class _Vectors:
    glyphs: list[_Box]
    vertical: list[tuple[float, float, float]]  # x, top, bottom
    horizontal: list[tuple[float, float, float]]  # y, left, right


_PATH = re.compile(r"<path\b([^>]*)>")
_NUMBER = re.compile(r"-?\d+(?:\.\d+)?(?:e-?\d+)?")
_RGB = re.compile(r'\bfill="rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)"')


def _vectors(pdf: Path, pdf_page: int, work: Path) -> _Vectors:
    svg = work / f"p{pdf_page}.svg"
    subprocess.run(["pdftocairo", "-svg", "-f", str(pdf_page), "-l", str(pdf_page), str(pdf), str(svg)], check=True)
    try:
        body = svg.read_text().split("</defs>", 1)[-1]
    finally:
        svg.unlink(missing_ok=True)
    out = _Vectors([], [], [])
    for m in _PATH.finditer(body):
        attrs = m.group(1)
        d = re.search(r'\bd="([^"]*)"', attrs)
        if d is None:
            continue
        matrix = re.search(r"matrix\(([^)]*)\)", attrs)
        a, b, c, dd, e, f = (float(v) for v in matrix.group(1).split(",")) if matrix else (1, 0, 0, 1, 0, 0)
        subpaths: list[_Box] = []
        for sub in re.split(r"(?=M)", d.group(1)):
            nums = [float(n) for n in _NUMBER.findall(sub)]
            if not nums:
                continue
            xs = [a * x + c * y + e for x, y in zip(nums[0::2], nums[1::2])]
            ys = [b * x + dd * y + f for x, y in zip(nums[0::2], nums[1::2])]
            subpaths.append(_Box(min(xs), min(ys), max(xs), max(ys)))
        box = _span(subpaths)
        if 'fill="none"' in attrs:  # a stroke only: a table rule, or the outline that makes a glyph bold
            if box.width < 1 and box.height > 20:
                out.vertical.append((box.x0, box.y0, box.y1))
            elif box.height < 1 and box.width > 100:
                out.horizontal.append((box.y0, box.x0, box.x1))
            continue
        rgb = _RGB.search(attrs)  # a filled glyph, bold ones also stroked in the same element
        if rgb is None:
            continue
        if min(float(v) for v in rgb.groups()) > 85 and box.width > 8 and box.height > 8:
            # A light area painted later hides what is under it (FY2020 p109 covers a heading
            # with a white box): glyphs drawn so far inside it are not on the page.
            out.glyphs = [g for g in out.glyphs if not _inside(g, box)]
            continue
        if max(float(v) for v in rgb.groups()) >= 30:
            continue
        # One path may hold several glyphs (FY2020 p105 draws a row's three dashes as one): its
        # subpaths are grouped into glyphs where their horizontal extents overlap (a glyph's
        # holes lie inside it).
        for glyph in _merge_overlapping(subpaths):
            if glyph.width < 8 and glyph.height < 8:
                out.glyphs.append(glyph)
    return out


def _inside(inner: _Box, outer: _Box) -> bool:
    return outer.x0 <= inner.x0 and inner.x1 <= outer.x1 and outer.y0 <= inner.y0 and inner.y1 <= outer.y1


def _merge_overlapping(boxes: list[_Box]) -> list[_Box]:
    groups: list[_Box] = []
    for box in sorted(boxes, key=lambda b: b.x0):
        if groups and box.x0 <= groups[-1].x1:
            groups[-1] = _span([groups[-1], box])
        else:
            groups.append(box)
    return groups


def _group_lines(glyphs: list[_Box]) -> list[list[_Box]]:
    tall = sorted((g for g in glyphs if g.height > 2.5), key=lambda g: g.middle)
    lines: list[list[_Box]] = []
    for g in tall:
        if lines and g.middle - sum(b.middle for b in lines[-1]) / len(lines[-1]) < 2.2:
            lines[-1].append(g)
        else:
            lines.append([g])
    spans = [(min(b.y0 for b in ln), max(b.y1 for b in ln)) for ln in lines]
    for g in (g for g in glyphs if g.height <= 2.5):
        inside = [i for i, (top, bottom) in enumerate(spans) if top - 0.5 <= g.middle <= bottom + 1.0]
        if inside:
            lines[inside[0]].append(g)
        else:  # a line of punctuation only (a lone dash in a cell, a rule of dashes)
            lines.append([g])
            spans.append((g.y0, g.y1))
    order = sorted(range(len(lines)), key=lambda i: spans[i][0])
    return [sorted(lines[i], key=lambda b: b.x0) for i in order]


def shape(glyphs: Sequence[_Box]) -> str:
    tall = [g for g in glyphs if g.height > 3]
    baseline = max((g.y1 for g in tall if g.height < 4.4), default=max(g.y1 for g in glyphs))
    top = min((g.y0 for g in tall), default=min(g.y0 for g in glyphs))
    out: list[str] = []
    for g in glyphs:
        if g.height > 4.4:
            out.append(")" if any(c in "D1" for c in out) else "(")
        elif g.height > 3:
            out.append("1" if g.width < 2.0 else "D")
        elif g.height < 1 and g.width < 1:
            out.append(".")
        elif g.height < 2 and g.width < 1 and g.y1 > baseline + 0.3:
            out.append(",")
        elif g.height < 1 and g.width > 1.4:
            out.append("–")
        elif g.middle < top + 2:
            out.append("*")
        else:
            out.append("?")
    return "".join(out)


def fits(text: str, cell_shape: str) -> bool:
    if len(text) != len(cell_shape):
        return False
    for ch, sh in zip(text, cell_shape, strict=True):
        if sh == "D" and not (ch.isdigit() and ch != "1"):
            return False
        if sh == "–" and ch not in "-–—":
            return False
        if sh not in "D–" and ch != sh:
            return False
    return True


class _Raster:
    """One page rendered in gray at a given resolution, kept in memory, cropped on demand."""

    def __init__(self, pdf: Path, pdf_page: int, dpi: int, work: Path) -> None:
        base = work / f"r{pdf_page}-{dpi}"
        subprocess.run(
            ["pdftoppm", "-cropbox", "-gray", "-r", str(dpi), "-f", str(pdf_page), "-l", str(pdf_page)]
            + ["-singlefile", str(pdf), str(base)],
            check=True,
        )
        path = base.with_suffix(".pgm")
        data = path.read_bytes()
        path.unlink()
        magic, size, _maxval, self.pixels = data.split(b"\n", 3)
        if magic != b"P5":
            raise OcrError(f"pdftoppm wrote {magic!r}, expected a binary PGM")
        self.width, self.height = (int(v) for v in size.split())
        self.scale = dpi / 72

    def crop(self, box: _Box, threshold: int, out: Path, margin: float = 0.7, pad: int = 24) -> Path:
        x0, y0 = int((box.x0 - margin) * self.scale), int((box.y0 - margin) * self.scale)
        x1, y1 = int((box.x1 + margin) * self.scale) + 1, int((box.y1 + margin) * self.scale) + 1
        binary = bytes(0 if v < threshold else 255 for v in range(256))
        width = x1 - x0 + 2 * pad
        blank = b"\xff" * width
        rows = [blank] * pad
        for y in range(y0, y1):
            row = self.pixels[y * self.width + x0 : y * self.width + x1].translate(binary)
            rows.append(b"\xff" * pad + row + b"\xff" * pad)
        rows += [blank] * pad
        out.write_bytes(b"P5\n%d %d\n255\n" % (width, len(rows)) + b"".join(rows))
        return out


def _tesseract(images: list[Path], psm: int, whitelist: str | None, work: Path) -> list[list[str]]:
    """Each image's words, read in one tesseract run."""
    if not images:
        return []
    listing = work / "images.txt"
    listing.write_text("".join(f"{p.resolve()}\n" for p in images))
    args = [TESSERACT, str(listing), "stdout", "--psm", str(psm)]
    if whitelist is not None:
        args += ["-c", f"tessedit_char_whitelist={whitelist}"]
    out = subprocess.run([*args, "tsv"], capture_output=True, text=True, check=True).stdout
    words: list[list[str]] = [[] for _ in images]
    for row in csv.DictReader(out.splitlines(), delimiter="\t", quoting=csv.QUOTE_NONE):
        if row["level"] == "5" and row["text"] and row["text"].strip():
            words[int(row["page_num"]) - 1].append(row["text"].strip())
    return words


def tesseract_version() -> str:
    out = subprocess.run([TESSERACT, "--version"], capture_output=True, text=True, check=True)
    return (out.stdout or out.stderr).split("\n")[0].strip()


def pdftocairo_version() -> str:
    out = subprocess.run(["pdftocairo", "-v"], capture_output=True, text=True, check=True)
    return (out.stderr or out.stdout).split("\n")[0].strip()


@dataclass
class _Cell:
    line: int
    column: int  # 0-3 amounts; -1 the label; -2 a line under the table
    box: _Box
    shape: str
    text: str | None = None
    reading: str | None = None
    tried: list[str] = field(default_factory=list)
    unknown: list[str] = field(default_factory=list)  # a label's words not in the vocabulary
    votes: dict[str, int] = field(default_factory=dict)  # an amount's readings that fit its shape


def _label_shape_ok(text: str, glyphs: list[_Box]) -> bool:
    """A code that starts or ends a label ("030100 Pembaikan", "Jumlah 010000") must read as
    many digits as the glyphs of the label's first or last word, with "1" where a glyph is
    narrow. Words are runs of glyphs less than 1.6 pt apart (inside a code the widest gap,
    beside a "1", is 1.35 pt; between words the narrowest, in italics, 1.8 pt)."""
    words: list[list[_Box]] = []
    for g in glyphs:
        if words and g.x0 - words[-1][-1].x1 < 1.6:
            words[-1].append(g)
        else:
            words.append([g])
    tokens = text.split()
    if not tokens or not words:
        return not tokens and not words
    for token, word in ((tokens[0], words[0]), (tokens[-1], words[-1])):
        if re.fullmatch(r"\*?\d{5,6}", token) and not fits(token, shape(word)):
            return False
    return True


def read_page(pdf: Path, pdf_page: int, work: Path, vocabulary: frozenset[str]) -> dict[str, object]:
    """Read one page: {'columns': [...], 'lines': [{'top', 'label', 'cells', 'shapes', 'readings'}],
    'below': [lines under the table]}."""
    vec = _vectors(pdf, pdf_page, work)
    columns = sorted({round(x, 2) for x, _, _ in vec.vertical})
    if len(columns) != 6:
        raise OcrError(f"pdf page {pdf_page}: {len(columns)} vertical rules, expected the table's 6")
    full = sorted(y for y, left, right in vec.horizontal if right - left > 400)
    if len(full) < 2:
        raise OcrError(f"pdf page {pdf_page}: no full-width rule under the column heads")
    top, bottom = full[1], max(b for _, _, b in vec.vertical)
    inside = [g for g in vec.glyphs if top < g.y0 and g.y1 < bottom and columns[0] < g.x0 < columns[-1]]
    lines = _group_lines(inside)
    below = _group_lines([g for g in vec.glyphs if bottom < g.y0 < bottom + 25 and columns[0] - 20 < g.x0])

    cells: list[_Cell] = []
    for i, line in enumerate(lines):
        label = [g for g in line if g.x1 < columns[1]]
        if label:
            cells.append(_Cell(i, -1, _span(label), ""))
        for c in range(4):
            glyphs = [g for g in line if columns[c + 1] < g.x0 and g.x1 < columns[c + 2]]
            if glyphs:
                cells.append(_Cell(i, c, _span(glyphs), shape(glyphs)))
    for i, line in enumerate(below):
        cells.append(_Cell(len(lines) + i, -2, _span(line), ""))

    rasters: dict[int, _Raster] = {}

    def raster(dpi: int) -> _Raster:
        if dpi not in rasters:
            rasters[dpi] = _Raster(pdf, pdf_page, dpi, work)
        return rasters[dpi]

    # The units line: the first line of the body, read without a whitelist.
    units = [c for c in cells if c.line == 0 and c.column >= 0]
    if [c.column for c in units] != [0, 1, 2, 3]:
        raise OcrError(f"pdf page {pdf_page}: the body's first line has no glyphs in each amount column")
    for setting in PANEL:
        images = [raster(setting.dpi).crop(c.box, setting.threshold, work / f"u{c.column}.pgm") for c in units]
        if tuple("".join(w) for w in _tesseract(images, setting.psm, None, work)) == UNITS:
            for c in units:
                c.text, c.reading = UNITS[c.column], setting.name
            break
    else:
        raise OcrError(f"pdf page {pdf_page}: the body's first line does not read 'RM RM RM %'")

    by_line: dict[int, list[_Box]] = {i: ln for i, ln in enumerate(lines)}
    for c in cells:
        if c.column >= 0 and c.text is None and c.shape == "–":
            c.text, c.reading = "–", SHAPE_READING
    amounts = [c for c in cells if c.column >= 0 and c.text is None]
    for setting in PANEL:
        images = [raster(setting.dpi).crop(c.box, setting.threshold, work / f"c{n}.pgm") for n, c in enumerate(amounts)]
        for c, words in zip(amounts, _tesseract(images, setting.psm, _AMOUNT_CHARS, work), strict=True):
            text = "".join(words)
            if fits(text, c.shape):
                c.votes[text] = c.votes.get(text, 0) + 1
        for image in images:
            image.unlink(missing_ok=True)
        if setting is PANEL[-1] or PANEL[PANEL.index(setting) + 1].dpi != setting.dpi:
            rasters.pop(setting.dpi, None)  # one resolution in memory at a time
    for c in amounts:
        ranked = sorted(c.votes.items(), key=lambda kv: -kv[1])
        winner = ranked[0][1] if ranked else 0
        runner_up = ranked[1][1] if len(ranked) > 1 else 0
        if winner >= PANEL_QUORUM and 2 * runner_up <= winner:
            c.text = "".join("–" if sh == "–" else ch for ch, sh in zip(ranked[0][0], c.shape, strict=True))
            c.reading = f"panel {winner}/{len(PANEL)}"
    for setting in LABEL_READINGS:
        pending = [c for c in cells if c.column < 0 and (c.text is None or c.unknown)]
        images = [raster(setting.dpi).crop(c.box, setting.threshold, work / f"l{n}.pgm") for n, c in enumerate(pending)]
        for c, words in zip(pending, _tesseract(images, setting.psm, None, work), strict=True):
            text = " ".join(words)
            glyphs = sorted((g for g in by_line.get(c.line, []) if g.x1 < columns[1]), key=lambda g: g.x0)
            if c.column == -1 and not _label_shape_ok(text, glyphs):
                c.tried.append(f"{setting.name}: {text!r}")
                continue
            unknown = unknown_words(text, vocabulary)
            if c.text is None or not unknown:  # the first reading that fits, replaced by one with known words
                c.text, c.reading, c.unknown = text, setting.name, unknown
        for image in images:
            image.unlink(missing_ok=True)

    out_lines: list[dict[str, object]] = []
    for i, line in enumerate(lines):
        row: dict[str, object] = {"top": round(min(g.y0 for g in line), 2), "label": ""}
        cells_out, shapes_out, readings = ["", "", "", ""], ["", "", "", ""], ["", "", "", ""]
        disputed: dict[str, dict[str, int]] = {}  # column -> readings that fit the shape, where they differ
        for c in (c for c in cells if c.line == i):
            reading = c.reading or ("unread: " + "; ".join(c.tried) if c.column < 0 else "unread")
            if c.column == -1:
                row |= {"label": c.text or "", "label_reading": reading}
                if c.unknown:
                    row["label_unknown_words"] = c.unknown
            else:
                cells_out[c.column], shapes_out[c.column], readings[c.column] = c.text or "", c.shape, reading
                if len(c.votes) > 1 or (c.text is None and c.shape != "–"):
                    disputed[str(c.column)] = c.votes
        row = row | {"cells": cells_out, "shapes": shapes_out, "readings": readings}
        out_lines.append(row | ({"votes": disputed} if disputed else {}))
    below_out = [
        {"text": c.text or "", "reading": c.reading or "", "unknown_words": c.unknown} for c in cells if c.column == -2
    ]
    return {"columns": columns, "lines": out_lines, "below": below_out}


_KNOWN_MARKS = set(" 0123456789.,&()-–—'\"“”‘’/+*:%")


def unknown_words(text: str, vocabulary: frozenset[str]) -> list[str]:
    """Words of a label reading not printed in the neighbouring years' Lampiran 1, and any
    character those labels never use ("!", "|", "]" are OCR's readings of a bold I)."""
    odd = [ch for ch in text if not (ch.isalpha() or ch in _KNOWN_MARKS)]
    return odd + [w for w in re.findall(r"[A-Za-z]+", text) if w not in vocabulary]


def _span(glyphs: Sequence[_Box]) -> _Box:
    return _Box(
        min(g.x0 for g in glyphs), min(g.y0 for g in glyphs), max(g.x1 for g in glyphs), max(g.y1 for g in glyphs)
    )


def _dashes(text: str) -> str:
    """OCR reads the statement's en dash between words as "-" or "—"."""
    return re.sub(r"(?<= )[—-](?= )", "–", text)


def layout_line(label: str, cells: Sequence[str]) -> str:
    """One table line as `pdftotext -layout` would print it: the label, then each amount
    right-aligned in its column, so the four-column parser reads it unchanged."""
    line = re.sub(r"\s*[-—–]+\s*\(SAMB\.?[)}]", " – (SAMB.)", _dashes(label))
    for end, cell in zip(_AMOUNT_ENDS, cells, strict=True):
        if cell:
            start = max(end - len(cell), len(line) + 2)
            line = line.ljust(start) + cell
    return line


def ocr_pages(
    pdf: Path,
    raw: list[PageText],
    cache: Path,
    vocabulary: Callable[[], frozenset[str]],
    manual: Sequence[ManualReading] = (),
    refresh: bool = False,
) -> tuple[list[PageText], str]:
    """PageText for each page: the table rebuilt from cached readings (with `manual` readings
    applied), and as -raw text the notes under the table followed by the page's own -raw text
    (its text layer still holds the running head, page number and printer slug).

    `vocabulary` gives the words of the neighbouring years' Lampiran 1, used to choose among
    label readings; it is called only when a page is read, not on a load from the cache.
    Also returns the engine that read the pages, which every cached page must share."""
    cache.mkdir(parents=True, exist_ok=True)
    engine = f"{tesseract_version()}; glyph boxes from {pdftocairo_version()} -svg"
    used: set[ManualReading] = set()
    engines: set[str] = set()
    unread: list[str] = []
    out: list[PageText] = []
    with tempfile.TemporaryDirectory() as tmp:
        for page in raw:
            path = cache / f"p{page.pdf_page:03d}.json"
            if refresh or not path.exists():
                result = {"engine": engine} | read_page(pdf, page.pdf_page, Path(tmp), vocabulary())
                path.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
            data = json.loads(path.read_text())
            engines.add(data["engine"])
            table: list[str] = []
            for line in data["lines"]:
                label, cells = line["label"], list(line["cells"])
                by_hand: set[int] = set()
                for hand in (m for m in manual if (m.pdf_page, m.line_top) == (page.pdf_page, line["top"])):
                    used.add(hand)
                    by_hand.add(hand.column)
                    if hand.column == -1:
                        label = hand.text
                    elif fits(hand.text, line["shapes"][hand.column]):
                        cells[hand.column] = hand.text
                    else:
                        raise OcrError(f"{hand}: the manual reading does not fit the cell's shape")
                readings = {c: r for c, r in enumerate(line["readings"])} | {-1: line.get("label_reading", "")}
                for c, reading in readings.items():
                    if reading.startswith("unread") and c not in by_hand:
                        unread.append(
                            f"pdf page {page.pdf_page}, line top {line['top']} pt, column {c}: {reading} "
                            f"(votes {line.get('votes', {}).get(str(c))})"
                        )
                table.append(layout_line(label, cells))
            notes: list[str] = []
            for below in data["below"]:
                if below["text"].startswith("Nota"):
                    notes.append(_dashes(below["text"]))
                elif difflib.SequenceMatcher(None, below["text"], "(disambung...)").ratio() < 0.7:
                    raise OcrError(f"pdf page {page.pdf_page}: line under the table {below['text']!r}")
            out.append(PageText(page.pdf_page, "\n".join(table + notes), "\n".join(notes + [page.raw])))
    if unread:
        raise OcrError("cells no ManualReading names:\n  " + "\n  ".join(unread))
    if unused := set(manual) - used:
        raise OcrError(f"manual readings that match no cached line: {sorted(unused, key=str)}")
    if len(engines) != 1:
        raise OcrError(f"the cached pages were read by {len(engines)} engines: {sorted(engines)}")
    return out, engines.pop()


def words(pages: Sequence[PageText]) -> frozenset[str]:
    return frozenset(w for page in pages for w in re.findall(r"[A-Za-z]+", page.layout))


# --- pages with a text layer that holds more than the page draws ----------------------------


@dataclass(frozen=True)
class DrawnWord:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def middle(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass(frozen=True)
class DrawnPage:
    """The words of a page's text layer that the page draws, with its table's rules, in
    points from the crop box's top left. FY2020's Lampiran 3 text layer also holds an undrawn
    copy of the table shifted across the spread; a word is kept only where the page paints
    one glyph of it at the word's start and as many dark glyphs as it has characters."""

    pdf_page: int
    words: tuple[DrawnWord, ...]
    columns: tuple[float, ...]  # x of the table's vertical rules, left to right
    rules: tuple[float, ...]  # y of its horizontal rules, top to bottom
    bottom: float  # where the vertical rules end
    unread: tuple[tuple[float, float], ...] = ()  # painted glyphs (x, baseline) in no word kept

    def unread_in(self, top: float, bottom: float) -> list[tuple[float, float]]:
        return [(x, y) for x, y in self.unread if top < y < bottom]

    def lines(self) -> list[list[DrawnWord]]:
        lines: list[list[DrawnWord]] = []
        for w in sorted(self.words, key=lambda w: w.middle):
            if lines and w.middle - lines[-1][0].middle < 2:
                lines[-1].append(w)
            else:
                lines.append([w])
        return [sorted(line, key=lambda w: w.x0) for line in lines]

    def line_no(self, top: float) -> int:
        """The 1-based number, among the page's drawn lines, of the first line below `top`."""
        lines = self.lines()
        return next((i + 1 for i, line in enumerate(lines) if line[0].middle > top), len(lines))

    def band(self, top: float, bottom: float) -> list[list[DrawnWord]]:
        return [line for line in self.lines() if top < line[0].middle < bottom]

    def words_in(self, top: float, bottom: float) -> list[DrawnWord]:
        return [w for line in self.band(top, bottom) for w in line]

    def text(self, top: float, bottom: float) -> str:
        return "\n".join(" ".join(w.text for w in line) for line in self.band(top, bottom))

    def cells(self, top: float, bottom: float, bounds: Sequence[float]) -> list[str]:
        return [
            " ".join(w.text for w in self.words_in(top, bottom) if left < (w.x0 + w.x1) / 2 < right)
            for left, right in pairwise(bounds)
        ]

    def book_page(self) -> int:
        numbers = [w for w in self.words if w.y0 > self.bottom and re.fullmatch(r"\d{1,3}", w.text)]
        if len(numbers) != 1:
            raise OcrError(f"pdf page {self.pdf_page}: {len(numbers)} page numbers drawn under the table, expected 1")
        return int(numbers[0].text)


_USE = re.compile(r"<(/?)(g|use)\b([^>]*?)(/?)>")
_WORD = re.compile(r'<word xMin="([-\d.]+)" yMin="([-\d.]+)" xMax="([-\d.]+)" yMax="([-\d.]+)">(.*?)</word>')


def drawn_page(pdf: Path, pdf_page: int) -> DrawnPage:
    """The page's drawn words. pdftocairo -svg paints each glyph as a reference to a font
    glyph ("glyph-F-G") at its origin; the text layer's words (pdftotext -bbox) say which
    character each painted glyph is wherever a word's span holds exactly one painted glyph
    per character. Each glyph is named by its majority character over those words, and a word
    is kept only if the glyphs painted across its span spell it."""
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        vec = _vectors(pdf, pdf_page, work)
        svg = work / "page.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(pdf_page), "-l", str(pdf_page), str(pdf), str(svg)], check=True)
        defs, body = svg.read_text().split("</defs>", 1)
    inked = {m.group(1) for m in re.finditer(r'<g id="(glyph-[^"]+)">\s*<path[^>]*\bd="[^"]*\d', defs)}
    fills: list[float | None] = []
    painted: list[tuple[str, float, float]] = []  # glyph, x, baseline of every glyph with ink not near white
    for m in _USE.finditer(body):
        close, tag, attrs, empty = m.groups()
        if tag == "g":
            if close:
                fills.pop()
            elif not empty:
                rgb = _RGB.search(attrs)
                fills.append(max(float(v) for v in rgb.groups()) if rgb else None)
            continue
        fill = next((f for f in reversed(fills) if f is not None), None)
        glyph = re.search(r'xlink:href="#([^"]+)"', attrs)
        if glyph is not None and glyph.group(1) in inked and fill is not None and fill < 80:
            painted.append((glyph.group(1), _number_attr(attrs, "x"), _number_attr(attrs, "y")))
    out = subprocess.run(
        ["pdftotext", "-bbox", "-cropbox", "-f", str(pdf_page), "-l", str(pdf_page), str(pdf), "-"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    all_words = [DrawnWord(html.unescape(m.group(5)), *(float(v) for v in m.groups()[:4])) for m in _WORD.finditer(out)]
    candidates: list[tuple[DrawnWord, list[tuple[float, str]]]] = []
    for word in all_words:
        span = sorted(
            (x, g) for g, x, y in painted if word.y0 - 0.5 <= y <= word.y1 + 0.5 and word.x0 - 1.0 <= x < word.x1 - 0.2
        )
        if len(span) == len(word.text):
            candidates.append((word, span))
    # Glyphs are named first from words that overlap no other word of the text layer: where
    # the undrawn copy overlaps drawn text, a word can find the right number of glyphs by
    # chance. A glyph left unnamed is then named from a word whose other glyphs all spell it.
    votes: dict[str, Counter[str]] = {}
    for word, span in candidates:
        if not any(o is not word and _overlap(o, word) for o in all_words):
            for (_, g), ch in zip(span, word.text, strict=True):
                votes.setdefault(g, Counter())[ch] += 1
    name = {g: c.most_common(1)[0][0] for g, c in votes.items() if len(c) == 1}
    if len(name) != len(votes):
        raise OcrError(f"pdf page {pdf_page}: a glyph spells different characters in different words")
    while True:
        found: dict[str, Counter[str]] = {}
        for word, span in candidates:
            pairs = list(zip((g for _, g in span), word.text, strict=True))
            if all(name.get(g, ch) == ch for g, ch in pairs):
                for g, ch in pairs:
                    if g not in name:
                        found.setdefault(g, Counter())[ch] += 1
        new = {g: c.most_common(1)[0][0] for g, c in found.items() if len(c) == 1}
        if not new:
            break
        name |= new
    words = tuple(w for w, span in candidates if "".join(name.get(g, "\0") for _, g in span) == w.text)
    covered = {(round(x, 2), g) for w, span in candidates if w in words for x, g in span}
    unread = tuple((x, y) for g, x, y in painted if (round(x, 2), g) not in covered)
    columns = tuple(sorted({round(x, 1) for x, _, _ in vec.vertical}))
    rules = tuple(sorted({round(y, 1) for y, _, _ in vec.horizontal}))
    return DrawnPage(pdf_page, _join_touching(words), columns, rules, max(b for _, _, b in vec.vertical), unread)


def _join_touching(words: Sequence[DrawnWord]) -> tuple[DrawnWord, ...]:
    """pdftotext splits some spaced-out bold words into letters ("J", "u", "m", ...) that touch;
    words on one line less than 0.5 pt apart are one word (words otherwise stand 1.4 pt or more
    apart)."""
    out: list[DrawnWord] = []
    for w in sorted(words, key=lambda w: (round(w.y0, 1), w.x0)):
        last = out[-1] if out else None
        if last is not None and abs(last.y0 - w.y0) < 0.5 and -0.5 < w.x0 - last.x1 < 0.5:
            out[-1] = DrawnWord(last.text + w.text, last.x0, min(last.y0, w.y0), w.x1, max(last.y1, w.y1))
        else:
            out.append(w)
    return tuple(out)


def _overlap(a: DrawnWord, b: DrawnWord) -> bool:
    return a.x0 < b.x1 and b.x0 < a.x1 and a.y0 < b.y1 and b.y0 < a.y1


def _number_attr(attrs: str, name: str) -> float:
    m = re.search(rf'\b{name}="([-\d.]+)"', attrs)
    if m is None:
        raise OcrError(f"SVG element without {name}: {attrs}")
    return float(m.group(1))
