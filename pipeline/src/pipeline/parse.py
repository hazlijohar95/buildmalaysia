"""Parse Lampiran 1 (Penyata Perbelanjaan Mengurus) from per-page pdftotext text.

Every line is classified by a regex table (TEXT_KINDS for lines without amounts,
ROW_KINDS for lines ending in the seven numeric columns). A small state machine
(section, vote, programme, activity, phase, and one pending wrapped label) turns
the classified lines into a Statement. A line the machine cannot place is a
ParseError naming the PDF page and line; nothing is skipped silently.
"""

import difflib
import math
import re
from collections.abc import Sequence
from dataclasses import dataclass, replace
from enum import Enum, auto
from fractions import Fraction

from pipeline.model import (
    OBJECT_GROUPS,
    Activity,
    Amounts,
    Citation,
    Correction,
    OperatingLine,
    PrintedTotal,
    Programme,
    Scope,
    Section,
    Statement,
    Vote,
)

DASH = "–"  # the statement prints zero as an en dash


@dataclass(frozen=True)
class PageText:
    pdf_page: int
    layout: str  # `pdftotext -layout`, the input for every table line
    raw: str  # `pdftotext -raw`, read only for the "Nota:" footnotes, which -layout garbles


class ParseError(Exception):
    def __init__(self, pdf_page: int, line_no: int, text: str, message: str) -> None:
        super().__init__(f"pdf page {pdf_page}, line {line_no}: {message}\n  | {text.strip()}")
        self.pdf_page = pdf_page
        self.line_no = line_no


# --- numeric columns -------------------------------------------------------------

_VALUE = re.compile(
    rf"(?P<marks>\**)(?:{DASH}|(?P<neg>\()?(?P<int>\d{{1,3}}(?:,\d{{3}})*)(?:\.(?P<dec>\d{{2}}))?(?(neg)\)))"
)
# "Jumlah" as OCR reads the italic J: "dumlah", "dumiah", "Jumiah", "JUMLAH" kept as is.
_OCR_JUMLAH = re.compile(r"^(?:[dJjl]{1,2}[uv][mn]{1,2}[il1|]{1,2}a[hn]|JUMLAH|JUMIAH)(?= )")
_UNSEPARATED = re.compile(r"\d{4,}\.\d{2}")
_NUMBER_IN_TEXT = re.compile(r"(?<!\S)\(?\d{1,3}(?:,\d{3})+(?:\.\d{2})?\)?(?!\S)|(?<!\S)\d+\.\d{2}(?!\S)")


@dataclass(frozen=True)
class Value:
    hundredths: int  # sen for amounts, hundredths of a percent for % Prestasi
    marks: str
    is_dash: bool
    has_decimals: bool
    unseparated: bool = False  # printed without thousands separators (THOUSANDS_SEPARATORS_MISSING)


def parse_value(token: str) -> Value | None:
    m = _VALUE.fullmatch(token)
    if m is None:
        return None
    if m["int"] is None:
        return Value(0, m["marks"], True, False)
    n = int(m["int"].replace(",", "")) * 100 + int(m["dec"] or 0)
    return Value(-n if m["neg"] else n, m["marks"], False, m["dec"] is not None)


@dataclass(frozen=True)
class Layout:
    """The columns a Lampiran 1 row prints.

    FY2021 onwards: Asal, Tambahan/(Kurangan), Viremen, Jumlah, Sebenar, % Prestasi, Varian.
    FY2016-2019: Asal, Dipinda (the revised estimate), Amaun (actual) and %; the statement
    does not say how the revision splits into supplementary allocation and virement.
    """

    columns: tuple[str, ...]
    units: re.Pattern[str]  # the line of units under the column heads
    blank_columns: range  # columns BLANK_CELL_READ_AS_ZERO may find empty


SEVEN_COLUMNS = Layout(
    ("Asal", "Tambahan/(Kurangan)", "Viremen", "Jumlah", "Sebenar", "% Prestasi", "Varian"),
    re.compile(r"RM\s+RM\s+RM\s+RM\s+RM\s+%\s+RM"),
    range(6),  # FY2021 leaves one % Prestasi blank. Varian is never blank
)
FOUR_COLUMNS = Layout(
    ("Asal", "Dipinda", "Amaun", "%"),
    re.compile(r"RM\s+RM\s+RM\s+%"),
    range(3),  # FY2018 p113 leaves an Amaun cell blank; % is never blank
)
LAYOUTS = {7: SEVEN_COLUMNS, 4: FOUR_COLUMNS}


@dataclass(frozen=True)
class _Split:
    label: str
    values: list[Value]  # the trailing numeric tokens, at most one per column
    ends: list[int]  # character column where each value ends in the layout line


def _split(line: str, limit: int = 7) -> _Split:
    """Split a layout line into its label and up to `limit` trailing numeric tokens."""
    values: list[Value] = []
    ends: list[int] = []
    label_end = len(line)
    for token in reversed(list(re.finditer(r"\S+", line))):
        value = parse_value(token.group())
        if value is None and _UNSEPARATED.fullmatch(token.group()):
            # FY2017 p102, p163: "42830941.86", drawn so on the page.
            integer, decimals = token.group().split(".")
            value = Value(int(integer) * 100 + int(decimals), "", False, True, unseparated=True)
        if value is None or len(values) == limit:
            break
        values.insert(0, value)
        ends.insert(0, token.end())
        label_end = token.start()
    return _Split(line[:label_end].strip(), values, ends)


def _fill_blank_cell(row: _Split, reference: _Split, layout: Layout) -> tuple[_Split, int] | None:
    """Named rule BLANK_CELL_READ_AS_ZERO: a row printed with one cell left empty.

    Each printed token is placed in the column whose right edge, in the nearest complete
    row of the same page, is closest. The placement must be strictly left to right and
    leave exactly one column empty, one the layout allows to be blank; it reads as zero.
    """
    n = len(layout.columns)
    columns = [min(range(n), key=lambda c: abs(end - reference.ends[c])) for end in row.ends]
    if len(set(columns)) != n - 1 or columns != sorted(columns):
        return None
    missing = next(c for c in range(n) if c not in columns)
    if missing not in layout.blank_columns:
        return None
    values = row.values[:missing] + [Value(0, "", True, False)] + row.values[missing:]
    return _Split(row.label, values, []), missing


def _join_split_row(first: _Split, second: _Split, columns: int) -> tuple[_Split, bool] | None:
    """Named rules SPLIT_ROW_JOINED and STRAY_DASH_DROPPED: one printed row whose text layer
    breaks after a few amounts, continuing on the next line with no label.

    The two lines' amounts are joined. If that gives one token more than the columns and
    exactly one is a dash, the dash is a text-layer artefact not drawn on the page; it is
    dropped only if the remaining tokens pass every row check.
    """
    if not first.label or not first.values or second.label or not second.values:
        return None
    # Order by where each amount ends on the page: a continued cell can sit left of the
    # first line's last amount (FY2021 p146 prints % Prestasi below its row).
    ordered = sorted(zip(first.ends + second.ends, first.values + second.values, strict=True), key=lambda t: t[0])
    values = [v for _, v in ordered]
    if len(values) == columns:
        return _Split(first.label, values, []), False
    dashes = [i for i, v in enumerate(values) if v.is_dash]
    if len(values) != columns + 1 or len(dashes) != 1:
        return None
    kept = values[: dashes[0]] + values[dashes[0] + 1 :]
    if _check_row(kept)[1] is not None:
        return None
    return _Split(first.label, kept, []), True


