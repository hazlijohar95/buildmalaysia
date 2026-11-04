"""Parse Lampiran 3 (Penyata Perbelanjaan Kumpulan Wang COVID-19), FY2020-2023.

One flat list of programmes and a grand total ("Jumlah Keseluruhan"), printed across one
two-page spread. The columns differ by year, so each source names its left- and
right-page columns (`SourceDocument.covid_columns`). The row identities prove the
naming: allocation + supplementary + withdrawal + virement = revised, revised - actual =
variance, and spent before the year + actual = spent to date. A name may wrap above or
below the line that carries its amounts.

FY2021-2023 are read from `pdftotext -layout` (parse_covid). FY2020's text layer holds a
second, undrawn copy of the table shifted across the spread, so -layout interleaves the
two; FY2020 is read from the words the pages draw, placed in the table's ruled rows and
columns (parse_covid_drawn).
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from pipeline.development import trailing_values
from pipeline.model import Citation, Correction, CovidAmounts, CovidFundLine, CovidFundStatement, SpreadCitation
from pipeline.ocr import DrawnPage
from pipeline.parse import PRINTER_SLUG, PageText, ParseError, Value

COLUMNS = {
    "ceiling", "spent_prior", "allocation", "supplementary", "withdrawal", "virement",
    "revised", "actual", "variance", "percent", "spent_to_date",
}  # fmt: skip
_RUNNING_HEAD = re.compile(
    r"(?:\d+\s+(?:\|\s*)?)?PENYATA KEWANGAN KERAJAAN PERSEKUTUAN (?P<year>\d{4})(?:\s*(?:\|\s*)?\d+)?"
)
_BOOK_PAGE = re.compile(r"(?<!\S)(\d{1,3})(?!\S)")
_FOOTER = re.compile(rf"\d{{1,3}}|LAMPIRAN 3 - (?:PENYATA )?PERBELANJAAN KUMPULAN WANG COVID-19|{PRINTER_SLUG}")
_ROW = re.compile(r"(?P<code>\d{5})(?:\s+(?P<name>.*))?")
_TOTAL = re.compile(r"Jumlah Keseluruhan")


@dataclass
class _Row:
    code: str | None  # None for the grand total
    parts: list[str]
    lines: list[str]
    first: Citation
    left: list[Value] = field(default_factory=list)


def _units_index(lines: list[str], count: int) -> int:
    pattern = re.compile(r"RM(?:\s+(?:RM|%))*")
    for i, line in enumerate(lines):
        tokens = line.split()
        if tokens and pattern.fullmatch(line.strip()) and len(tokens) == count:
            return i
    raise ParseError(0, 0, "", f"no units line with {count} columns")


def running_head_book_page(page: PageText, head: list[str], year: int) -> int:
    for line in head:
        text = " ".join(line.split())
        m = _RUNNING_HEAD.fullmatch(text)
        if m is not None and int(m["year"]) == year:
            numbers = [int(n) for n in _BOOK_PAGE.findall(text.replace(str(year), ""))]
            if len(numbers) == 1:
                return numbers[0]
    raise ParseError(page.pdf_page, 1, "", "page head has no running head with one book page")


def parse_covid(
    pages: Sequence[PageText], fiscal_year: int, columns: tuple[tuple[str, ...], tuple[str, ...]]
) -> CovidFundStatement:
    left_cols, right_cols = columns
    if set(left_cols + right_cols) - COLUMNS or len(set(left_cols + right_cols)) != len(left_cols + right_cols):
        raise ValueError(f"unknown or repeated Lampiran 3 columns: {columns}")
    if len(pages) != 2:
        raise ParseError(pages[0].pdf_page, 1, "", "Lampiran 3 is expected on one two-page spread")
    left, right = pages
    left_lines, right_lines = left.layout.split("\n"), right.layout.split("\n")
    lu = _units_index(left_lines, len(left_cols))
    ru = _units_index(right_lines, len(right_cols))
    left_book = running_head_book_page(left, left_lines[:lu], fiscal_year)
    right_book = running_head_book_page(right, right_lines[:ru], fiscal_year)
    if (right.pdf_page, right_book) != (left.pdf_page + 1, left_book + 1):
        raise ParseError(right.pdf_page, 1, "", "right page does not follow its left page")

    rows: list[_Row] = []
    for i in range(lu + 1, len(left_lines)):
        text = left_lines[i].strip()
        at = Citation(left.pdf_page, left_book, i + 1, text)
        if not text or _FOOTER.fullmatch(text):
            continue
        label, values, _ = trailing_values(text, len(left_cols))
        if values and len(values) != len(left_cols):
            raise ParseError(left.pdf_page, i + 1, text, f"{len(values)} amounts, expected {len(left_cols)}")
        if _TOTAL.fullmatch(label):
            rows.append(_Row(None, [], [text], at, values))
            continue
        m = _ROW.fullmatch(label)
        if m is not None:
            rows.append(_Row(m["code"], [m["name"] or ""], [text], at, values))
            continue
        if not rows or rows[-1].code is None:
            raise ParseError(left.pdf_page, i + 1, text, "line outside any programme")
        row = rows[-1]
        row.lines.append(text)
        if label:
            row.parts.append(label)
        if values:
            if row.left:
                raise ParseError(left.pdf_page, i + 1, text, "second line of amounts for one programme")
            row.left = values

    right_rows: list[tuple[Citation, list[Value], tuple[str, ...]]] = []
    without_percent = tuple(c for c in right_cols if c != "percent")
    for i in range(ru + 1, len(right_lines)):
        text = right_lines[i].strip()
        if not text or _FOOTER.fullmatch(text):
            continue
        label, values, _ = trailing_values(text, len(right_cols))
        # % Prestasi is not stored, and FY2021 prints one row's below it; the row identities
        # below still check every stored column.
        if not label and len(values) == 1 and right_rows and right_rows[-1][2] == without_percent:
            continue  # the % Prestasi of the row above, printed on its own line (FY2021 p249)
        names = right_cols if len(values) == len(right_cols) else without_percent
        if label or len(values) != len(names):
            raise ParseError(right.pdf_page, i + 1, text, f"expected a row of {len(right_cols)} amounts")
        right_rows.append((Citation(right.pdf_page, right_book, i + 1, text), values, names))

    if len(rows) != len(right_rows) or rows[-1].code is not None or any(r.code is None for r in rows[:-1]):
        raise ParseError(
            left.pdf_page, 1, "", f"{len(rows)} left rows (ending in the total) for {len(right_rows)} right rows"
        )

    built: list[_Built] = []
    for row, (at, values, names) in zip(rows, right_rows, strict=True):
        if not row.left:
            raise ParseError(row.first.pdf_page, row.first.line_no, row.first.text, "programme without amounts")
        cells = dict(zip(left_cols, row.left, strict=True)) | dict(zip(names, values, strict=True))
        citation = SpreadCitation(
            Citation(row.first.pdf_page, row.first.book_page, row.first.line_no, "\n".join(row.lines)), at
        )
        built.append(_Built(row.code, " ".join(" ".join(row.parts).split()), cells, citation))
    return _statement(fiscal_year, built)


@dataclass(frozen=True)
class _Built:
    code: str | None  # None for the grand total
    name: str
    cells: dict[str, Value]  # by column name; a column not printed is absent
    citation: SpreadCitation


def _statement(fiscal_year: int, rows: Sequence[_Built]) -> CovidFundStatement:
    """Check each row's identities and assemble the statement; the last row is the total."""
    if not rows or rows[-1].code is not None or any(r.code is None for r in rows[:-1]):
        raise ParseError(0, 0, "", "Lampiran 3 must be programmes followed by one grand total")
    lines = tuple(CovidFundLine(row.code, row.name, _amounts(row), row.citation) for row in rows[:-1] if row.code)
    if len({line.code for line in lines}) != len(lines):
        raise ParseError(rows[0].citation.left.pdf_page, 1, "", "a programme code repeats")
    return CovidFundStatement(fiscal_year, lines, _amounts(rows[-1]), rows[-1].citation)


