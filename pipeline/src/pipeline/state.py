"""Read the revenue and operating-expenditure tables of a state government's financial statements.

Every state prints the same two notes to its Penyata Kewangan, laid out by its own designer:

- Hasil mengikut penjenisannya (revenue by type): HASIL CUKAI, HASIL BUKAN CUKAI and TERIMAAN
  BUKAN HASIL, each a list of items and a "Jumlah ..." total, then JUMLAH HASIL.
- Perbelanjaan Mengurus mengikut Maksud Perbelanjaan (operating expenditure by vote): the
  Tanggungan (charged) votes and the Bekalan (supply) votes, each with its total, then the
  statement's total, often printed both before and after the transfer to the Development Fund.

The tables are read from the words each page draws (`pdftotext -bbox`), not from `-layout`
text: a name wrapped over two or three lines is printed level with, above or below its row's
amounts depending on the state, and its lines are only placed correctly by where they sit on
the page. Words are grouped into lines by height; a line with amounts is a row, and every
other line of the table is a heading, a column header or part of a row's name.

Each table's layout is described by a `TableSpec`; a name the rules place wrongly is fixed
by a `RowName` that names the printed text it replaces, so a parser change cannot leave it
stale. Totals are recomputed from the rows by the `state_reconciliation` view at load time.
"""

import html
import re
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path


class StateParseError(Exception):
    def __init__(self, pdf_page: int, text: str, reason: str) -> None:
        super().__init__(f"pdf page {pdf_page}: {reason}: {text!r}")
        self.pdf_page = pdf_page
        self.text = text
        self.reason = reason


