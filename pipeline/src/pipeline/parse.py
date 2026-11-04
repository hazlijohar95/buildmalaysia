"""Parse Lampiran 1 (Penyata Perbelanjaan Mengurus) from per-page pdftotext text.

Every line is classified by a regex table (TEXT_KINDS for lines without amounts,
ROW_KINDS for lines ending in the seven numeric columns). A small state machine
(section, vote, programme, activity, phase, and one pending wrapped label) turns
the classified lines into a Statement. A line the machine cannot place is a
ParseError naming the PDF page and line; nothing is skipped silently.
"""

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
_NUMBER_IN_TEXT = re.compile(r"(?<!\S)\(?\d{1,3}(?:,\d{3})+(?:\.\d{2})?\)?(?!\S)|(?<!\S)\d+\.\d{2}(?!\S)")


@dataclass(frozen=True)
class Value:
    hundredths: int  # sen for amounts, hundredths of a percent for % Prestasi
    marks: str
    is_dash: bool
    has_decimals: bool


def parse_value(token: str) -> Value | None:
    m = _VALUE.fullmatch(token)
    if m is None:
        return None
    if m["int"] is None:
        return Value(0, m["marks"], True, False)
    n = int(m["int"].replace(",", "")) * 100 + int(m["dec"] or 0)
    return Value(-n if m["neg"] else n, m["marks"], False, m["dec"] is not None)


@dataclass(frozen=True)
class _Split:
    label: str
    values: list[Value]  # the trailing numeric tokens, at most seven
    ends: list[int]  # character column where each value ends in the layout line


def _split(line: str) -> _Split:
    """Split a layout line into its label and up to seven trailing numeric tokens."""
    values: list[Value] = []
    ends: list[int] = []
    label_end = len(line)
    for token in reversed(list(re.finditer(r"\S+", line))):
        value = parse_value(token.group())
        if value is None or len(values) == 7:
            break
        values.insert(0, value)
        ends.insert(0, token.end())
        label_end = token.start()
    return _Split(line[:label_end].strip(), values, ends)


_BLANK_CELL_COLUMNS = range(5)  # Asal .. Sebenar; % Prestasi and Varian are never blank


def _fill_blank_cell(row: _Split, reference: _Split) -> tuple[_Split, int] | None:
    """Named rule BLANK_CELL_READ_AS_ZERO: a row printed with one amount cell left empty.

    Each of the six printed tokens is placed in the column whose right edge, in the
    nearest complete row of the same page, is closest. The placement must be strictly
    left to right and leave exactly one amount column empty; that column reads as zero.
    """
    columns = [min(range(7), key=lambda c: abs(end - reference.ends[c])) for end in row.ends]
    if len(set(columns)) != 6 or columns != sorted(columns):
        return None
    missing = next(c for c in range(7) if c not in columns)
    if missing not in _BLANK_CELL_COLUMNS:
        return None
    values = row.values[:missing] + [Value(0, "", True, False)] + row.values[missing:]
    return _Split(row.label, values, []), missing