def _amounts(row: _Built) -> CovidAmounts:
    at = row.citation.right
    amount = {name: row.cells[name].hundredths if name in row.cells else 0 for name in COLUMNS}
    if amount["allocation"] + amount["supplementary"] + amount["withdrawal"] + amount["virement"] != amount["revised"]:
        raise ParseError(
            at.pdf_page, at.line_no, at.text, "allocation + supplementary + withdrawal + virement != revised"
        )
    if "variance" in row.cells and amount["revised"] - amount["actual"] != amount["variance"]:
        raise ParseError(at.pdf_page, at.line_no, at.text, "revised - actual != variance")
    if amount["spent_prior"] + amount["actual"] != amount["spent_to_date"]:
        raise ParseError(at.pdf_page, at.line_no, at.text, "spent before the year + actual != spent to date")
    return CovidAmounts(
        amount["ceiling"], amount["spent_prior"], amount["allocation"], amount["supplementary"],
        amount["withdrawal"], amount["virement"], amount["revised"], amount["actual"], amount["spent_to_date"],
    )  # fmt: skip


def _units_bottom(page: DrawnPage, amounts: int) -> float:
    """The foot of the units line ("RM RM ..."; the % column's head may carry no unit)."""
    for line in page.lines():
        if [w.text for w in line] in (["RM"] * amounts, ["RM"] * (amounts - 1)):
            return max(w.y1 for w in line)
    raise ParseError(page.pdf_page, 1, "", f"no units line with {amounts} columns")