def expected_percent(actual: int, revised: int) -> int | None:
    """% Prestasi in hundredths as this statement prints it, or None where no rule is known.

    Observed convention (FY2025): Sebenar / Jumlah x 100 rounded half up to 2 dp,
    except that a line not fully spent never shows 100.00; it shows 99.99. Zero prints
    as an en dash.
    """
    if revised == 0:
        return 0 if actual == 0 else None
    rounded = math.floor(Fraction(actual * 10_000, revised) + Fraction(1, 2))
    if rounded == 10_000 and actual < revised:
        return 9_999
    return rounded


def _check_row(values: list[Value]) -> tuple[Amounts, str | None, str | None]:
    """Check a row's arithmetic: (amounts, error, percent difference worth logging).

    % Prestasi is derived and never stored, and FY2023-2024 print values that disagree with
    their own row (a dash for 100.00, 99.99 for 99.33). A differing value is logged under the
    named rule PRINTED_PERCENT_DIFFERS. In the seven-column layout, column placement is
    already proven by the two identities below, which use every amount column. The
    four-column layout has no identity among its amounts; % (Sebenar / Dipinda) is the only
    row check, and the reconciliation views check every column against the totals.
    """
    if len(values) == 4:
        original, revised, actual, percent = values
        amounts = Amounts(original.hundredths, None, None, revised.hundredths, actual.hundredths)
    else:
        original, supplementary, virement, revised, actual, percent, variance = values
        amounts = Amounts(
            original.hundredths, supplementary.hundredths, virement.hundredths, revised.hundredths, actual.hundredths
        )
        total = original.hundredths + supplementary.hundredths + virement.hundredths
        if total != amounts.revised:
            return amounts, f"Asal + Tambahan + Viremen = {total} sen but Jumlah prints {amounts.revised} sen", None
        if amounts.revised - amounts.actual != variance.hundredths:
            error = (
                f"Jumlah - Sebenar = {amounts.revised - amounts.actual} sen but Varian prints {variance.hundredths} sen"
            )
            return amounts, error, None
    if not percent.is_dash and not percent.has_decimals:
        return amounts, "% column is not a 2-decimal percentage", None
    expected = expected_percent(amounts.actual, amounts.revised)
    if expected == percent.hundredths:
        return amounts, None, None
    rule = "no known rule" if expected is None else f"the rule gives {expected / 100:.2f}"
    message = f"% Prestasi prints {percent.hundredths / 100:.2f}; {rule}"
    return amounts, None, message


# --- line classification -----------------------------------------------------------


class Kind(Enum):
    BLANK = auto()
    DISAMBUNG = auto()  # "(disambung...)", continued-on-next-page marker
    APPENDIX_PAGE = auto()  # appendix page number in the footer
    LAMPIRAN_FOOTER = auto()
    NOTES_LABEL = auto()  # a bare "Nota:" above activity notes (FY2022)
    PRINTER_SLUG = auto()  # InDesign file name and print time, outside the rendered page area
    RUNNING_HEAD = auto()  # "PENYATA KEWANGAN KERAJAAN PERSEKUTUAN", printed inside the table area (FY2016-2019)
    SLOGAN = auto()  # "$10 Excellent Accounting @ Your Service" at the foot of the page (FY2016-2017)
    NOTES = auto()
    ACTIVITY_NOTE = auto()  # "[Nota :] *B04 - Program/Aktiviti - 010100 - <text>" or "(*) B04 - ...": a marked activity
    ACTIVITY_NOTE_SAME_VOTE = auto()  # "– Program/Aktiviti - 050600 - <text>": the next note, same vote (FY2018)
    SECTION_HEADER = auto()
    VOTE_HEADER = auto()
    PROGRAMME_HEADER = auto()
    ACTIVITY_HEADER = auto()
    ACTIVITY_HEADER_NO_LEADING_ZERO = auto()
    JUMLAH_PREFIX = auto()  # first half of a vote total whose amounts sit on the next line
    CONTINUATION = auto()  # wrapped part of the label above
    LEAF = auto()
    LEAF_EXTRA_LEADING_ZERO = auto()
    ACTIVITY_TOTAL = auto()
    PROGRAMME_TOTAL = auto()
    OBJECT_TOTAL = auto()
    SECTION_TOTAL = auto()
    STATEMENT_TOTAL = auto()
    VOTE_TOTAL = auto()
    BARE_AMOUNTS = auto()
    UNCLASSIFIED_ROW = auto()


_OBJECT_LABELS: dict[str, str] = {name: code for code, name in OBJECT_GROUPS.items()} | {
    "Pemberian & Kenaan Bayaran Tetap": "40000",
    "Perbelanjaan - perbelanjaan Lain": "50000",
}
_OBJECT_ALTERNATIVES = "|".join(re.escape(label) for label in _OBJECT_LABELS)


PRINTER_SLUG = r"\S.*\.indd \d+\s+\d{1,2}/\d{1,2}/(?:\d{4}|\d{2}) \d{1,2}:\d{2} [AP]M"  # FY2016: 7/14/17


def _table(rows: list[tuple[Kind, str]]) -> tuple[tuple[Kind, re.Pattern[str]], ...]:
    return tuple((kind, re.compile(pattern)) for kind, pattern in rows)


TEXT_KINDS = _table(
    [
        (Kind.BLANK, r""),
        (Kind.DISAMBUNG, r"\(dis ?ambung\.\.\.\)"),
        (Kind.APPENDIX_PAGE, r"\d{1,3}"),
        (Kind.LAMPIRAN_FOOTER, r"(?i:LAMPIRAN 1 [-–] (?:PENYATA )?PERBELANJAAN MENGURUS)"),
        (Kind.PRINTER_SLUG, PRINTER_SLUG),
        (Kind.RUNNING_HEAD, r"(?:\$10\s+)?PENYATA KEWANGAN KERAJAAN PERSEKUTUAN(?:\s+\d{4})?|\[2[O0]1\d\]"),
        (Kind.SLOGAN, r"\$10|(?:\$10\s+)?Excellent Accounting @ Your Service(?:\s+(?:\$10|\d{1,3}))?"),
        (Kind.NOTES_LABEL, r"Nota\s*:"),
        (
            Kind.ACTIVITY_NOTE,
            (
                r"(?:Nota\s*:\s*)?\(?\*\)?\s*(?P<vote>[TB])\.?(?P<num>\d{2})\s*[-–]\s*Program/Aktiviti"
                r"\s*[-–]\s*(?P<codes>\d{6}(?:\s*(?:,|dan)\s*\d{6})*)\s*[-–]\s*.+"
            ),
        ),
        (
            Kind.ACTIVITY_NOTE_SAME_VOTE,
            r"[-–]\s*Program/Aktiviti\s*[-–]\s*(?P<codes>\d{6}(?:\s*(?:,|dan)\s*\d{6})*)\s*[-–]\s*.+",
        ),
        (Kind.NOTES, r"Nota:.*"),
        (Kind.SECTION_HEADER, r"PERBELANJAAN (?P<code>TANGGUNGAN|BEKALAN)"),
        (Kind.VOTE_HEADER, r"(?P<code>[TB]\.\d{2}) (?P<name>.+)"),
        (Kind.PROGRAMME_HEADER, r"(?P<code>\d{2}0000) (?P<name>.+)"),
        (Kind.ACTIVITY_HEADER, r"(?P<mark>\*?)(?P<code>\d{4}00) (?P<name>.+)"),
        (Kind.ACTIVITY_HEADER_NO_LEADING_ZERO, r"(?P<mark>\*?)(?P<code>[1-9](?!00)\d{2}00) (?P<name>.+)"),
        (Kind.JUMLAH_PREFIX, r"JUMLAH (?P<name>.+)"),
        (Kind.CONTINUATION, r".+"),
    ]
)