@dataclass(frozen=True)
class Word:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str

    @property
    def y(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass(frozen=True)
class PageWords:
    pdf_page: int
    words: tuple[Word, ...]


def read_words(pdf: Path, pages: tuple[int, int]) -> list[PageWords]:
    """Every word each page draws, with its box in points from the top left."""
    first, last = pages
    out = subprocess.run(
        ["pdftotext", "-enc", "UTF-8", "-bbox", "-f", str(first), "-l", str(last), str(pdf), "-"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    found = re.findall(r"<page [^>]*>(.*?)</page>", out, re.DOTALL)
    if len(found) != last - first + 1:
        raise StateParseError(first, "", f"pdftotext returned {len(found)} pages for {first}-{last}")
    return [PageWords(first + i, tuple(parse_bbox_words(body))) for i, body in enumerate(found)]


_WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')


def parse_bbox_words(body: str) -> list[Word]:
    words = []
    for x0, y0, x1, y1, text in _WORD.findall(body):
        text = html.unescape(text).strip()  # Perak's labels end in tab characters
        if text:
            words.append(Word(float(x0), float(y0), float(x1), float(y1), text))
    return words


# An amount: 1,234.56, (1,234.56) for a negative, or a dash for none. Percentages print the same way.
_AMOUNT = re.compile(r"(?P<neg>\()?(?P<int>\d{1,3}(?:,\d{3})*)\.(?P<dec>\d{2})(?(neg)\))|[-–]")


def parse_amount(token: str) -> int | None:
    """Sen (or hundredths of a percent); None when the token is not an amount."""
    m = _AMOUNT.fullmatch(token)
    if m is None:
        return None
    if m["int"] is None:
        return 0
    n = int(m["int"].replace(",", "")) * 100 + int(m["dec"])
    return -n if m["neg"] else n


@dataclass(frozen=True)
class Line:
    pdf_page: int
    y: float
    label: list[Word]  # the words left of amount_x, in reading order
    amounts: list[Word]  # amount tokens right of amount_x, left to right

    @property
    def label_text(self) -> str:
        return " ".join(w.text for w in self.label)

    @property
    def text(self) -> str:
        return " ".join(w.text for w in sorted(self.label + self.amounts, key=lambda w: w.x0))


def group_lines(page: PageWords, amount_x: float, tolerance: float = 3.0) -> list[Line]:
    """Words whose vertical centres lie within `tolerance` points of each other form a line."""
    rows: list[list[Word]] = []
    for word in sorted(page.words, key=lambda w: (w.y, w.x0)):
        if rows and abs(rows[-1][0].y - word.y) <= tolerance:
            rows[-1].append(word)
        else:
            rows.append([word])
    lines = []
    for row in rows:
        row.sort(key=lambda w: w.x0)
        amounts = [w for w in row if w.x0 >= amount_x and parse_amount(w.text) is not None]
        label = [w for w in row if w not in amounts]
        y = sum(w.y for w in row) / len(row)
        lines.append(Line(page.pdf_page, y, label, amounts))
    return lines


def normalise(text: str) -> str:
    return " ".join(text.replace("’", "'").split()).casefold().rstrip(":")


@dataclass(frozen=True)
class RowName:
    """A row whose name the wrap rule assembles wrongly, because the page itself prints part of
    one row's name level with another's amounts. `printed` is the name as assembled; the load
    fails if no row on `pdf_page` has it."""

    pdf_page: int
    printed: str
    name: str
    evidence: str


@dataclass(frozen=True)
class TableSpec:
    section: str  # "revenue" or "operating"
    pages: tuple[int, int]
    start: str  # regex matched against a line's text; the table begins below it on the first page
    end: str  # regex; the table's last line on the last page (its grand total)
    columns: tuple[str | None, ...]  # each amount column's field, None for a percentage column
    amount_x: float  # amounts start right of this x; a number left of it is part of a name
    # Where a wrapped name's lines sit: "middle" (around its amounts), "top" (the amounts on the first
    # line), "bottom" (on the last), or "coded_top": a coded row's name continues below its amounts and
    # any other row's name ends on its amounts' line.
    wrap: str
    headings: dict[str, str]  # normalised heading text -> category
    totals: dict[str, tuple[str, str | None]]  # normalised total name -> (scope, category)
    transfers: tuple[str, ...] = ()  # normalised names of rows that move money to the Development Fund
    code: str | None = None  # regex of the code that starts a row's name, e.g. r"[TB]\d{2}"
    resume: str | None = None  # regex; on later pages the table continues below it
    skip: tuple[str, ...] = ()  # regexes of lines that are not part of the table (running heads, footers)
    header_words: frozenset[str] = frozenset()  # a line of only these words is a column header
    row_names: tuple[RowName, ...] = ()


DEFAULT_HEADER_WORDS = frozenset(
    {"anggaran", "asal", "disemak", "dipinda", "sebenar", "prestasi", "rm", "%", "perihal", "maksud", "perbelanjaan"}
    | {"kepala", "perkara", "peratus", "pencapaian", "(sambungan)", "(samb.)", "varian"}
)


_REPEATED_HEADER_WORDS = frozenset(
    {"anggaran", "asal", "disemak", "dipinda", "sebenar", "prestasi", "rm", "%", "peratus", "pencapaian", "varian"}
)


@dataclass(frozen=True)
class Row:
    section: str
    category: str
    code: str | None
    name: str
    amounts: dict[str, int | None]  # column field -> sen; None for a cell printed blank
    pdf_page: int
    source_text: str  # the printed lines of the row, top to bottom


@dataclass(frozen=True)
class Total:
    section: str
    scope: str  # "statement", "category", "statement_less_transfer"
    category: str | None
    label: str
    amounts: dict[str, int | None]
    pdf_page: int
    source_text: str


@dataclass(frozen=True)
class Table:
    section: str
    lines: tuple[Row, ...]
    totals: tuple[Total, ...]
    transfers: tuple[Row, ...]
    fixes: tuple[str, ...] = field(default=())  # RowName fixes applied, for the ingest log


_PAGE_NUMBER = re.compile(r"\d{1,3}")


@dataclass
class _Anchor:
    line: Line
    parts: list[Line]


def _region(spec: TableSpec, index: int, count: int, lines: list[Line]) -> list[Line]:
    """The lines of one page that belong to the table."""
    begin = 0
    pattern = spec.start if index == 0 else spec.resume
    if pattern is not None:
        found = [i for i, line in enumerate(lines) if re.search(pattern, line.text)]
        if not found:
            if index == 0:
                raise StateParseError(lines[0].pdf_page if lines else 0, "", f"no line matches start {pattern!r}")
        else:
            begin = found[0] + 1
    stop = len(lines)
    if index == count - 1:
        found = [i for i, line in enumerate(lines) if i >= begin and re.search(spec.end, line.text)]
        if not found:
            raise StateParseError(lines[0].pdf_page if lines else 0, "", f"no line matches end {spec.end!r}")
        stop = found[0] + 1
    return lines[begin:stop]


def _heading(spec: TableSpec, text: str) -> str | None:
    key = normalise(text)
    if spec.code is not None:
        key = normalise(re.sub(rf"^(?:{spec.code})\s+", "", text))
    return spec.headings.get(key)


def parse_table(pages: Sequence[PageWords], spec: TableSpec) -> Table:
    """Read one table over consecutive pages into rows, printed totals and transfer rows."""
    header_words = spec.header_words or DEFAULT_HEADER_WORDS
    # Segments: runs of lines between headings, each with its category.
    segments: list[tuple[str | None, list[Line]]] = [(None, [])]
    for index, page in enumerate(pages):
        lines = _region(spec, index, len(pages), group_lines(page, spec.amount_x))
        pending_heading: list[Line] = []
        seen_amounts = False  # column headers are only read above the page's first row
        for line in lines:
            text = line.label_text
            if any(re.search(p, line.text) for p in spec.skip):
                continue
            if not line.amounts:
                if not text or _PAGE_NUMBER.fullmatch(text):
                    continue
                # Column headers: anything of header words above the page's first row; below it (Melaka
                # repeats the header above its Bekalan votes) only words no name is made of.
                words = header_words if not seen_amounts else _REPEATED_HEADER_WORDS
                if all(w.text.casefold() in words or re.fullmatch(r"\d{4}", w.text) for w in line.label) or (
                    normalise(text) in ("maksud perbelanjaan", "perihal")
                ):
                    continue
                # A heading may wrap over two lines ("TERIMAAN BUKAN" / "HASIL").
                joined = " ".join([*(p.label_text for p in pending_heading), text])
                category = _heading(spec, joined)
                if category is not None:
                    segments.append((category, []))
                    pending_heading = []
                    continue
                if any(normalise(h).startswith(normalise(joined)) for h in spec.headings):
                    pending_heading.append(line)
                    continue
            seen_amounts = seen_amounts or bool(line.amounts)
            if pending_heading:
                segments[-1][1].extend(pending_heading)
                pending_heading = []
            segments[-1][1].append(line)
        if pending_heading:
            segments[-1][1].extend(pending_heading)
        segments.append((segments[-1][0], []))  # a page break ends a segment, keeping its category

    edges = _column_edges(spec, [line for _, lines in segments for line in lines])
    used_fixes: set[RowName] = set()
    rows: list[Row] = []
    totals: list[Total] = []
    transfers: list[Row] = []
    for category, lines in segments:
        for anchor in _assemble(spec, lines):
            row = _row(spec, category, anchor, used_fixes, edges)
            key = normalise(row.name)
            if key in spec.totals:
                scope, total_category = spec.totals[key]
                totals.append(
                    Total(spec.section, scope, total_category, row.name, row.amounts, row.pdf_page, row.source_text)
                )
            elif key in spec.transfers:
                transfers.append(row)
            elif key.startswith("jumlah"):
                raise StateParseError(row.pdf_page, row.source_text, "a total the table spec does not name")
            else:
                if category is None:
                    raise StateParseError(row.pdf_page, row.source_text, "a row before any heading")
                rows.append(row)
    unused = set(spec.row_names) - used_fixes
    if unused:
        fix = min(unused, key=lambda f: f.pdf_page)
        raise StateParseError(fix.pdf_page, fix.printed, "row name fix matches no row")
    if not rows:
        raise StateParseError(pages[0].pdf_page, "", "no rows read")
    fixes = tuple(f"pdf page {f.pdf_page}: {f.printed!r} read as {f.name!r}: {f.evidence}" for f in spec.row_names)
    return Table(spec.section, tuple(rows), tuple(totals), tuple(transfers), fixes)


def _code_of(spec: TableSpec, line: Line) -> str | None:
    if spec.code is None:
        return None
    m = re.match(rf"(?:{spec.code})(?=\s|$)", line.label_text)
    return m.group() if m else None


def _assemble(spec: TableSpec, lines: list[Line]) -> list[_Anchor]:
    """Give every name line of a segment to a row: the amount line it belongs to."""
    anchors = [_Anchor(line, [line]) for line in lines if line.amounts]
    if not anchors:
        if lines:
            raise StateParseError(lines[0].pdf_page, lines[0].text, "name lines with no amounts")
        return []
    by_line = {id(a.line): a for a in anchors}
    for line in lines:
        if line.amounts:
            continue
        above = [a for a in anchors if a.line.y < line.y]
        below = [a for a in anchors if a.line.y > line.y]
        nearest_above = above[-1] if above else None
        nearest_below = below[0] if below else None
        target: _Anchor | None
        if (
            _code_of(spec, line) is not None
            and nearest_below is not None
            and _code_of(spec, nearest_below.line) is None
        ):
            target = nearest_below  # a coded name whose amounts are printed on its last line (Perak B. 33)
        elif spec.wrap == "top":
            target = nearest_above or nearest_below
        elif spec.wrap == "coded_top":
            coded_above = nearest_above is not None and _code_of(spec, nearest_above.line) is not None
            target = nearest_above if coded_above or nearest_below is None else nearest_below
        elif spec.wrap == "bottom":
            target = nearest_below or nearest_above
        else:
            if nearest_above is None or nearest_below is None:
                target = nearest_above or nearest_below
            else:
                up, down = line.y - nearest_above.line.y, nearest_below.line.y - line.y
                if abs(up - down) < 0.5:
                    # Equally near: a row whose code and name start on its amounts' line cannot
                    # begin above it, so the line ends the row above (Sabah p60, 82000).
                    below_code = _code_of(spec, nearest_below.line)
                    if below_code is None or nearest_below.line.label_text == below_code:
                        raise StateParseError(line.pdf_page, line.text, "a name line equally near two rows")
                    target = nearest_above
                else:
                    target = nearest_above if up < down else nearest_below
        assert target is not None
        by_line[id(target.line)].parts.append(line)
    for anchor in anchors:
        anchor.parts.sort(key=lambda p: p.y)
    return anchors


def _row(
    spec: TableSpec, category: str | None, anchor: _Anchor, used: set[RowName], edges: dict[int, list[float]]
) -> Row:
    line = anchor.line
    code = None
    names: list[str] = []
    for part in anchor.parts:
        text = part.label_text
        c = _code_of(spec, part)
        if c is not None:
            if code is not None:
                raise StateParseError(line.pdf_page, line.text, f"two codes in one row: {code}, {c}")
            code = c
            text = text[len(c) :].strip()
        if text:
            names.append(text)
    name = " ".join(" ".join(names).split())
    for fix in spec.row_names:
        if fix.pdf_page == line.pdf_page and normalise(fix.printed) == normalise(name):
            name = fix.name
            used.add(fix)
    source_text = "\n".join(p.text for p in anchor.parts)
    return Row(spec.section, category or "", code, name, _amounts(spec, line, edges), line.pdf_page, source_text)


def _column_edges(spec: TableSpec, lines: list[Line]) -> dict[int, list[float]]:
    """Each page's column right edges: the median right edge of each column over the page's full rows."""
    full: dict[int, list[Line]] = {}
    for line in lines:
        if len(line.amounts) == len(spec.columns):
            full.setdefault(line.pdf_page, []).append(line)
    edges = {}
    for page, rows in full.items():
        edges[page] = [sorted(r.amounts[c].x1 for r in rows)[len(rows) // 2] for c in range(len(spec.columns))]
    return edges


def _amounts(spec: TableSpec, line: Line, edges: dict[int, list[float]]) -> dict[str, int | None]:
    """The row's amounts by column. A row printed with some cells blank (a transfer row printing only
    its actual) places each amount in the column whose right edge, in the page's full rows, is
    nearest; the blank cells are None, not zero."""
    tokens = line.amounts
    if len(tokens) == len(spec.columns):
        places = list(range(len(tokens)))
    else:
        page = min(edges, key=lambda p: abs(p - line.pdf_page)) if edges else None
        if page is None or len(tokens) > len(spec.columns):
            raise StateParseError(
                line.pdf_page, line.text, f"expected {len(spec.columns)} amount columns, found {len(tokens)}"
            )
        reference = edges[page]
        places = [min(range(len(reference)), key=lambda c: abs(t.x1 - reference[c])) for t in tokens]
        if places != sorted(set(places)) or any(abs(t.x1 - reference[c]) > 12 for t, c in zip(tokens, places)):
            raise StateParseError(line.pdf_page, line.text, "amounts that do not sit under the table's columns")
    out: dict[str, int | None] = {c: None for c in spec.columns if c is not None}
    for token, place in zip(tokens, places, strict=True):
        column = spec.columns[place]
        if column is not None:
            out[column] = parse_amount(token.text)
    return out