def parse_covid_drawn(
    left: DrawnPage, right: DrawnPage, fiscal_year: int, columns: tuple[tuple[str, ...], tuple[str, ...]]
) -> tuple[CovidFundStatement, tuple[Correction, ...]]:
    """FY2020: the spread read from the words each page draws (DrawnPage). A row is the band
    between two of the table's horizontal rules, which run across both pages at the same
    heights; a cell is the words between two vertical rules. The left page's first column is
    the label; every other column must be named in `columns`. A cell with no word is read as
    zero (rule BLANK_CELL_READ_AS_ZERO), and a cell holding a lone tick beside its amount
    drops the tick (rule STRAY_MARK_IGNORED)."""
    left_cols, right_cols = columns
    if set(left_cols + right_cols) - COLUMNS or len(set(left_cols + right_cols)) != len(left_cols + right_cols):
        raise ValueError(f"unknown or repeated Lampiran 3 columns: {columns}")
    if len(left.columns) != len(left_cols) + 2 or len(right.columns) != len(right_cols) + 1:
        raise ParseError(left.pdf_page, 1, "", "the spread's vertical rules do not match its columns")
    if left.rules != right.rules:
        raise ParseError(right.pdf_page, 1, "", "the two pages' horizontal rules differ")
    left_book, right_book = left.book_page(), right.book_page()
    if (right.pdf_page, right_book) != (left.pdf_page + 1, left_book + 1):
        raise ParseError(right.pdf_page, 1, "", "right page does not follow its left page")
    units = [_units_bottom(left, len(left_cols)), _units_bottom(right, len(right_cols))]
    if abs(units[0] - units[1]) > 1:
        raise ParseError(right.pdf_page, 1, "", "the two pages' units lines are not level")
    corrections: list[Correction] = []
    built: list[_Built] = []
    for top, bottom in zip(left.rules, left.rules[1:]):
        if bottom <= units[0]:
            continue  # the column heads
        top = max(top, units[0])
        label_words = [w for w in left.words_in(top, bottom) if w.x1 <= left.columns[1]]
        label = " ".join(w.text for w in label_words)
        left_cells = left.cells(top, bottom, left.columns[1:])
        right_cells = right.cells(top, bottom, right.columns)
        for page in (left, right):
            if page.unread_in(top, bottom):
                raise ParseError(page.pdf_page, page.line_no(top), page.text(top, bottom), "glyphs drawn but not read")
        if not label and not any(left_cells + right_cells):
            continue  # a band between a double rule
        m = _ROW.fullmatch(label)
        code = m["code"] if m else None
        if code is None and not _TOTAL.fullmatch(label):
            raise ParseError(left.pdf_page, left.line_no(top), label, "row that is neither a programme nor the total")
        at_left = Citation(left.pdf_page, left_book, left.line_no(top), left.text(top, bottom))
        at_right = Citation(right.pdf_page, right_book, right.line_no(top), right.text(top, bottom))
        cells: dict[str, Value] = {}
        for name, text, at in [
            *zip(left_cols, left_cells, [at_left] * len(left_cols), strict=True),
            *zip(right_cols, right_cells, [at_right] * len(right_cols), strict=True),
        ]:
            if re.fullmatch(r"[`'‘’,]\s+\S+", text):
                corrections.append(Correction("STRAY_MARK_IGNORED", f"{name}: dropped the tick in {text!r}", at))
                text = text.split()[-1]
            if not text:
                corrections.append(Correction("BLANK_CELL_READ_AS_ZERO", f"empty {name} cell read as zero", at))
                text = "-"
            _, values, _ = trailing_values(text, 1)
            if len(values) != 1 or values[0].marks:
                raise ParseError(at.pdf_page, at.line_no, at.text, f"{name} cell {text!r} is not one amount")
            cells[name] = values[0]
        name = " ".join(label.split()[1:]) if code else ""
        built.append(_Built(code, name, cells, SpreadCitation(at_left, at_right)))
    return _statement(fiscal_year, built), tuple(corrections)
