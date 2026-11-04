"""Parse Lampiran 3 (Penyata Perbelanjaan Kumpulan Wang COVID-19), FY2020-2023.

One flat list of programmes and a grand total ("Jumlah Keseluruhan"), printed across one
two-page spread. The columns differ by year, so each source names its left- and
right-page columns (`SourceDocument.covid_columns`). The row identities prove the
naming: allocation + supplementary + virement = revised, revised - actual = variance,
and spent before the year + actual = spent to date. A name may wrap above or below the
line that carries its amounts.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from pipeline.development import trailing_values
from pipeline.model import Citation, CovidAmounts, CovidFundLine, CovidFundStatement, SpreadCitation
from pipeline.parse import PRINTER_SLUG, PageText, ParseError, Value

COLUMNS = {
    "ceiling", "spent_prior", "allocation", "supplementary", "virement",
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

    lines: list[CovidFundLine] = []
    total: tuple[CovidAmounts, SpreadCitation] | None = None
    for row, (at, values, names) in zip(rows, right_rows, strict=True):
        if not row.left:
            raise ParseError(row.first.pdf_page, row.first.line_no, row.first.text, "programme without amounts")
        cells = dict(zip(left_cols, row.left, strict=True)) | dict(zip(names, values, strict=True))
        amount = {name: cells[name].hundredths if name in cells else 0 for name in COLUMNS}
        if amount["allocation"] + amount["supplementary"] + amount["virement"] != amount["revised"]:
            raise ParseError(at.pdf_page, at.line_no, at.text, "allocation + supplementary + virement != revised")
        if "variance" in cells and amount["revised"] - amount["actual"] != amount["variance"]:
            raise ParseError(at.pdf_page, at.line_no, at.text, "revised - actual != variance")
        if amount["spent_prior"] + amount["actual"] != amount["spent_to_date"]:
            raise ParseError(at.pdf_page, at.line_no, at.text, "spent before the year + actual != spent to date")
        amounts = CovidAmounts(
            amount["ceiling"], amount["spent_prior"], amount["allocation"], amount["supplementary"],
            amount["virement"], amount["revised"], amount["actual"], amount["spent_to_date"],
        )  # fmt: skip
        citation = SpreadCitation(
            Citation(row.first.pdf_page, row.first.book_page, row.first.line_no, "\n".join(row.lines)), at
        )
        if row.code is None:
            total = (amounts, citation)
        else:
            name = " ".join(" ".join(row.parts).split())
            lines.append(CovidFundLine(row.code, name, amounts, citation))
    assert total is not None
    if len({line.code for line in lines}) != len(lines):
        raise ParseError(left.pdf_page, 1, "", "a programme code repeats")
    return CovidFundStatement(fiscal_year, tuple(lines), total[0], total[1])