ROW_KINDS = _table(
    [
        (Kind.LEAF, r"(?P<code>[1-5]0000) (?P<name>.+)"),
        (Kind.LEAF_EXTRA_LEADING_ZERO, r"0(?P<code>[1-5]0000) (?P<name>.+)"),
        (Kind.PROGRAMME_TOTAL, r"Jumlah (?P<code>\d{2}0000)"),
        (Kind.ACTIVITY_TOTAL, r"Jumlah (?P<code>0?\d{4}00)"),  # FY2023 prints one as 0060700
        (Kind.OBJECT_TOTAL, rf"(?P<jumlah>Jumlah )?(?P<name>{_OBJECT_ALTERNATIVES})"),
        (Kind.SECTION_TOTAL, r"JUMLAH PERBELANJAAN (?P<code>TANGGUNGAN|BEKALAN)"),
        (Kind.STATEMENT_TOTAL, r"JUMLAH KESELURUHAN MENGURUS"),
        (Kind.VOTE_TOTAL, r"JUMLAH (?P<name>.+)"),
        (Kind.BARE_AMOUNTS, r""),
        (Kind.UNCLASSIFIED_ROW, r".+"),
    ]
)

_HEADER_KINDS = {
    Kind.SECTION_HEADER,
    Kind.VOTE_HEADER,
    Kind.PROGRAMME_HEADER,
    Kind.ACTIVITY_HEADER,
    Kind.ACTIVITY_HEADER_NO_LEADING_ZERO,
}
_IGNORED_KINDS = {
    Kind.BLANK,
    Kind.DISAMBUNG,
    Kind.APPENDIX_PAGE,
    Kind.LAMPIRAN_FOOTER,
    Kind.PRINTER_SLUG,
    Kind.RUNNING_HEAD,
    Kind.SLOGAN,
    Kind.NOTES_LABEL,
}
_SECTIONS = {"TANGGUNGAN": Section.CHARGED, "BEKALAN": Section.SUPPLY}
_DISAMBUNG_SUFFIX = re.compile(r"(?<=\S)\s+\(dis ?ambung\.\.\.\)$")
_SAMB = re.compile(r"(?P<rest>.*?)\s*(?:[-–]\s*)?\(SAMB\.\)")


def _classify(table: tuple[tuple[Kind, re.Pattern[str]], ...], text: str) -> tuple[Kind, re.Match[str]]:
    for kind, pattern in table:
        match = pattern.fullmatch(text)
        if match is not None:
            return kind, match
    raise AssertionError(f"classifier table has no catch-all for {text!r}")


# --- page furniture ----------------------------------------------------------------

_RUNNING_HEAD = re.compile(
    r"(?:(?P<left>\d+)\s+(?:\|\s*)?)?PENYATA KEWANGAN KERAJAAN PERSEKUTUAN (?P<year>\d{4})(?:\s*(?:\|\s*)?(?P<right>\d+))?"
)
_COLUMN_HEAD_WORDS = {
    "Anggaran",
    "Sebenar",
    "Varian",
    "Maksud",
    "Perbelanjaan",
    "Asal",
    "Tambahan/",
    "(Kurangan)",
    "Viremen",
    "Tambah/(Kurang)",
    "Jumlah",
    "Amaun",
    "Prestasi",
    "Kurang/(Lebih)",
    "Belanja",
    "Dipinda",
}
_SLUG_PAGE = re.compile(r"\.indd (\d+)\s")
_STRAY_GLYPH = re.compile(r"(?P<keep>(?:.*[\d–])?)\s+(?P<glyph>[a-z])\s*")
_TRAILING_BANG = re.compile(r"\s*!\s*$")


def slug_book_page(page: PageText) -> int:
    """FY2016-2019: the running head carries no page number. The book page is printed in
    the side tab or foot, beside the appendix's own page counter, so it is read from the
    printer slug ("... .indd 65 ...") and must also be printed on the page: a line of the
    page's -raw text starts with it."""
    raw = page.raw.split("\n")
    slugs = [m[1] for line in raw if (m := _SLUG_PAGE.search(line + " "))]
    if len(slugs) != 1:
        raise ParseError(page.pdf_page, 1, "", f"expected one printer slug, found {len(slugs)}")
    number = slugs[0]
    if not any(re.match(rf"{number}(?!\S)", line.strip()) for line in raw if not _SLUG_PAGE.search(line + " ")):
        raise ParseError(page.pdf_page, 1, "", f"slug page {number} is not printed on the page")
    return int(number)


def _unbang(line: str) -> str:
    """A head line with the "!" FY2016-2018 put after each column head word removed."""
    return " ".join(word.removesuffix("!") for word in line.split())


# --- state machine -----------------------------------------------------------------


class Phase(Enum):
    START = auto()
    SECTION_OPEN = auto()
    VOTE_OPEN = auto()
    PROGRAMME_OPEN = auto()
    ACTIVITY = auto()
    ACTIVITY_DONE = auto()
    PROGRAMME_OBJECTS = auto()
    PROGRAMME_DONE = auto()
    VOTE_OBJECTS = auto()
    VOTE_DONE = auto()
    SECTION_OBJECTS = auto()
    SECTION_DONE = auto()
    STATEMENT_OBJECTS = auto()
    STATEMENT_DONE = auto()
    NOTES = auto()


class Event(Enum):
    NEW_SECTION = auto()
    NEW_VOTE = auto()
    NEW_PROGRAMME = auto()
    NEW_ACTIVITY = auto()
    LEAF = auto()
    ACTIVITY_TOTAL = auto()
    PROGRAMME_OBJECT = auto()
    PROGRAMME_TOTAL = auto()
    VOTE_OBJECT = auto()
    VOTE_TOTAL = auto()
    SECTION_OBJECT = auto()
    SECTION_TOTAL = auto()
    STATEMENT_OBJECT = auto()
    STATEMENT_TOTAL = auto()
    NOTES = auto()


P = Phase
TRANSITIONS: dict[Event, dict[Phase, Phase]] = {
    Event.NEW_SECTION: {P.START: P.SECTION_OPEN, P.SECTION_DONE: P.SECTION_OPEN},
    Event.NEW_VOTE: {P.SECTION_OPEN: P.VOTE_OPEN, P.VOTE_DONE: P.VOTE_OPEN},
    Event.NEW_PROGRAMME: {P.VOTE_OPEN: P.PROGRAMME_OPEN, P.PROGRAMME_DONE: P.PROGRAMME_OPEN},
    Event.NEW_ACTIVITY: {P.PROGRAMME_OPEN: P.ACTIVITY, P.ACTIVITY_DONE: P.ACTIVITY},
    Event.LEAF: {P.ACTIVITY: P.ACTIVITY},
    Event.ACTIVITY_TOTAL: {P.ACTIVITY: P.ACTIVITY_DONE},
    Event.PROGRAMME_OBJECT: {P.ACTIVITY_DONE: P.PROGRAMME_OBJECTS, P.PROGRAMME_OBJECTS: P.PROGRAMME_OBJECTS},
    Event.PROGRAMME_TOTAL: {P.ACTIVITY_DONE: P.PROGRAMME_DONE, P.PROGRAMME_OBJECTS: P.PROGRAMME_DONE},
    Event.VOTE_OBJECT: {P.PROGRAMME_DONE: P.VOTE_OBJECTS, P.VOTE_OBJECTS: P.VOTE_OBJECTS},
    Event.VOTE_TOTAL: {P.PROGRAMME_DONE: P.VOTE_DONE, P.VOTE_OBJECTS: P.VOTE_DONE},
    Event.SECTION_OBJECT: {P.VOTE_DONE: P.SECTION_OBJECTS, P.SECTION_OBJECTS: P.SECTION_OBJECTS},
    Event.SECTION_TOTAL: {P.VOTE_DONE: P.SECTION_DONE, P.SECTION_OBJECTS: P.SECTION_DONE},
    Event.STATEMENT_OBJECT: {P.SECTION_DONE: P.STATEMENT_OBJECTS, P.STATEMENT_OBJECTS: P.STATEMENT_OBJECTS},
    Event.STATEMENT_TOTAL: {P.SECTION_DONE: P.STATEMENT_DONE, P.STATEMENT_OBJECTS: P.STATEMENT_DONE},
    Event.NOTES: {P.STATEMENT_DONE: P.NOTES},
}

