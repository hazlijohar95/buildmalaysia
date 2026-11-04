"""Parse Note 5(a) of the federal statements, "Hasil mengikut penjenisan" (revenue by type).

The table runs over two pages of Note 5, Akaun Hasil Disatukan. It starts after the line
"Hasil mengikut penjenisan bagi tahun berakhir 31 Disember YYYY ...", breaks at
"(disambung)", resumes after "(sambungan)" and ends at "(b) Perbelanjaan Mengurus".
Each row ends in six columns: Anggaran Asal, Anggaran Disemak, Sebenar and % Anggaran
for the year, then Sebenar and % Anggaran for the year before. Amounts are whole ringgit;
`-` is zero. A line without amounts, indented past the row above, continues that row's
name. A row whose full name is in CATEGORIES is that category's printed total; any other
row is an item of the innermost category open. Totals are recomputed from the items by
the revenue_reconciliation view at load time, not here.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass

from pipeline.covid import running_head_book_page
from pipeline.development import trailing_values
from pipeline.model import Citation, RevenueAmounts, RevenueCategory, RevenueItem, RevenueStatement, RevenueTotal
from pipeline.parse import PageText, ParseError, Value

C = RevenueCategory
CATEGORIES: dict[str, tuple[RevenueCategory, RevenueCategory | None]] = {
    "HASIL": (C.REVENUE, None),
    "HASIL CUKAI": (C.TAX, C.REVENUE),
    "Cukai Langsung": (C.DIRECT_TAX, C.TAX),
    "Cukai Tidak Langsung": (C.INDIRECT_TAX, C.TAX),
    "Cukai Tak Langsung": (C.INDIRECT_TAX, C.TAX),  # FY2021's spelling
    "HASIL BUKAN CUKAI": (C.NON_TAX, C.REVENUE),
    "TERIMAAN BUKAN HASIL": (C.NON_REVENUE_RECEIPTS, C.REVENUE),
    "HASIL WILAYAH PERSEKUTUAN": (C.FEDERAL_TERRITORY, C.REVENUE),
}
_LISTS_ITEMS = set(RevenueCategory) - {parent for _, parent in CATEGORIES.values()}
_START = re.compile(
    r"Hasil mengikut penjenisan bagi tahun berakhir 31 Disember (?P<year>\d{4}) adalah seperti berikut:"
)
_RESUME = re.compile(r"\(sambungan\)")
_BREAK = re.compile(r"\(disambung\)")
_END = re.compile(r"\(b\) Perbelanjaan Mengurus")
_HEADER_WORDS = {"Anggaran", "Asal", "Disemak", "Sebenar", "RM", "%"}
_AMOUNT_COLUMNS = (0, 1, 2, 4)  # the other two are % Anggaran, neither stored nor checked


@dataclass
class _Row:
    indent: int
    parts: list[str]
    lines: list[str]
    at: Citation
    amounts: RevenueAmounts


def _only(lines: list[str], pattern: re.Pattern[str], page: PageText, what: str) -> int:
    found = [i for i, line in enumerate(lines) if pattern.fullmatch(line.strip())]
    if len(found) != 1:
        raise ParseError(page.pdf_page, 1, "", f"expected one {what} line, found {len(found)}")
    return found[0]


def _amounts(values: list[Value], page: PageText, line_no: int, text: str) -> RevenueAmounts:
    for i, value in enumerate(values):
        is_amount = i in _AMOUNT_COLUMNS
        if value.marks or not (value.is_dash or value.has_decimals is not is_amount):
            kind = "a whole-ringgit amount" if is_amount else "a percentage with two decimals"
            raise ParseError(page.pdf_page, line_no, text, f"column {i + 1} is not {kind}")
    original, revised, actual, prior = (values[i].hundredths for i in _AMOUNT_COLUMNS)
    return RevenueAmounts(original, revised, actual, prior)


def _rows(pages: Sequence[PageText], fiscal_year: int) -> list[_Row]:
    rows: list[_Row] = []
    book_pages: list[int] = []
    for index, page in enumerate(pages):
        lines = page.layout.split("\n")
        if index == 0:
            start = _only(lines, _START, page, "'Hasil mengikut penjenisan'")
            heading = _START.fullmatch(lines[start].strip())
            if heading is None or int(heading["year"]) != fiscal_year:
                raise ParseError(page.pdf_page, start + 1, lines[start], "note is for another year")
        else:
            start = _only(lines, _RESUME, page, "'(sambungan)'")
        stop = _only(lines, _END if index == len(pages) - 1 else _BREAK, page, "end-of-table")
        if stop < start:
            raise ParseError(page.pdf_page, stop + 1, lines[stop], "table ends before it starts")
        book_pages.append(running_head_book_page(page, lines[:start], fiscal_year))

        open_row: _Row | None = None
        page_rows = 0
        for i in range(start + 1, stop):
            raw, text, line_no = lines[i], lines[i].strip(), i + 1
            if not text:
                open_row = None
                continue
            words = text.split()
            if page_rows == 0 and all(w in _HEADER_WORDS or re.fullmatch(r"\d{4}", w) for w in words):
                if {int(w) for w in words if w.isdigit()} - {fiscal_year, fiscal_year - 1}:
                    raise ParseError(page.pdf_page, line_no, text, "column header names another year")
                continue
            label, values, _ = trailing_values(text, 6)
            indent = len(raw) - len(raw.lstrip())
            if not values:
                if open_row is None or indent <= open_row.indent:
                    raise ParseError(page.pdf_page, line_no, text, "text line that does not continue the row above")
                open_row.parts.append(label)
                open_row.lines.append(text)
                continue
            if len(values) != 6 or not label:
                raise ParseError(page.pdf_page, line_no, text, f"expected a name and 6 columns, got {len(values)}")
            at = Citation(page.pdf_page, book_pages[-1], line_no, text)
            open_row = _Row(indent, [label], [text], at, _amounts(values, page, line_no, text))
            rows.append(open_row)
            page_rows += 1
        if page_rows == 0:
            raise ParseError(page.pdf_page, start + 1, "", "no rows on this page of the table")

    expected = [book_pages[0] + i for i in range(len(pages))]
    if book_pages != expected or [p.pdf_page for p in pages] != [pages[0].pdf_page + i for i in range(len(pages))]:
        raise ParseError(pages[0].pdf_page, 1, "", f"pages are not consecutive: book pages {book_pages}")
    return rows


def parse_revenue(pages: Sequence[PageText], fiscal_year: int) -> RevenueStatement:
    if not pages:
        raise ValueError("no pages given for the revenue note")
    items: list[RevenueItem] = []
    totals: list[RevenueTotal] = []
    open_path: list[RevenueCategory] = []  # the categories enclosing the next row, outermost first
    for row in _rows(pages, fiscal_year):
        name = " ".join(" ".join(row.parts).split())
        citation = Citation(row.at.pdf_page, row.at.book_page, row.at.line_no, "\n".join(row.lines))
        at = (row.at.pdf_page, row.at.line_no, row.at.text)
        if name in CATEGORIES:
            category, parent = CATEGORIES[name]
            if any(t.category == category for t in totals):
                raise ParseError(*at, f"category {category} printed twice")
            if parent is None and open_path or parent is not None and parent not in open_path:
                raise ParseError(*at, f"category {category} is not inside {parent or 'nothing'}")
            del open_path[open_path.index(parent) + 1 if parent else 0 :]
            open_path.append(category)
            totals.append(RevenueTotal(category, parent, name, row.amounts, citation))
        else:
            if not open_path or open_path[-1] not in _LISTS_ITEMS:
                raise ParseError(*at, f"item {name!r} outside a category that lists items")
            items.append(RevenueItem(len(items) + 1, open_path[-1], name, row.amounts, citation))

    missing = set(RevenueCategory) - {t.category for t in totals}
    if missing:
        raise ParseError(pages[0].pdf_page, 1, "", f"categories not printed: {sorted(missing)}")
    names = [i.name for i in items]
    if len(set(names)) != len(names):
        raise ParseError(pages[0].pdf_page, 1, "", "an item name repeats")
    return RevenueStatement(fiscal_year, tuple(items), tuple(totals))