def _join_split_row(first: _Split, second: _Split) -> tuple[_Split, bool] | None:
    """Named rules SPLIT_ROW_JOINED and STRAY_DASH_DROPPED: one printed row whose text layer
    breaks after a few amounts, continuing on the next line with no label.

    The two lines' amounts are joined. If that gives eight tokens and exactly one is a
    dash, the dash is a text-layer artefact not drawn on the page; it is dropped only if
    the remaining seven pass every row check.
    """
    if not first.label or not first.values or second.label or not second.values:
        return None
    values = first.values + second.values
    if len(values) == 7:
        return _Split(first.label, values, []), False
    dashes = [i for i, v in enumerate(values) if v.is_dash]
    if len(values) != 8 or len(dashes) != 1:
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
    named rule PRINTED_PERCENT_DIFFERS. Column placement is already proven by the two
    identities above, which use every amount column.
    """
    original, supplementary, virement, revised, actual, percent, variance = values
    amounts = Amounts(
        original.hundredths, supplementary.hundredths, virement.hundredths, revised.hundredths, actual.hundredths
    )
    if not percent.is_dash and not percent.has_decimals:
        return amounts, "% Prestasi column is not a 2-decimal percentage", None
    total = amounts.original + amounts.supplementary + amounts.virement
    if total != amounts.revised:
        return amounts, f"Asal + Tambahan + Viremen = {total} sen but Jumlah prints {amounts.revised} sen", None
    if amounts.revised - amounts.actual != variance.hundredths:
        error = f"Jumlah - Sebenar = {amounts.revised - amounts.actual} sen but Varian prints {variance.hundredths} sen"
        return amounts, error, None
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
    PRINTER_SLUG = auto()  # InDesign file name and print time, outside the rendered page area
    NOTES = auto()
    ACTIVITY_NOTE = auto()  # "[Nota :] *B04 - Program/Aktiviti - 010100 - <text>" or "(*) B04 - ...": a marked activity
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


PRINTER_SLUG = r"\S.*\.indd \d+\s+\d{2}/\d{2}/\d{4} \d{1,2}:\d{2} [AP]M"


def _table(rows: list[tuple[Kind, str]]) -> tuple[tuple[Kind, re.Pattern[str]], ...]:
    return tuple((kind, re.compile(pattern)) for kind, pattern in rows)


TEXT_KINDS = _table(
    [
        (Kind.BLANK, r""),
        (Kind.DISAMBUNG, r"\(dis ?ambung\.\.\.\)"),
        (Kind.APPENDIX_PAGE, r"\d{1,3}"),
        (Kind.LAMPIRAN_FOOTER, r"LAMPIRAN 1 - (?:PENYATA )?PERBELANJAAN MENGURUS"),
        (Kind.PRINTER_SLUG, PRINTER_SLUG),
        (
            Kind.ACTIVITY_NOTE,
            r"(?:Nota\s*:\s*)?\(?\*\)?\s*(?P<vote>[TB])\.?(?P<num>\d{2})\s*[-–]\s*Program/Aktiviti"
            r"\s*[-–]\s*(?P<code>\d{6})\s*[-–]\s*.+",
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
_IGNORED_KINDS = {Kind.BLANK, Kind.DISAMBUNG, Kind.APPENDIX_PAGE, Kind.LAMPIRAN_FOOTER, Kind.PRINTER_SLUG}
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

_UNITS = re.compile(r"RM\s+RM\s+RM\s+RM\s+RM\s+%\s+RM")
_RUNNING_HEAD = re.compile(
    r"(?:(?P<left>\d+)\s+)?PENYATA KEWANGAN KERAJAAN PERSEKUTUAN (?P<year>\d{4})(?:\s+(?P<right>\d+))?"
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
}


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
    def __init__(self, fiscal_year: int) -> None:
        self.fiscal_year = fiscal_year
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
        lines = page.layout.split("\n")
        units = next((i for i, line in enumerate(lines) if _UNITS.fullmatch(line.strip())), None)
        if units is None:
            for i, line in enumerate(lines):
                if len(_split(line).values) >= 6:
                    raise ParseError(page.pdf_page, i + 1, line, "amounts on a page with no table header")
            return
        book_page = self.book_page(page, lines[:units])
        for i in range(units + 1, len(lines)):
            if lines[i].lstrip().startswith("`"):
                # Named rule STRAY_BACKTICK_IGNORED: the text layer carries a "`" at the
                # start of the line that the rendered page does not show.
                at = Citation(page.pdf_page, book_page, i + 1, lines[i].strip())
                self.corrections.append(Correction("STRAY_BACKTICK_IGNORED", "dropped a leading ` not rendered", at))
                lines[i] = lines[i].replace("`", " ", 1)
        splits = [_split(line) for line in lines]
        for i in range(units + 1, len(lines) - 1):
            if 0 < len(splits[i].values) < 6:
                joined = _join_split_row(splits[i], splits[i + 1])
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
        for i in range(units + 1, len(lines)):
            self.where = Citation(page.pdf_page, book_page, i + 1, lines[i].strip())
            if self.phase is Phase.NOTES and self.notes_page == page.pdf_page:
                continue  # -layout overlaps the note text; read_notes takes it from -raw
            row = splits[i]
            if len(row.values) == 6:
                row = self.fill_blank_cell(row, splits, i)
            if len(row.values) == 7:
                self.feed_row(row.label, row.values)
            else:
                self.feed_text(lines[i].strip())
        if self.notes_page == page.pdf_page:
            self.read_notes(page)

    def fill_blank_cell(self, row: _Split, splits: list[_Split], i: int) -> _Split:
        nearest = sorted((abs(j - i), j) for j, s in enumerate(splits) if len(s.values) == 7)
        filled = _fill_blank_cell(row, splits[nearest[0][1]]) if nearest else None
        if filled is None:
            raise self.fail("six numeric columns, and no single empty amount column can be located")
        _, missing = filled
        column = ("Asal", "Tambahan/(Kurangan)", "Viremen", "Jumlah", "Sebenar")[missing]
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
            elif not (
                text in ("", "Penyata Perbelanjaan Mengurus", "(sambungan)", "( sambungan)")
                or re.fullmatch(rf"bagi tahun berakhir 31 Disember {self.fiscal_year}( \(sambungan\))?", text)
                or set(text.split()) <= _COLUMN_HEAD_WORDS
            ):
                raise ParseError(page.pdf_page, i + 1, line, "unexpected line in the page head")
        if len(book_pages) != 1:
            raise ParseError(page.pdf_page, 1, head[0] if head else "", "page head has no single running head")
        offset = page.pdf_page - book_pages[0]
        if self.book_page_offset is None:
            self.book_page_offset = offset
        elif offset != self.book_page_offset:
            raise ParseError(page.pdf_page, 1, head[0], f"book page {book_pages[0]} breaks the page sequence")
        return book_pages[0]

    def read_notes(self, page: PageText) -> None:
        raw = page.raw.split("\n")
        start = next((i for i, line in enumerate(raw) if line.startswith("Nota:")), None)
        if start is None:
            raise ParseError(page.pdf_page, 0, "", "-layout text has 'Nota:' but -raw text does not")
        body: list[str] = [raw[start].removeprefix("Nota:")]
        for line in raw[start + 1 :]:
            if not line.strip() or Kind.LAMPIRAN_FOOTER is _classify(TEXT_KINDS, line.strip())[0]:
                break
            body.append(line)
        for note in _NOTE.finditer(" ".join(" ".join(body).split())):
            self.notes[note["marker"]] = f"({note['marker']}) {note['text']}"

    # lines

    def feed_text(self, text: str) -> None:
        text = _DISAMBUNG_SUFFIX.sub("", text)
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
        if kind is Kind.ACTIVITY_NOTE:
            key = (f"{match['vote']}.{match['num']}", match["code"])
            if key in self.activity_notes:
                raise self.fail(f"second note for activity {key}")
            self.activity_notes[key] = text
            return
        if kind is not Kind.NOTES and _NUMBER_IN_TEXT.search(text):
            raise self.fail("line holds an amount but not the seven numeric columns of a row")
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

    def feed_row(self, label: str, values: list[Value]) -> None:
        marks = "".join(v.marks for v in values) + label[: len(label) - len(label.lstrip("*"))]
        label = label.lstrip("*").strip()
        amounts, error, percent_off = _check_row(values)
        if error is not None:
            raise self.fail(error)
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
                if match["code"] != self.programme.code:
                    raise self.fail(f"total for programme {match['code']} inside programme {self.programme.code}")
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
                    raise self.fail(f"vote total label does not match vote {self.vote.code} {self.vote.name!r}", at)
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
        if pending.samb:
            if self.vote is None or (pending.code, pending.name) != (self.vote.code, self.vote.name):
                raise self.fail(f"continued vote {pending.code} {pending.name!r} is not the open vote", at)
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

    def open_programme(self, pending: _Pending, at: Citation) -> None:
        assert self.vote is not None
        if pending.samb:
            current = self.programme
            if current is None or (pending.code, pending.name) != (current.code, current.name):
                raise self.fail(f"continued programme {pending.code} {pending.name!r} is not the open one", at)
            return
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
            if current is None or (code, pending.name) != (current.code, current.name):
                raise self.fail(f"continued activity {code} {pending.name!r} is not the open one", at)
            return
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
                if marks not in self.notes:
                    raise self.fail(f"footnote marker {marks!r} has no note", total.citation)
                used.add(marks)
                total = replace(total, footnote=self.notes[marks])
            elif total.scope is Scope.ACTIVITY and (total.vote_code, total.activity_code) in self.marked_activities:
                # A "*" on an activity header: its note is stored on the activity's total.
                key = (total.vote_code or "", total.activity_code or "")
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


def parse_statement(pages: Sequence[PageText], fiscal_year: int) -> Statement:
    parser = _Parser(fiscal_year)
    for page in pages:
        parser.feed_page(page)
    return parser.finish()