# A "Jumlah <object group>" line totals the vote, section or statement that just closed.
_JUMLAH_OBJECT_SCOPES = {
    Event.VOTE_OBJECT: Scope.VOTE,
    Event.SECTION_OBJECT: Scope.SECTION,
    Event.STATEMENT_OBJECT: Scope.STATEMENT,
}

_NOTE = re.compile(r"\((?P<marker>\*+)\)\s*[-–]\s*(?P<text>.+?)(?=\s*\(\*+\)\s*[-–]|$)")


@dataclass
class _Pending:
    """A label that may continue on following lines: a header, or a vote total."""

    kind: Kind
    code: str
    parts: list[str]
    source_lines: list[str]
    samb: bool
    pdf_page: int
    book_page: int
    line_no: int
    amounts: Amounts | None = None
    marks: str = ""

    @property
    def name(self) -> str:
        # "SUMBER ASLI , ALAM" and "SUMBER ASLI, ALAM" name the same vote in FY2023.
        return re.sub(r"\s+([,.)])", r"\1", " ".join(" ".join(self.parts).split()))

    @property
    def citation(self) -> Citation:
        return Citation(self.pdf_page, self.book_page, self.line_no, "\n".join(self.source_lines))


class _Parser:
    def __init__(self, fiscal_year: int, layout: Layout, gaps_after: tuple[int, ...] = (), ocr: bool = False) -> None:
        self.fiscal_year = fiscal_year
        self.layout = layout
        self.ocr = ocr  # lines rebuilt from OCR (FY2020): labels are normalised, misprint rules off
        self.gaps_after = gaps_after  # PDF pages after which the document is known to lack a page
        self.in_gap = False  # the first lines after a known gap, until the first row
        self.gaps_seen: set[int] = set()  # gaps where a vote was found to resume
        self.gap_after = 0
        self.phase = Phase.START
        self.section: Section | None = None
        self.vote: Vote | None = None
        self.programme: Programme | None = None
        self.activity: Activity | None = None
        self.pending: _Pending | None = None
        self.votes: list[Vote] = []
        self.programmes: list[Programme] = []
        self.activities: list[Activity] = []
        self.lines: list[OperatingLine] = []
        self.totals: list[tuple[PrintedTotal, str]] = []  # with footnote markers, resolved at the end
        self.leaf_keys: set[tuple[str, str, str]] = set()
        self.corrections: list[Correction] = []
        self.notes: dict[str, str] = {}
        self.activity_notes: dict[tuple[str, str], str] = {}  # (vote, activity) -> note
        self.marked_activities: set[tuple[str, str]] = set()
        self.note_keys: list[tuple[str, str]] = []  # the activity note a wrapped line continues
        self.repeated_code_notes: dict[str, tuple[str, Citation]] = {}  # vote -> a note naming a code twice
        self.notes_page: int | None = None
        self.book_page_offset: int | None = None
        self.where = Citation(0, 0, 0, "")

    # errors

    def fail(self, message: str, at: Citation | None = None) -> ParseError:
        at = at or self.where
        return ParseError(at.pdf_page, at.line_no, at.text, message)

    def transition(self, event: Event, at: Citation | None = None) -> None:
        nxt = TRANSITIONS[event].get(self.phase)
        if nxt is None:
            raise self.fail(f"{event.name} cannot follow {self.phase.name}", at)
        self.phase = nxt

    # pages

    def feed_page(self, page: PageText) -> None:
        if page.pdf_page - 1 in self.gaps_after:
            # A registered KnownGap: the page that belongs here is missing from the PDF. The
            # open vote and programme end without their totals; the headings that follow may
            # continue a vote and programme never opened (handled in open_vote, open_programme).
            self.in_gap = True
            self.gap_after = page.pdf_page - 1
        width = len(self.layout.columns)
        # FY2016-2018 end column heads and some lines with a "!" the page does not draw.
        lines = [_TRAILING_BANG.sub("", line) for line in page.layout.split("\n")]
        units = next((i for i, line in enumerate(lines) if self.layout.units.fullmatch(_unbang(line))), None)
        if units is None:
            for i, line in enumerate(lines):
                if len(_split(line, width).values) >= width - 1:
                    raise ParseError(page.pdf_page, i + 1, line, "amounts on a page with no table header")
            return
        if self.layout is FOUR_COLUMNS:
            book_page = self.slug_book_page(page, [_unbang(line) for line in lines[:units]])
        else:
            book_page = self.book_page(page, lines[:units])
        for i in range(units + 1, len(lines)):
            if lines[i].lstrip().startswith("`"):
                # Named rule STRAY_BACKTICK_IGNORED: the text layer carries a "`" at the
                # start of the line that the rendered page does not show.
                at = Citation(page.pdf_page, book_page, i + 1, lines[i].strip())
                self.corrections.append(Correction("STRAY_BACKTICK_IGNORED", "dropped a leading ` not rendered", at))
                lines[i] = lines[i].replace("`", " ", 1)
            if (glyph := _STRAY_GLYPH.fullmatch(lines[i])) is not None:
                # Named rule STRAY_GLYPH_IGNORED: a lone lowercase letter after a row's last
                # amount, or on a line of its own, that the rendered page does not show
                # (FY2018 p141 "99.94 b" and "u").
                at = Citation(page.pdf_page, book_page, i + 1, lines[i].strip())
                detail = f"dropped a '{glyph['glyph']}' not rendered"
                self.corrections.append(Correction("STRAY_GLYPH_IGNORED", detail, at))
                lines[i] = glyph["keep"]
        # "(disambung...)" (continued) can sit in the Varian column and push that amount to
        # the next line (FY2021 p111); drop it before splitting so the row can be rejoined.
        lines = [_DISAMBUNG_SUFFIX.sub("", line) for line in lines]
        splits = [_split(line, width) for line in lines]
        for i in range(units + 1, len(lines) - 1):
            if 0 < len(splits[i].values) < width:
                joined = _join_split_row(splits[i], splits[i + 1], width)
                if joined is not None:
                    at = Citation(page.pdf_page, book_page, i + 1, lines[i].strip())
                    self.corrections.append(
                        Correction("SPLIT_ROW_JOINED", "amounts continued on the next text line", at)
                    )
                    if joined[1]:
                        self.corrections.append(
                            Correction("STRAY_DASH_DROPPED", "dropped a '–' the page does not draw", at)
                        )
                    splits[i], splits[i + 1] = joined[0], _Split("", [], [])
                    lines[i], lines[i + 1] = lines[i].rstrip() + "\n" + lines[i + 1].strip(), ""
        for i in range(units + 1, len(lines) - 1):
            below = next((j for j in range(i + 1, len(lines)) if lines[j].strip()), None)
            if (
                not splits[i].label
                and len(splits[i].values) == width
                and below is not None
                and lines[below].strip() == "JUMLAH KESELURUHAN MENGURUS"
            ):
                # Named rule LABEL_BELOW_AMOUNTS: the statement total's label printed on the line
                # under its amounts (FY2016 p223). Only this label is read this way.
                at = Citation(page.pdf_page, book_page, i + 1, lines[i].strip())
                self.corrections.append(Correction("LABEL_BELOW_AMOUNTS", "JUMLAH KESELURUHAN MENGURUS", at))
                splits[i] = _Split(lines[below].strip(), splits[i].values, splits[i].ends)
                lines[i] = lines[i].rstrip() + "\n" + lines[below].strip()
                lines[below], splits[below] = "", _Split("", [], [])
        for i in range(units + 1, len(lines)):
            self.where = Citation(page.pdf_page, book_page, i + 1, lines[i].strip())
            if self.phase is Phase.NOTES and self.notes_page == page.pdf_page:
                continue  # -layout overlaps the note text; read_notes takes it from -raw
            row = splits[i]
            if len(row.values) == width - 1:
                row = self.fill_blank_cell(row, splits, i)
            if len(row.values) == width:
                self.feed_row(row.label, row.values)
            elif self.dash_on_heading(row, splits, i):
                self.feed_text(row.label)
            else:
                self.feed_text(lines[i].strip())
        if self.notes_page == page.pdf_page:
            self.read_notes(page)

    def dash_on_heading(self, row: _Split, splits: list[_Split], i: int) -> bool:
        """Named rule DASH_ON_HEADING: a heading row with a "–" drawn in the last column and
        no other amount (FY2017 p115-116, B.10 "060000 PROGRAM KHUSUS"). The dash is dropped."""
        if len(row.values) != 1 or not row.values[0].is_dash:
            return False
        samb = _SAMB.fullmatch(row.label)
        if _classify(TEXT_KINDS, samb["rest"] if samb else row.label)[0] not in _HEADER_KINDS:
            return False
        complete = [s for s in splits if len(s.values) == len(self.layout.columns) and s.ends]
        nearest = min(complete, key=lambda s: abs(splits.index(s) - i), default=None)
        if nearest is None or abs(row.ends[0] - nearest.ends[-1]) > 2:
            return False
        self.corrections.append(Correction("DASH_ON_HEADING", "dropped a '–' in the last column", self.where))
        return True

    def fill_blank_cell(self, row: _Split, splits: list[_Split], i: int) -> _Split:
        width = len(self.layout.columns)
        nearest = sorted((abs(j - i), j) for j, s in enumerate(splits) if len(s.values) == width and s.ends)
        filled = _fill_blank_cell(row, splits[nearest[0][1]], self.layout) if nearest else None
        if filled is None:
            raise self.fail(f"{width - 1} numeric columns, and no single empty column can be located")
        _, missing = filled
        column = self.layout.columns[missing]
        self.corrections.append(Correction("BLANK_CELL_READ_AS_ZERO", f"empty {column} cell read as zero", self.where))
        return filled[0]

    def book_page(self, page: PageText, head: list[str]) -> int:
        book_pages: list[int] = []
        for i, line in enumerate(head):
            text = " ".join(line.split())
            running = _RUNNING_HEAD.fullmatch(text)
            if running is not None:
                if int(running["year"]) != self.fiscal_year or (running["left"] is None) == (running["right"] is None):
                    raise ParseError(page.pdf_page, i + 1, line, "running head without one book page number")
                book_pages.append(int(running["left"] or running["right"]))
            elif not self.head_line(text):
                raise ParseError(page.pdf_page, i + 1, line, "unexpected line in the page head")
        if len(book_pages) != 1:
            raise ParseError(page.pdf_page, 1, head[0] if head else "", "page head has no single running head")
        return self.check_offset(page, book_pages[0])

    def slug_book_page(self, page: PageText, head: list[str]) -> int:
        for i, line in enumerate(head):
            text = " ".join(line.split())
            if not (self.head_line(text) or _classify(TEXT_KINDS, text)[0] in _IGNORED_KINDS):
                raise ParseError(page.pdf_page, i + 1, line, "unexpected line in the page head")
        return self.check_offset(page, slug_book_page(page))

    def head_line(self, text: str) -> bool:
        return (
            text in ("", "Penyata Perbelanjaan Mengurus", "(sambungan)", "( sambungan)")
            or re.fullmatch(rf"bagi tahun berakhir 31 Disember {self.fiscal_year}( \(sambungan\))?", text) is not None
            or set(text.split()) <= _COLUMN_HEAD_WORDS
        )

    def check_offset(self, page: PageText, book_page: int) -> int:
        offset = page.pdf_page - book_page
        if self.book_page_offset is None:
            self.book_page_offset = offset
        elif offset != self.book_page_offset:
            raise ParseError(page.pdf_page, 1, "", f"book page {book_page} breaks the page sequence")
        return book_page

    def read_notes(self, page: PageText) -> None:
        raw = page.raw.split("\n")
        start = next((i for i, line in enumerate(raw) if line.startswith("Nota:")), None)
        if start is None:
            raise ParseError(page.pdf_page, 0, "", "-layout text has 'Nota:' but -raw text does not")
        body: list[str] = [raw[start].removeprefix("Nota:")]
        for line in raw[start + 1 :]:
            if _classify(TEXT_KINDS, _TRAILING_BANG.sub("", line).strip())[0] in _IGNORED_KINDS:
                break  # a blank line or page furniture (footer, printer slug) ends the notes
            body.append(line)
        for note in _NOTE.finditer(" ".join(" ".join(body).split())):
            self.notes[note["marker"]] = f"({note['marker']}) {note['text']}"

    # lines

    def feed_text(self, text: str) -> None:
        text = _DISAMBUNG_SUFFIX.sub("", text)
        if self.ocr:
            text = _OCR_JUMLAH.sub(lambda m: "JUMLAH" if m.group().isupper() else "Jumlah", text)
        if "!" in text:
            raise self.fail("'!' inside a line; only a trailing one is a text-layer artefact")
        samb = _SAMB.fullmatch(text)
        if samb is not None:
            text = samb["rest"]
        kind, match = _classify(TEXT_KINDS, text)
        if samb is not None and kind is Kind.BLANK:
            kind = Kind.CONTINUATION
        if samb is not None and kind not in _HEADER_KINDS | {Kind.CONTINUATION}:
            raise self.fail("(SAMB.) marker on a line that is not a header")
        if kind in _IGNORED_KINDS:
            return
        if kind in (Kind.ACTIVITY_NOTE, Kind.ACTIVITY_NOTE_SAME_VOTE):
            self.flush()
            if kind is Kind.ACTIVITY_NOTE:
                vote = f"{match['vote']}.{match['num']}"
            elif self.note_keys:
                vote = self.note_keys[0][0]
            else:
                raise self.fail("a note with no vote, and no note above it to take the vote from")
            codes = re.findall(r"\d{6}", match["codes"])
            if len(set(codes)) != len(codes):
                self.repeated_code_notes[vote] = (text, self.where)
            self.note_keys = [(vote, code) for code in dict.fromkeys(codes)]
            for key in self.note_keys:
                if key in self.activity_notes:
                    raise self.fail(f"second note for activity {key}")
                self.activity_notes[key] = text
            return
        if kind is Kind.CONTINUATION and self.note_keys:
            # A note wrapped onto the next line (FY2018 p92 "pendahuluan.").
            for key in self.note_keys:
                self.activity_notes[key] += " " + text
            return
        self.note_keys = []
        if kind is not Kind.NOTES and _NUMBER_IN_TEXT.search(text):
            width = {7: "seven", 4: "four"}[len(self.layout.columns)]
            raise self.fail(f"line holds an amount but not the {width} numeric columns of a row")
        if kind is Kind.CONTINUATION:
            if self.pending is None:
                raise self.fail("unclassified line")
            if text:
                self.pending.parts.append(text)
            self.pending.source_lines.append(self.where.text)
            self.pending.samb = self.pending.samb or samb is not None
            return
        self.flush()
        if kind is Kind.NOTES:
            self.transition(Event.NOTES)
            self.notes_page = self.where.pdf_page
            return
        groups = match.groupdict()
        self.pending = _Pending(
            kind=kind,
            code=groups.get("code") or "",
            parts=[text] if kind is Kind.JUMLAH_PREFIX else [n for n in [groups.get("name")] if n],
            source_lines=[self.where.text],
            samb=samb is not None,
            pdf_page=self.where.pdf_page,
            book_page=self.where.book_page,
            line_no=self.where.line_no,
            marks=groups.get("mark") or "",
        )

    def normalise_ocr_label(self, label: str) -> str:
        """Named rule OCR_LABEL_NORMALISED (OCR pages only): "Jumlah" and the object-group names
        are a closed vocabulary; an OCR reading within a small edit distance of one of them is
        read as it. Codes and other names are never changed."""
        fixed = _OCR_JUMLAH.sub(lambda m: "JUMLAH" if m.group().isupper() else "Jumlah", label)
        prefix, rest = ("Jumlah ", fixed[7:]) if fixed.startswith("Jumlah ") else ("", fixed)
        code = re.match(r"(0?[1-5]0000 )", rest)
        head, name = (code.group(1), rest[code.end() :]) if code else ("", rest)
        closest = difflib.get_close_matches(name, list(_OBJECT_LABELS), n=1, cutoff=0.85)
        if closest and closest[0] != name and not re.search(r"\d", name):
            fixed = prefix + head + closest[0]
        if fixed != label:
            self.corrections.append(Correction("OCR_LABEL_NORMALISED", f"{label!r} read as {fixed!r}", self.where))
        return fixed

    def feed_row(self, label: str, values: list[Value]) -> None:
        self.note_keys = []
        if self.ocr:
            label = self.normalise_ocr_label(label)
        self.in_gap = False
        marks = "".join(v.marks for v in values) + label[: len(label) - len(label.lstrip("*"))]
        label = label.lstrip("*").strip()
        amounts, error, percent_off = _check_row(values)
        if error is not None:
            raise self.fail(error)
        for value in values:
            if value.unseparated:
                # Named rule THOUSANDS_SEPARATORS_MISSING: an amount with two decimals printed
                # without thousands separators. Its value is unambiguous.
                detail = f"{value.hundredths / 100:.2f} printed without thousands separators"
                self.corrections.append(Correction("THOUSANDS_SEPARATORS_MISSING", detail, self.where))
        if percent_off is not None:
            self.corrections.append(Correction("PRINTED_PERCENT_DIFFERS", percent_off, self.where))

        if self.pending is not None and self.pending.kind is Kind.JUMLAH_PREFIX:
            pending = self.pending
            if label:
                pending.parts.append(label)
            pending.source_lines.append(self.where.text)
            pending.kind, pending.amounts, pending.marks = Kind.VOTE_TOTAL, amounts, marks
            self.transition(Event.VOTE_TOTAL)
            return  # stays pending: the rest of a wrapped name can follow the amounts

        self.flush()
        kind, match = _classify(ROW_KINDS, label)
        cite = self.where
        match kind:
            case Kind.LEAF if self.phase in (Phase.ACTIVITY_DONE, Phase.PROGRAMME_OBJECTS):
                # Named rule OBJECT_TOTAL_PRINTED_AS_LEAF: after an activity total no leaf can
                # follow, so a coded object line there is the programme's per-object total
                # (FY2017 p142, "20000 Perkhidmatan dan Bekalan" under "Jumlah 160100"). A missed
                # activity header cannot hide here: its "Jumlah" would follow a programme
                # object line, which the machine rejects.
                if _OBJECT_LABELS.get(match["name"]) != match["code"]:
                    raise self.fail(f"object {match['code']} is not named {match['name']!r}")
                self.corrections.append(
                    Correction(
                        "OBJECT_TOTAL_PRINTED_AS_LEAF", f"'{match['code']}' line read as a programme total", cite
                    )
                )
                self.object_total(match["code"], False, amounts, marks)
            case Kind.LEAF:
                self.leaf(match["code"], match["name"], amounts, marks)
            case Kind.LEAF_EXTRA_LEADING_ZERO:
                # Named rule OBJECT_CODE_EXTRA_LEADING_ZERO: a 5-digit object code printed
                # with a leading zero. leaf() still requires the printed name to be that
                # object group's name.
                self.corrections.append(
                    Correction(
                        "OBJECT_CODE_EXTRA_LEADING_ZERO", f"printed 0{match['code']}, read as {match['code']}", cite
                    )
                )
                self.leaf(match["code"], match["name"], amounts, marks)
            case Kind.ACTIVITY_TOTAL:
                self.transition(Event.ACTIVITY_TOTAL)
                assert self.activity is not None and self.programme is not None and self.vote is not None
                if match["code"] != self.activity.code and self.ocr:
                    raise self.fail(f"activity total {match['code']} read in activity {self.activity.code}")
                if match["code"] != self.activity.code:
                    # Named rule ACTIVITY_TOTAL_CODE_MISPRINTED: an activity total always
                    # closes the open activity. A missed header cannot hide here: its
                    # leaves would follow a closed activity, which the machine rejects.
                    self.corrections.append(
                        Correction(
                            "ACTIVITY_TOTAL_CODE_MISPRINTED",
                            f"'Jumlah {match['code']}' closes activity {self.activity.code}",
                            cite,
                        )
                    )
                self.add_total(
                    Scope.ACTIVITY,
                    amounts,
                    marks,
                    cite,
                    vote_code=self.vote.code,
                    programme_code=self.programme.code,
                    activity_code=self.activity.code,
                )
            case Kind.PROGRAMME_TOTAL:
                self.transition(Event.PROGRAMME_TOTAL)
                assert self.programme is not None and self.vote is not None
                if match["code"] != self.programme.code and self.ocr:
                    raise self.fail(f"programme total {match['code']} read in programme {self.programme.code}")
                if match["code"] != self.programme.code:
                    # Named rule PROGRAMME_TOTAL_CODE_MISPRINTED: like an activity total, a
                    # programme total closes the open programme. A missed programme header
                    # cannot hide here: its activities would fail the code-prefix check.
                    self.corrections.append(
                        Correction(
                            "PROGRAMME_TOTAL_CODE_MISPRINTED",
                            f"'Jumlah {match['code']}' closes programme {self.programme.code}",
                            cite,
                        )
                    )
                self.add_total(
                    Scope.PROGRAMME, amounts, marks, cite, vote_code=self.vote.code, programme_code=self.programme.code
                )
            case Kind.OBJECT_TOTAL:
                self.object_total(_OBJECT_LABELS[match["name"]], match["jumlah"] is not None, amounts, marks)
            case Kind.SECTION_TOTAL:
                self.transition(Event.SECTION_TOTAL)
                if _SECTIONS[match["code"]] is not self.section:
                    raise self.fail(f"section total for {match['code']} inside section {self.section}")
                self.add_total(Scope.SECTION, amounts, marks, cite, section=self.section)
            case Kind.STATEMENT_TOTAL:
                self.transition(Event.STATEMENT_TOTAL)
                self.add_total(Scope.STATEMENT, amounts, marks, cite)
            case Kind.VOTE_TOTAL:
                self.transition(Event.VOTE_TOTAL)
                self.pending = _Pending(
                    Kind.VOTE_TOTAL,
                    "",
                    [label],
                    [cite.text],
                    False,
                    cite.pdf_page,
                    cite.book_page,
                    cite.line_no,
                    amounts,
                    marks,
                )
            case Kind.BARE_AMOUNTS:
                raise self.fail("amounts with no label and no JUMLAH line above them")
            case _:
                raise self.fail("unclassified row")

    def leaf(self, object_code: str, name: str, amounts: Amounts, marks: str) -> None:
        self.transition(Event.LEAF)
        assert self.activity is not None and self.vote is not None
        if _OBJECT_LABELS.get(name) != object_code:
            raise self.fail(f"object {object_code} is named {OBJECT_GROUPS[object_code]!r}, not {name!r}")
        if marks:
            raise self.fail("footnote marker on a leaf line; operating_line has no column for it")
        key = (self.vote.code, self.activity.code, object_code)
        if key in self.leaf_keys:
            raise self.fail(f"duplicate leaf {key}")
        self.leaf_keys.add(key)
        self.lines.append(OperatingLine(self.vote.code, self.activity.code, object_code, amounts, self.where))

    def object_total(self, object_code: str, jumlah: bool, amounts: Amounts, marks: str) -> None:
        # After an activity total, an object line totals the programme. FY2025 prints it
        # without "Jumlah"; FY2023 prints it with.
        if not jumlah or self.phase in (Phase.ACTIVITY_DONE, Phase.PROGRAMME_OBJECTS):
            self.transition(Event.PROGRAMME_OBJECT)
            assert self.vote is not None and self.programme is not None
            self.add_total(
                Scope.PROGRAMME,
                amounts,
                marks,
                self.where,
                vote_code=self.vote.code,
                programme_code=self.programme.code,
                object_code=object_code,
            )
            return
        event = next((e for e in _JUMLAH_OBJECT_SCOPES if self.phase in TRANSITIONS[e]), None)
        if event is None:
            raise self.fail(f"'Jumlah <object group>' line cannot follow {self.phase.name}")
        self.transition(event)
        match _JUMLAH_OBJECT_SCOPES[event]:
            case Scope.VOTE:
                assert self.vote is not None
                self.add_total(
                    Scope.VOTE, amounts, marks, self.where, vote_code=self.vote.code, object_code=object_code
                )
            case Scope.SECTION:
                self.add_total(Scope.SECTION, amounts, marks, self.where, section=self.section, object_code=object_code)
            case _:
                self.add_total(Scope.STATEMENT, amounts, marks, self.where, object_code=object_code)

    def add_total(
        self,
        scope: Scope,
        amounts: Amounts,
        marks: str,
        citation: Citation,
        *,
        section: Section | None = None,
        vote_code: str | None = None,
        programme_code: str | None = None,
        activity_code: str | None = None,
        object_code: str | None = None,
    ) -> None:
        total = PrintedTotal(
            scope, section, vote_code, programme_code, activity_code, object_code, amounts, None, citation
        )
        self.totals.append((total, marks))

    # pending labels

    def flush(self) -> None:
        pending, self.pending = self.pending, None
        if pending is None:
            return
        at = pending.citation
        match pending.kind:
            case Kind.SECTION_HEADER:
                self.open_section(_SECTIONS[pending.code], pending, at)
            case Kind.VOTE_HEADER:
                self.open_vote(pending, at)
            case Kind.PROGRAMME_HEADER:
                self.open_programme(pending, at)
            case Kind.ACTIVITY_HEADER | Kind.ACTIVITY_HEADER_NO_LEADING_ZERO:
                self.open_activity(pending, at)
            case Kind.VOTE_TOTAL:
                assert self.vote is not None and pending.amounts is not None
                if pending.name != f"JUMLAH {self.vote.name}":
                    # Named rule VOTE_TOTAL_NAME_DIFFERS: the total always closes the open
                    # vote. FY2022 heads B.64 "PENGAJIAN TINGGI" and totals it as
                    # "PENDIDIKAN TINGGI" after the ministry was renamed.
                    self.corrections.append(
                        Correction(
                            "VOTE_TOTAL_NAME_DIFFERS",
                            f"{pending.name!r} closes {self.vote.code} {self.vote.name!r}",
                            at,
                        )
                    )
                self.add_total(Scope.VOTE, pending.amounts, pending.marks, at, vote_code=self.vote.code)
            case _:
                raise self.fail("JUMLAH label with no amounts", at)

    def open_section(self, section: Section, pending: _Pending, at: Citation) -> None:
        if pending.parts:
            raise self.fail("section header with extra text", at)
        if pending.samb:
            if section is not self.section:
                raise self.fail(f"continued section {section} but the open section is {self.section}", at)
            return
        self.transition(Event.NEW_SECTION, at)
        if section is Section.CHARGED and self.votes or any(v.section is section for v in self.votes):
            raise self.fail(f"section {section} opened out of order", at)
        self.section, self.vote, self.programme, self.activity = section, None, None, None

    def open_vote(self, pending: _Pending, at: Citation) -> None:
        repeated = (
            self.vote is not None
            and (pending.code, pending.name) == (self.vote.code, self.vote.name)
            and self.phase is not Phase.VOTE_DONE
        )
        if repeated:
            return  # the open vote's heading repeated at the top of a page; FY2021 omits "(SAMB.)"
        opened = any(v.code == pending.code for v in self.votes)
        if pending.samb and self.in_gap and not opened and self.vote is not None and pending.code != self.vote.code:
            closed = self.vote.code
            self.gaps_seen.add(self.gap_after)
            self.phase = Phase.VOTE_DONE  # the open vote's remaining rows and totals are on the missing page
            self.corrections.append(
                Correction("KNOWN_GAP", f"{closed} ends on the missing page; {pending.code} resumes after it", at)
            )
        elif pending.samb and self.phase is Phase.VOTE_DONE and not opened:
            # Named rule SAMB_HEADING_OPENS (votes): FY2017 p200 prints "B.60 KEMENTERIAN
            # PERTAHANAN – (SAMB.)" on its first page, after B.48's total; it opens B.60.
            self.corrections.append(
                Correction("SAMB_HEADING_OPENS", f"'(SAMB.)' heading opens vote {pending.code}", at)
            )
        elif pending.samb:
            if self.vote is None or pending.code != self.vote.code:
                raise self.fail(f"continued vote {pending.code} {pending.name!r} is not the open vote", at)
            self.note_samb_name(pending.name, self.vote.name, at)
            return
        self.transition(Event.NEW_VOTE, at)
        section = Section.CHARGED if pending.code.startswith("T") else Section.SUPPLY
        if section is not self.section:
            raise self.fail(f"vote {pending.code} inside section {self.section}", at)
        if any(v.code == pending.code for v in self.votes):
            raise self.fail(f"duplicate vote {pending.code}", at)
        self.vote = Vote(pending.code, pending.name, section, at)
        self.votes.append(self.vote)
        self.programme, self.activity = None, None

    def note_samb_name(self, printed: str, opened: str | None, at: Citation) -> None:
        """Named rule SAMB_NAME_DIFFERS: a "(SAMB.)" heading continues the open item with the
        same code even when its name is printed shorter (FY2021 B.33 020000)."""
        if opened is not None and printed != opened:
            self.corrections.append(Correction("SAMB_NAME_DIFFERS", f"{printed!r} continues {opened!r}", at))

    def open_programme(self, pending: _Pending, at: Citation) -> None:
        assert self.vote is not None
        if pending.samb and self.in_gap and self.phase is Phase.VOTE_OPEN and self.programme is None:
            self.corrections.append(
                Correction("KNOWN_GAP", f"programme {pending.code} resumes after the missing page", at)
            )
            pending = replace(pending, samb=False)
        if pending.samb:
            current = self.programme
            if current is not None and current.name is None and current.code == pending.code:
                # The heading left out under PROGRAMME_HEADING_MISSING is printed on the
                # continuation page; take the name from there.
                named = replace(current, name=pending.name)
                self.programmes[self.programmes.index(current)] = named
                self.programme = named
                self.corrections.append(
                    Correction(
                        "PROGRAMME_HEADING_MISSING", f"programme {current.code} named from '(SAMB.)' heading", at
                    )
                )
                return
            closed = [p for p in self.programmes if p.vote_code == self.vote.code and p is not current]
            if current is not None and any((p.code, p.name) == (pending.code, pending.name) for p in closed):
                # Named rule STALE_HEADING_IGNORED: the text layer carries a "(SAMB.)" heading
                # for a programme already closed, which the page does not draw (FY2021 p142,
                # checked on the rendered page). The open programme continues.
                self.corrections.append(
                    Correction("STALE_HEADING_IGNORED", f"stale '(SAMB.)' heading for closed {pending.code}", at)
                )
                return
            opened = any(p.vote_code == self.vote.code and p.code == pending.code for p in self.programmes)
            if self.phase is Phase.PROGRAMME_DONE and not opened:
                # Named rule SAMB_HEADING_OPENS: a heading marked "(SAMB.)" for a programme
                # never opened, straight after the previous programme's total (FY2018 p168,
                # B.32 040000, checked on the rendered page: the page before ends with
                # "Jumlah 030000"). It opens the programme.
                self.corrections.append(
                    Correction("SAMB_HEADING_OPENS", f"'(SAMB.)' heading opens programme {pending.code}", at)
                )
            else:
                if current is None or pending.code != current.code:
                    raise self.fail(f"continued programme {pending.code} {pending.name!r} is not the open one", at)
                self.note_samb_name(pending.name, current.name, at)
                return
        current = self.programme
        if (
            current is not None
            and (pending.code, pending.name) == (current.code, current.name)
            and self.phase is Phase.ACTIVITY_DONE
        ):
            # Named rule PROGRAMME_HEADING_REPEATED: the open programme's heading printed again
            # between two of its activities, without "(SAMB.)" (FY2016 p97, B.06 120000). It
            # continues the programme.
            self.corrections.append(Correction("PROGRAMME_HEADING_REPEATED", f"{pending.code} printed again", at))
            return
        if self.phase is Phase.PROGRAMME_OPEN and self.programme is not None:
            # Named rule EMPTY_PROGRAMME: a programme heading followed straight by the next
            # programme's heading, with no activity and no total (FY2019 p107, B.12 120000).
            # It is kept as a programme with no rows.
            detail = f"programme {self.programme.code} has no rows and no total"
            self.corrections.append(Correction("EMPTY_PROGRAMME", detail, self.programme.citation))
            self.phase = Phase.PROGRAMME_DONE
        self.transition(Event.NEW_PROGRAMME, at)
        if any(p.vote_code == self.vote.code and p.code == pending.code for p in self.programmes):
            raise self.fail(f"duplicate programme {pending.code} in vote {self.vote.code}", at)
        self.programme = Programme(self.vote.code, pending.code, pending.name, at)
        self.programmes.append(self.programme)
        self.activity = None

    def open_activity(self, pending: _Pending, at: Citation) -> None:
        assert self.vote is not None
        code = pending.code
        if pending.kind is Kind.ACTIVITY_HEADER_NO_LEADING_ZERO:
            # Named rule ACTIVITY_CODE_LEADING_ZERO_DROPPED: the source prints a 6-digit
            # activity code without its leading zero. The activity total that closes it
            # ("Jumlah 0xxxx00") must carry the corrected code, or the parse fails.
            code = "0" + pending.code
            self.corrections.append(
                Correction("ACTIVITY_CODE_LEADING_ZERO_DROPPED", f"printed {pending.code}, read as {code}", at)
            )
        if pending.samb:
            current = self.activity
            if current is None or code != current.code:
                raise self.fail(f"continued activity {code} {pending.name!r} is not the open one", at)
            self.note_samb_name(pending.name, current.name, at)
            return
        if self.phase is Phase.PROGRAMME_DONE and self.programme is not None and code[:2] != self.programme.code[:2]:
            # Named rule PROGRAMME_HEADING_MISSING: an activity straight after a programme
            # total, under a programme whose heading is not printed (FY2022 B.24 020000,
            # checked on the rendered page). The programme opens from the activity code
            # with no name; its own printed total must still close it.
            assert self.vote is not None
            programme_code = code[:2] + "0000"
            if any(p.vote_code == self.vote.code and p.code == programme_code for p in self.programmes):
                raise self.fail(f"activity {code} reopens programme {programme_code}", at)
            self.transition(Event.NEW_PROGRAMME, at)
            self.programme = Programme(self.vote.code, programme_code, None, at)
            self.programmes.append(self.programme)
            self.corrections.append(
                Correction("PROGRAMME_HEADING_MISSING", f"programme {programme_code} opened by activity {code}", at)
            )
        self.transition(Event.NEW_ACTIVITY, at)
        assert self.programme is not None
        if code[:2] != self.programme.code[:2]:
            raise self.fail(f"activity {code} inside programme {self.programme.code}", at)
        if any(a.vote_code == self.vote.code and a.code == code for a in self.activities):
            raise self.fail(f"duplicate activity {code} in vote {self.vote.code}", at)
        self.activity = Activity(self.vote.code, self.programme.code, code, pending.name, at)
        self.activities.append(self.activity)
        if pending.marks:
            self.marked_activities.add((self.vote.code, code))

    # end

    def finish(self) -> Statement:
        self.flush()
        if self.phase not in (Phase.STATEMENT_DONE, Phase.NOTES):
            raise self.fail(f"statement ended in phase {self.phase.name}, before JUMLAH KESELURUHAN MENGURUS")
        totals: list[PrintedTotal] = []
        used: set[str] = set()
        for total, marks in self.totals:
            if marks:
                if marks not in self.notes and self.layout is FOUR_COLUMNS:
                    # Named rule MARK_WITHOUT_NOTE: FY2019 p173 marks the statement's 40000 actual
                    # "*149,848,688,957.22" and prints no note. No footnote is stored.
                    self.corrections.append(Correction("MARK_WITHOUT_NOTE", f"{marks!r} has no note", total.citation))
                    totals.append(total)
                    continue
                if marks not in self.notes:
                    raise self.fail(f"footnote marker {marks!r} has no note", total.citation)
                used.add(marks)
                total = replace(total, footnote=self.notes[marks])
            elif total.scope is Scope.ACTIVITY and (total.vote_code, total.activity_code) in self.marked_activities:
                # A "*" on an activity header: its note is stored on the activity's total.
                key = (total.vote_code or "", total.activity_code or "")
                if key not in self.activity_notes and key[0] in self.repeated_code_notes:
                    # Named rule NOTE_CODE_REPEATED: a note naming one code twice (FY2017 p125,
                    # B.13 "120100, 130300, 130300, 130400, 130500 dan 130600") misses one marked
                    # activity of its vote (130100). The note, stored verbatim, is attached to
                    # it; only one activity may be covered this way.
                    text, at = self.repeated_code_notes.pop(key[0])
                    self.activity_notes[key] = text
                    detail = f"note naming a code twice is attached to marked activity {key[1]}"
                    self.corrections.append(Correction("NOTE_CODE_REPEATED", detail, at))
                if key not in self.activity_notes:
                    raise self.fail(f"activity {key} is marked but has no note", total.citation)
                total = replace(total, footnote=self.activity_notes.pop(key))
            totals.append(total)
        if self.activity_notes:
            raise self.fail(f"notes for activities {sorted(self.activity_notes)} match no marked activity")
        return Statement(
            fiscal_year=self.fiscal_year,
            votes=tuple(self.votes),
            programmes=tuple(self.programmes),
            activities=tuple(self.activities),
            lines=tuple(self.lines),
            totals=tuple(totals),
            corrections=tuple(self.corrections),
            unreferenced_notes=tuple(note for marker, note in self.notes.items() if marker not in used),
        )


def parse_statement(
    pages: Sequence[PageText],
    fiscal_year: int,
    columns: int = 7,
    gaps_after: tuple[int, ...] = (),
    ocr: bool = False,
) -> Statement:
    parser = _Parser(fiscal_year, LAYOUTS[columns], gaps_after, ocr)
    for page in pages:
        parser.feed_page(page)
    if set(gaps_after) - parser.gaps_seen:
        raise ParseError(pages[0].pdf_page, 1, "", f"registered gaps after pages {gaps_after} were not found")
    return parser.finish()
