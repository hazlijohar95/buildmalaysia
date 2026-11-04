"""Parse Lampiran 2 (Penyata Perbelanjaan Pembangunan) from per-page pdftotext text.

The statement is printed as two-page spreads. The left page lists each row's label
(vote header, group heading, project, or a total) with two amounts: total cost and
plan spending to the end of the prior year. The right page prints, on the same row,
the year's seven figures. Rows without amounts on the left (vote headers, group
headings, wrapped names) have no row on the right, so the n-th left row that carries
amounts pairs with the n-th right row. Each spread must pair exactly.

Groups: a heading in capitals opens a group, and "Jumlah <name>" closes it. Two
patterns have no heading line of their own, and each is a named rule:
  VOTE_NAMED_GROUP / HEADING_MISSING: "Jumlah <name>" with no group open totals the run
    of projects just above it that have no heading: under the vote header (the ministry's
    own projects), or after another group's total.
  PARENT_GROUP_BY_NAME: "Jumlah <stem> <A>, <B> dan <C>" with no group open totals
    the run of groups just closed whose names contain the stem and one of A, B, C.
Every group, vote and statement total is then recomputed from the projects by the
development_reconciliation view, so a wrong grouping fails the load.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from pipeline.model import (
    Citation,
    Correction,
    DevelopmentAmounts,
    DevelopmentGroup,
    DevelopmentProject,
    DevelopmentScope,
    DevelopmentStatement,
    DevelopmentTotal,
    DevelopmentVote,
    SpreadCitation,
)
from pipeline.parse import PRINTER_SLUG, PageText, ParseError, Value, parse_value, slug_book_page

_RUNNING_HEAD = re.compile(
    r"(?:(?P<left>\d+)\s+(?:\|\s*)?)?PENYATA KEWANGAN KERAJAAN PERSEKUTUAN (?P<year>\d{4})(?:\s*(?:\|\s*)?(?P<right>\d+))?"
)
_LEFT_UNITS = re.compile(r"RM\s+RM")
_RIGHT_UNITS = re.compile(r"RM(?:\s+RM){6}")
_HEAD_WORDS = {
    "Penyata", "Perbelanjaan", "Pembangunan", "bagi", "tahun", "berakhir", "31", "Disember",
    "Maksud", "Kos", "Keseluruhan", "Sebenar", "Hingga", "Anggaran", "Tahun",
    "Cara", "Langsung", "Pinjaman", "Jumlah", "(", "sambungan)", "(sambungan)",
}  # fmt: skip
_FOOTER = re.compile(
    rf"\d{{1,3}}|LAMPIRAN 2 [-–] (?:PENYATA )?PERBELANJAAN PEMBANGUNAN|{PRINTER_SLUG}"
    # FY2016-2019 furniture inside the table area: the running head and the side tab's words.
    r"|(?:\$10\s+)?PENYATA KEWANGAN KERAJAAN PERSEKUTUAN(?:\s+\d{4})?|\[2[O0]1\d\]|LAMPIRAN 2 - PERBELANJAAN|PEMBANGUNAN"
    r"|\$10|(?:\$10\s+)?Excellent Accounting @ Your Service(?:\s+(?:\$10|\d{1,3}))?"
)
_TRAILING_BANG = re.compile(r"\s*!\s*$")  # FY2016-2018: a "!" the page does not draw
_RIGHT_COLUMNS = (
    "Anggaran Cara Langsung",
    "Anggaran Pinjaman",
    "Anggaran Jumlah",
    "Sebenar Cara Langsung",
    "Sebenar Pinjaman",
    "Sebenar Jumlah",
    "Sebenar RMKe-12 hingga akhir tahun",
)
_SAMB = re.compile(r"\s*\(SAMB\.\)$")

_VOTE = re.compile(r"P\.(?P<num>\d{2})\s+(?P<name>.+)")
_PROJECT = re.compile(r"(?P<mark>\*?)(?P<code>\d{5})(?:\s+(?P<name>.*))?")
_STATEMENT_TOTAL = re.compile(r"JUMLAH PERBELANJAAN PEMBANGUNAN")
_VOTE_TOTAL = re.compile(r"JUMLAH (?P<name>.+)")
_GROUP_TOTAL = re.compile(r"Jumlah (?P<name>.+)")
_NOTE = re.compile(r"Nota:\s*(?:!\s*)?(?P<text>.*)")  # FY2018 p218: "Nota: !*P.06–", the "!" not drawn
_PROJECT_NOTE = re.compile(
    r"\*(?P<vote>P\.\d{2})\s*(?:[–-]\s*)?Butiran\s+(?P<codes>[\dA-Z\s,&dan]+?)\s*-\s*(?P<text>.+)"
)
_STATEMENT_NOTE = re.compile(r"\*\s+(?P<text>.+)")
_PARENT_NAME = re.compile(r"(?P<stem>.+?) (?P<first>\S+), (?P<middle>.+?) dan (?P<last>.+)")


def _unbang(line: str) -> str:
    """A line with the "!" FY2016-2018 put after column head words removed, whitespace collapsed."""
    return " ".join(word.removesuffix("!") for word in line.split() if word != "!")


def _norm(name: str) -> str:
    return " ".join(_SAMB.sub("", name).split()).casefold()


def trailing_values(line: str, limit: int) -> tuple[str, list[Value], list[int]]:
    """Split a layout line into its label, up to `limit` trailing amounts, and where each amount ends."""
    line = re.sub(r"\s+\)", ")", line)  # "(846,800,930.00 )" prints a space before the bracket
    tokens = list(re.finditer(r"\S+", line))
    values: list[Value] = []
    ends: list[int] = []
    label_end = len(line)
    for token in reversed(tokens):
        # FY2023 prints some zero cells as "-" rather than "–". A label ending in a lone
        # hyphen would leave one amount on the line, which is an error either way.
        value = parse_value("–" if token.group() == "-" else token.group())
        if value is None or len(values) == limit:
            break
        values.insert(0, value)
        ends.insert(0, token.end())
        label_end = token.start()
    return line[:label_end].strip(), values, ends


def _fill_blank_cells(
    values: list[Value], ends: list[int], reference: list[int]
) -> tuple[list[Value], list[int]] | None:
    """Named rule BLANK_CELL_READ_AS_ZERO: a right-page row printed with one or two of seven cells empty.

    Each printed amount is placed in the column whose right edge, in the nearest complete
    row of the same page, is closest. The placement must be strictly left to right with
    one amount per column; the empty columns read as zero. The row checks then apply.
    """
    columns = [min(range(7), key=lambda c: abs(end - reference[c])) for end in ends]
    if len(set(columns)) != len(values) or columns != sorted(columns):
        return None
    placed = dict(zip(columns, values, strict=True))
    missing = [c for c in range(7) if c not in placed]
    return [placed.get(c, Value(0, "", True, False)) for c in range(7)], missing


def _doubled(label: str) -> str | None:
    """Named rule DOUBLED_TEXT_LAYER: a label whose text layer holds the name twice, once in
    capitals that the page does not draw ("DANA PEMBANGUNAN & PEMBIAYAAN PKS Dana
    Pembangunan & Pembiayaan PKS", FY2023 00601). Returns the copy not in capitals."""
    words = label.split()
    half = len(words) // 2
    if not words or len(words) % 2 or [w.casefold() for w in words[:half]] != [w.casefold() for w in words[half:]]:
        return None
    first, second = " ".join(words[:half]), " ".join(words[half:])
    if first.isupper() == second.isupper():
        return None
    return second if first.isupper() else first


def _raw_labels(raw: str) -> dict[str, list[str]]:
    """Project code -> its labels in page order, from `pdftotext -raw`, which keeps a row's
    text in reading order. A code can repeat on a page under different votes."""
    labels: dict[str, list[str]] = {}
    for line in raw.split("\n"):
        m = _PROJECT.fullmatch(line.strip())
        if m is not None and m["name"]:
            label, _, _ = trailing_values(m["name"], 2)
            labels.setdefault(m["code"], []).append(label)
    return labels


def _collapse_repeats(name: str) -> str:
    """Drop a word repeated immediately after itself ("Projek Projek Jalur Jalur ...")."""
    words: list[str] = []
    for word in name.split():
        if not words or word != words[-1]:
            words.append(word)
    return " ".join(words)


# --- mutable records, frozen in finish() ------------------------------------------------


@dataclass
class _Group:
    vote_code: str
    ordinal: int
    name: str
    citation: Citation
    parent: int | None = None
    closed: bool = False
    total_label: str = ""  # the name its "Jumlah" line prints, which can differ from the heading


@dataclass
class _Project:
    vote_code: str
    code: str
    mark: str
    group: int | None
    parts: list[str]
    lines: list[str]
    first: Citation
    left: tuple[int, int] | None = None  # total cost, plan actual to prior year
    left_citation: Citation | None = None
    right: tuple[int, ...] | None = None
    right_citation: Citation | None = None
    raw_label: str | None = None  # the label as `pdftotext -raw` reads it, for doubled text layers


@dataclass
class _Total:
    scope: DevelopmentScope
    vote_code: str | None
    group: int | None
    marks: str
    left: tuple[int, int]
    left_citation: Citation
    right: tuple[int, ...] | None = None
    right_citation: Citation | None = None


@dataclass
class _Vote:
    code: str
    name: str
    citation: Citation
    groups: list[_Group] = field(default_factory=list)


class _Parser:
    def __init__(self, fiscal_year: int, slug_pages: bool) -> None:
        self.fiscal_year = fiscal_year
        self.slug_pages = slug_pages  # FY2016-2019: book pages from the printer slug, not the running head
        self.votes: list[_Vote] = []
        self.vote: _Vote | None = None
        self.projects: list[_Project] = []
        self.totals: list[_Total] = []
        self.corrections: list[Correction] = []
        self.notes: dict[tuple[str, str], str] = {}  # (vote, project code) -> note
        self.statement_notes: list[str] = []
        self.note_keys: list[tuple[str, str]] = []
        # Malaysia Plans named in the column heads: the left page's prior-year column and the
        # right page's to-date column. They differ in a plan's first year (FY2021: RMKe-11, RMKe-12).
        self.plans: dict[str, set[str]] = {"left": set(), "right": set()}
        self.last_project: _Project | None = None
        self.left_ends: dict[int, list[int]] = {}
        self.blank_before = False  # the left-page line above the current one is blank
        self.reopenable: tuple[_Vote, _Total] | None = None  # a vote just closed by "JUMLAH <name>"
        self.finished = False
        self.where = Citation(0, 0, 0, "")

    def fail(self, message: str, at: Citation | None = None) -> ParseError:
        at = at or self.where
        return ParseError(at.pdf_page, at.line_no, at.text, message)

    # pages

    def body(self, page: PageText, units: re.Pattern[str], side: str) -> tuple[int, list[tuple[int, str]]]:
        """Return the book page and the numbered lines below the column units line."""
        lines = [self.unbang(line) for line in page.layout.split("\n")]
        at = next((i for i, line in enumerate(lines) if units.fullmatch(_unbang(line))), None)
        if at is None and self.slug_pages and side == "left":
            # FY2016-2017 left pages print no "RM RM" units in the text layer; the head ends at
            # the plan column's "Hingga 31.12.YYYY", which must occur once.
            heads = [i for i, line in enumerate(lines) if re.search(r"Hingga 31\.12\.\d{4}", line)]
            at = heads[0] if len(heads) == 1 else None
        if at is None:
            raise ParseError(page.pdf_page, 1, lines[0] if lines else "", "no column units line")
        book_pages: list[int] = []
        for i, line in enumerate(lines[:at]):
            text = _unbang(line)
            running = _RUNNING_HEAD.fullmatch(text)
            if running is not None and int(running["year"]) == self.fiscal_year and not self.slug_pages:
                book_pages.append(int(running["left"] or running["right"]))
            elif self.slug_pages and _FOOTER.fullmatch(text):
                continue
            else:
                words = set(re.sub(r"\(\s*s\s*ambungan\)", "(sambungan)", text).split())  # "(s ambungan)", FY2021
                plans = {w for w in words if re.fullmatch(r"RMKe-\d+", w)}
                self.plans[side] |= plans
                allowed = (
                    _HEAD_WORDS
                    | plans
                    | {
                        str(self.fiscal_year),
                        f"31.12.{self.fiscal_year}",
                        f"31.12.{self.fiscal_year - 1}",
                    }
                )
                if not words <= allowed:
                    raise ParseError(page.pdf_page, i + 1, line, "unexpected line in the page head")
        if self.slug_pages:
            book_pages.append(slug_book_page(page))
        if len(book_pages) != 1:
            raise ParseError(page.pdf_page, 1, lines[0], "page head has no single running head")
        return book_pages[0], [(i + 1, lines[i]) for i in range(at + 1, len(lines))]

    def join_split_vote_headers(
        self, page: PageText, book_page: int, lines: list[tuple[int, str]]
    ) -> list[tuple[int, str]]:
        """Named rule VOTE_HEADER_SPLIT (FY2016-2019): a vote code alone on its line, its name
        on the next non-blank line (FY2017 p235 "P.28" / "KEMENTERIAN PENGANGKUTAN", pushed
        apart in -layout by undrawn "!" glyphs). The two are read as one header line."""
        out = list(lines)
        for i, (line_no, line) in enumerate(out):
            if not re.fullmatch(r"P\.\d{2}", line.strip()):
                continue
            j = next((j for j in range(i + 1, len(out)) if out[j][1].strip()), None)
            if j is None or re.search(r"[a-z\d]", out[j][1]):
                continue
            joined = f"{line.strip()} {out[j][1].strip()}"
            at = Citation(page.pdf_page, book_page, line_no, joined)
            self.corrections.append(Correction("VOTE_HEADER_SPLIT", f"read as {joined!r}", at))
            out[i], out[j] = (line_no, joined), (out[j][0], "")
        return out

    def unbang(self, line: str) -> str:
        """FY2016-2018 text layers carry "!" glyphs the pages do not draw, after column heads,
        inside note lines and on lines of their own. In those years every "!" is blanked."""
        if self.slug_pages:
            return line.replace("!", " ").rstrip()
        return _TRAILING_BANG.sub("", line)

    def feed_spread(self, left: PageText, right: PageText) -> None:
        left_book, left_lines = self.body(left, _LEFT_UNITS, "left")
        right_book, right_lines = self.body(right, _RIGHT_UNITS, "right")
        if len(self.plans["left"]) != 1 or len(self.plans["right"]) != 1:
            raise ParseError(left.pdf_page, 1, "", f"column heads name plans {self.plans}; expected one per page side")
        if (right.pdf_page, right_book) != (left.pdf_page + 1, left_book + 1):
            raise ParseError(right.pdf_page, 1, "", "right page does not follow its left page")

        waiting: list[_Project | _Total] = []  # left rows with amounts, in print order
        # Where each amount ends on the left page's complete rows, to place a lone amount.
        self.left_ends = {n: ends for n, line in left_lines if len((ends := trailing_values(line, 2)[2])) == 2}
        in_notes = False
        first_new = len(self.projects)
        self.blank_before = False
        if self.slug_pages:
            left_lines = self.join_split_vote_headers(left, left_book, left_lines)
        for index, (line_no, line) in enumerate(left_lines):
            text = line.strip()
            self.where = Citation(left.pdf_page, left_book, line_no, text)
            if not text or _FOOTER.fullmatch(text):
                in_notes = False if _FOOTER.fullmatch(text) else in_notes
                self.blank_before = not text
                continue
            if self.slug_pages and not re.search(r"[^\W_]", text):
                # Named rule STRAY_MARK_IGNORED: a line of punctuation only (FY2017 p245, a "+"
                # drawn above P.48). It carries no name and no amount.
                self.corrections.append(Correction("STRAY_MARK_IGNORED", f"dropped {text!r}", self.where))
                continue
            note = _NOTE.fullmatch(text)
            if self.slug_pages and (note is not None or _PROJECT_NOTE.fullmatch(text)):
                # FY2016 prints notes without "Nota:" ("*P.60 Butiran 00900- ...").
                # FY2016-2019 -layout scatters a note over several lines; -raw keeps each whole.
                for after_no, after in left_lines[index:]:
                    values = trailing_values(after, 2)[1]
                    if len(values) == 2 and all(v.has_decimals or v.is_dash for v in values):
                        raise self.fail("amounts below the notes", Citation(left.pdf_page, left_book, after_no, after))
                self.raw_notes(left)
                break
            if note is not None:
                self.add_note(note["text"])
                in_notes = True
                continue
            if in_notes:
                if text.startswith("*"):
                    self.add_note(text)  # the next note under the same "Nota:"
                else:
                    self.extend_note(text)
                continue
            row = self.feed_left(text, line, line_no)
            self.blank_before = False
            if row is not None:
                waiting.append(row)

        candidates: list[tuple[Citation, list[Value], list[int]]] = []
        trailing_text: list[Citation] = []
        for line_no, line in right_lines:
            text = line.strip()
            at = Citation(right.pdf_page, right_book, line_no, text)
            if not text or _FOOTER.fullmatch(text):
                continue
            label, values, ends = trailing_values(line, 7)
            if self.slug_pages and label == "" and len(values) == 1 and values[0].is_dash:
                # STRAY_MARK_IGNORED: a lone dash drawn in a column with no row (FY2016 p256).
                self.corrections.append(Correction("STRAY_MARK_IGNORED", "dropped a lone '-'", at))
                continue
            if label == "" and len(values) in (5, 6, 7):
                if trailing_text:
                    raise self.fail("text between amount rows on the right page", trailing_text[0])
                if any(v.marks for v in values):
                    raise self.fail("footnote mark on a right-page amount", at)
                candidates.append((at, values, ends))
            elif values:
                raise self.fail(f"right-page row with {len(values)} amounts, expected 7", at)
            else:
                trailing_text.append(at)  # the tail of a left-page note running across the gutter
        rows = [self.complete_row(row, candidates) for row in candidates]
        raw_labels = _raw_labels(left.raw)
        for project in self.projects[first_new:]:
            same_code = raw_labels.get(project.code)
            project.raw_label = same_code.pop(0) if same_code else None

        if len(rows) != len(waiting):
            raise ParseError(left.pdf_page, 1, "", f"spread pairs {len(waiting)} left rows with {len(rows)} right rows")
        for record, (at, values) in zip(waiting, rows, strict=True):
            record.right = tuple(v.hundredths for v in values)
            record.right_citation = at
            self.check_row(record)

    def complete_row(
        self, row: tuple[Citation, list[Value], list[int]], page: list[tuple[Citation, list[Value], list[int]]]
    ) -> tuple[Citation, list[Value]]:
        at, values, ends = row
        if len(values) == 7:
            return at, values
        complete = [r for r in page if len(r[1]) == 7]
        if not complete:
            raise self.fail(f"{len(values)} amounts and no complete row on the page to place them by", at)
        nearest = min(complete, key=lambda r: abs(r[0].line_no - at.line_no))
        filled = _fill_blank_cells(values, ends, nearest[2])
        if filled is None:
            raise self.fail(f"{len(values)} amounts, and the empty columns cannot be located", at)
        columns = ", ".join(_RIGHT_COLUMNS[c] for c in filled[1])
        self.corrections.append(Correction("BLANK_CELL_READ_AS_ZERO", f"empty {columns} read as zero", at))
        return at, filled[0]

    # left page

    def feed_left(self, text: str, line: str, line_no: int) -> _Project | _Total | None:
        label, values, _ = trailing_values(text, 2)
        if len(values) == 1:
            values = self.fill_left_cell(line, line_no)
        if values:
            return self.left_row(label, values)
        return self.left_text(text)

    def fill_left_cell(self, line: str, line_no: int) -> list[Value]:
        """Named rule BLANK_CELL_READ_AS_ZERO (left page): a row with one of its two cells
        empty (FY2018 p220, P.06 95000: no Kos Keseluruhan). The amount is placed by its
        right edge against the nearest complete row on the page; the empty cell reads as zero."""
        _, values, ends = trailing_values(line, 2)
        if not self.left_ends:
            raise self.fail("left-page row with one amount and no complete row to place it by")
        nearest = self.left_ends[min(self.left_ends, key=lambda n: abs(n - line_no))]
        column = min(range(2), key=lambda c: abs(ends[0] - nearest[c]))
        if abs(ends[0] - nearest[column]) > 2:
            raise self.fail("left-page row with one amount that lines up with neither column")
        blank = Value(0, "", True, False)
        name = ("Kos Keseluruhan", "Sebenar hingga akhir tahun lalu")[1 - column]
        self.corrections.append(Correction("BLANK_CELL_READ_AS_ZERO", f"empty {name} read as zero", self.where))
        return [values[0], blank] if column == 0 else [blank, values[0]]

    def left_row(self, label: str, values: list[Value]) -> _Project | _Total:
        if self.finished:
            raise self.fail("row after the statement total")
        left = (values[0].hundredths, values[1].hundredths)
        marks = values[0].marks + values[1].marks
        if _STATEMENT_TOTAL.fullmatch(label):
            if self.vote is not None:
                raise self.fail(f"statement total while {self.vote.code} is open")
            self.finished = True
            return self.total(DevelopmentScope.STATEMENT, None, None, marks, left)
        if marks:
            raise self.fail("footnote mark on an amount outside the statement total")
        vote = self.require_vote()
        open_group = self.open_group()
        if (
            (m := _VOTE_TOTAL.fullmatch(label)) is not None
            and open_group
            and _norm(m["name"]) == _norm(open_group.name)
        ):
            # A group total in capitals (FY2021 P.63 "JUMLAH PENDIDIKAN"): it names the open group.
            group = self.close_group(vote, m["name"])
            self.last_project = None
            return self.total(DevelopmentScope.GROUP, vote.code, group.ordinal, "", left)
        if (m := _VOTE_TOTAL.fullmatch(label)) is not None:
            if _norm(m["name"]) != _norm(vote.name):
                # Named rule VOTE_TOTAL_NAME_DIFFERS: the total closes the open vote. FY2022
                # heads P.24 "... INDUSTRI (MITI)" and totals it without "(MITI)".
                self.corrections.append(
                    Correction("VOTE_TOTAL_NAME_DIFFERS", f"{m['name']!r} closes {vote.code} {vote.name!r}", self.where)
                )
            if (open_group := self.open_group()) is not None:
                if not self.slug_pages:
                    raise self.fail(f"vote total while group {open_group.name!r} is open")
                self.dissolve(vote, open_group)
            self.vote = None
            self.last_project = None
            record = self.total(DevelopmentScope.VOTE, vote.code, None, "", left)
            self.reopenable = (vote, record) if self.slug_pages and not vote.groups else None
            return record
        if (m := _GROUP_TOTAL.fullmatch(label)) is not None:
            group = self.close_group(vote, m["name"])
            self.last_project = None
            return self.total(DevelopmentScope.GROUP, vote.code, group.ordinal, "", left)
        if (m := _PROJECT.fullmatch(label)) is not None:
            project = self.start_project(vote, m)
            project.left, project.left_citation = left, self.where
            return project
        project = self.last_project
        if project is not None and project.left is None:
            # The amounts sit on a wrapped line of a project whose code line has none.
            project.parts.append(label)
            project.lines.append(self.where.text)
            project.left, project.left_citation = left, self.where
            return project
        raise self.fail("amounts on a line that is not a project or a total")

    def left_text(self, text: str) -> None:
        reopenable, self.reopenable = self.reopenable, None
        if reopenable is not None and self.vote is None and not re.search(r"[a-z]", text) and not _VOTE.fullmatch(text):
            self.reopen(*reopenable)
        if (m := _VOTE.fullmatch(text)) is not None:
            code, name = f"P.{m['num']}", _SAMB.sub("", m["name"])
            if self.vote is not None and self.vote.code == code:
                return  # repeated at the top of a continuation page
            if self.vote is not None:
                raise self.fail(f"{code} starts while {self.vote.code} is open")
            if _SAMB.search(m["name"]):
                raise self.fail(f"{code} continues but was never opened")
            if any(v.code == code for v in self.votes):
                raise self.fail(f"{code} appears twice")
            self.vote = _Vote(code, name, self.where)
            self.votes.append(self.vote)
            self.last_project = None
            return
        if (m := _PROJECT.fullmatch(text)) is not None:
            self.start_project(self.require_vote(), m)
            return
        if not re.search(r"[a-z]", text):
            self.heading(self.require_vote(), text)
            return
        project = self.last_project
        open_group = self.open_group()
        if project is None and open_group is not None and self.slug_pages and self.blank_before:
            # A heading set off by a blank line from the heading just opened, with no project
            # between: the first is a caption with no total (FY2018 P.60 "PENGURUSAN DASAR
            # DALAM NEGERI" over "Tiga Perkhidmatan"), so it is dissolved (HEADING_WITHOUT_TOTAL).
            self.dissolve(self.require_vote(), open_group)
            open_group = None
        if project is None and open_group is not None:
            # Wraps the heading just opened: "BANGUNAN-BANGUNAN KERAJAAN" / "(Selain daripada Perumahan)".
            open_group.name = f"{open_group.name} {text}"
            return
        if project is None and self.slug_pages:
            # Named rule TITLE_CASE_HEADING (FY2016-2019): a heading printed in title case
            # ("Kerajaan Tempatan", FY2018 P.43). With no project above it and no group open,
            # the line cannot continue a name; it opens a group like a heading in capitals.
            self.corrections.append(Correction("TITLE_CASE_HEADING", f"{text!r} read as a heading", self.where))
            self.heading(self.require_vote(), text)
            return
        if project is None:
            raise self.fail("wrapped text with no project above it")
        project.parts.append(text)
        project.lines.append(text)

    def heading(self, vote: _Vote, text: str) -> None:
        open_group = self.open_group()
        if open_group is not None:
            if _norm(text) == _norm(open_group.name):
                return  # repeated at the top of a continuation page
            subheading = (
                _norm(text).startswith(_norm(open_group.name) + " ")
                if self.last_project is None
                else (self.blank_before)
            )
            if self.slug_pages and subheading:
                # Named rule SUBHEADING_NOT_TOTALLED (FY2016-2019): a heading inside an open
                # group that no "Jumlah" line closes: one that extends the group's own heading
                # ("PENGANGKUTAN DARAT" / "PENGANGKUTAN DARAT SEMENANJUNG"), or one set off by
                # a blank line after projects ("PROJEK KTMB" under "PROJEK REL/LRT/ERL"). Its
                # projects stay in the open group, whose printed total covers them.
                self.corrections.append(
                    Correction("SUBHEADING_NOT_TOTALLED", f"{text!r} inside group {open_group.name!r}", self.where)
                )
                return
            if self.last_project is None:
                # Capitals straight after a heading wrap the heading. FY2023 prints
                # "JALAN RAYA DAN JAMBATAN SEMENANJUNG" then "SEMENANJUNG" again.
                joined = f"{open_group.name} {text}"
                open_group.name = _collapse_repeats(joined)
                if open_group.name != joined:
                    self.corrections.append(
                        Correction("DUPLICATED_WORD_COLLAPSED", f"{joined!r} read as {open_group.name!r}", self.where)
                    )
                return
            # No heading opens inside an open group, so capitals here wrap a project
            # name (e.g. "MASMA" under 15200).
            self.last_project.parts.append(text)
            self.last_project.lines.append(text)
            return
        if (
            _SAMB.search(text)
            and self.slug_pages
            and any(g.closed and _norm(g.name).startswith(_norm(text).rstrip(" -–")) for g in vote.groups)
        ):
            # Named rule STALE_HEADING_IGNORED: a "(SAMB.)" heading for a group of this vote
            # already closed (FY2017 p229, P.23 "KEMENTERIAN/JABATAN KETUA PENGARAH TANAH DAN
            # GALIAN - (SAMB.)" after "Jumlah JUPEM"). It continues nothing; the projects below
            # it are read as if it were absent.
            self.corrections.append(Correction("STALE_HEADING_IGNORED", f"{text!r} names a closed group", self.where))
            return
        if _SAMB.search(text):
            raise self.fail("continued heading with no group open")
        vote.groups.append(_Group(vote.code, len(vote.groups) + 1, text, self.where))
        self.last_project = None

    def dissolve(self, vote: _Vote, group: _Group) -> None:
        """Named rule HEADING_WITHOUT_TOTAL (FY2016-2019): a heading still open when its vote's
        total is printed has no total of its own (FY2018 P.10 "PERBADANAN KEMAJUAN NEGERI").
        It is a caption, not a group: its projects belong to the vote only, whose total covers them."""
        members = [p for p in self.projects if p.vote_code == vote.code and p.group == group.ordinal]
        for project in members:
            project.group = None
        vote.groups.remove(group)
        detail = f"heading {group.name!r} over {len(members)} projects has no total; they belong to the vote only"
        self.corrections.append(Correction("HEADING_WITHOUT_TOTAL", detail, group.citation))

    def reopen(self, vote: _Vote, total: _Total) -> None:
        """Named rule OWN_PROJECTS_TOTAL_IN_CAPITALS (FY2016-2019): "JUMLAH <vote name>" under
        the ministry's own projects, followed by group headings of the same vote, totals those
        projects; the vote's own total is the second such line (FY2018 P.24)."""
        run = self.unheaded_run(vote)
        if not run:
            raise self.fail(f"heading after the total of {vote.code}, which has no projects to group")
        group = _Group(vote.code, len(vote.groups) + 1, vote.name, run[0].first, closed=True)
        vote.groups.append(group)
        for project in run:
            project.group = group.ordinal
        total.scope, total.group = DevelopmentScope.GROUP, group.ordinal
        self.vote = vote
        detail = f"'JUMLAH {vote.name}' totals the {len(run)} projects above it; a heading of {vote.code} follows"
        self.corrections.append(Correction("OWN_PROJECTS_TOTAL_IN_CAPITALS", detail, total.left_citation))

    def start_project(self, vote: _Vote, m: re.Match[str]) -> _Project:
        open_group = self.open_group()
        project = _Project(
            vote_code=vote.code,
            code=m["code"],
            mark=m["mark"],
            group=open_group.ordinal if open_group else None,
            parts=[m["name"] or ""],
            lines=[self.where.text],
            first=self.where,
        )
        self.projects.append(project)
        self.last_project = project
        return project

    def close_group(self, vote: _Vote, name: str) -> _Group:
        open_group = self.open_group()
        if open_group is not None:
            if _norm(name) != _norm(open_group.name):
                self.corrections.append(
                    Correction(
                        "GROUP_TOTAL_NAME_DIFFERS",
                        f"total {name!r} closes heading {open_group.name!r}",
                        self.where,
                    )
                )
            open_group.closed = True
            open_group.total_label = name
            return open_group
        run = self.unheaded_run(vote)
        if run:
            return self.headless_group(vote, name, run)
        return self.parent_group(vote, name)

    def unheaded_run(self, vote: _Vote) -> list[_Project]:
        """The projects printed most recently in this vote with no heading over them."""
        run: list[_Project] = []
        for project in reversed(self.projects):
            if project.vote_code != vote.code or project.group is not None:
                break
            run.insert(0, project)
        return run

    def headless_group(self, vote: _Vote, name: str, run: list[_Project]) -> _Group:
        """Projects with no heading, closed by "Jumlah <name>": position decides membership.

        Named rules: VOTE_NAMED_GROUP when the run sits directly under the vote header (the
        ministry's own projects; the label is the vote's name, or an abbreviation such as
        "MITI" in FY2023), and HEADING_MISSING when it follows another group's total (FY2023
        prints "Jumlah Projek Pengangkutan Jalan" with no heading above its projects).
        """
        first_group = not vote.groups
        label = vote.name if first_group and _norm(name) == _norm(vote.name) else name
        group = _Group(vote.code, len(vote.groups) + 1, label, run[0].first, closed=True)
        vote.groups.append(group)
        for project in run:
            project.group = group.ordinal
        rule = "VOTE_NAMED_GROUP" if first_group else "HEADING_MISSING"
        detail = f"'Jumlah {name}' totals the {len(run)} projects above it with no heading"
        self.corrections.append(Correction(rule, detail, self.where))
        return group

    def parent_group(self, vote: _Vote, name: str) -> _Group:
        m = _PARENT_NAME.fullmatch(name)
        if m is None:
            raise self.fail(f"total {name!r} closes no open group")
        stem = m["stem"].casefold()
        parts = [m["first"], *m["middle"].split(", "), m["last"]]
        parts = [p.casefold() for p in parts]
        members: list[_Group] = []
        for group in reversed(vote.groups):
            # Heading and total label both name the group; FY2021 heads one "LABUAN" and
            # totals it as "Jalan Raya dan Jambatan Labuan".
            g = f"{group.name} | {group.total_label}".casefold()
            if group.parent is not None or stem not in g or not any(p in g for p in parts):
                break
            members.insert(0, group)
        names = [f"{g.name} | {g.total_label}".casefold() for g in members]
        if len(members) < 2 or not all(any(p in n for n in names) for p in parts):
            raise self.fail(f"total {name!r} matches no run of groups by name")
        parent = _Group(vote.code, len(vote.groups) + 1, name, self.where, closed=True)
        vote.groups.append(parent)
        for group in members:
            group.parent = parent.ordinal
        listed = "; ".join(g.name for g in members)
        self.corrections.append(Correction("PARENT_GROUP_BY_NAME", f"{name!r} sums {listed}", self.where))
        return parent

    def open_group(self) -> _Group | None:
        if self.vote is None or not self.vote.groups or self.vote.groups[-1].closed:
            return None
        return self.vote.groups[-1]

    def require_vote(self) -> _Vote:
        if self.vote is None:
            raise self.fail("line outside any vote")
        return self.vote

    def total(
        self, scope: DevelopmentScope, vote_code: str | None, group: int | None, marks: str, left: tuple[int, int]
    ) -> _Total:
        record = _Total(scope, vote_code, group, marks, left, self.where)
        self.totals.append(record)
        return record

    # notes

    def raw_notes(self, page: PageText) -> None:
        lines = [" ".join(self.unbang(line).split()) for line in page.raw.split("\n")]
        start = next(i for i, line in enumerate(lines) if _NOTE.fullmatch(line) or _PROJECT_NOTE.fullmatch(line))
        for line in lines[start:]:
            self.where = Citation(page.pdf_page, self.where.book_page, 0, line)
            if not line or _FOOTER.fullmatch(line):
                continue
            if (note := _NOTE.fullmatch(line)) is not None:
                self.add_note(note["text"])
            elif line.startswith("*"):
                self.add_note(line)
            else:
                self.extend_note(line)

    def add_note(self, text: str) -> None:
        if (m := _PROJECT_NOTE.fullmatch(text)) is not None:
            codes = re.findall(r"\d{5}", m["codes"])
            if not codes or re.sub(r"\d{5}|\s|,|&|dan", "", m["codes"]) not in ("", "P"):
                raise self.fail("note names no butiran, or names one in an unknown form")
            if "P" in m["codes"]:
                self.corrections.append(
                    Correction(
                        "NOTE_CODE_SUFFIX_IGNORED", f"'Butiran {m['codes'].strip()}' read as {codes}", self.where
                    )
                )
            for code in codes:
                self.notes[(m["vote"], code)] = text
            self.note_keys = [(m["vote"], code) for code in codes]
            return
        if (m := _STATEMENT_NOTE.fullmatch(text)) is not None:
            self.statement_notes.append(text)
            self.note_keys = []
            return
        raise self.fail("note in an unknown form")

    def extend_note(self, text: str) -> None:
        if self.note_keys:
            for key in self.note_keys:
                self.notes[key] += " " + text
        elif self.statement_notes:
            self.statement_notes[-1] += " " + text
        else:
            raise self.fail("note continuation with no note")

    # checks and output

    def check_row(self, record: _Project | _Total) -> None:
        assert record.left is not None and record.right is not None
        _, prior = record.left
        ed, el, e, ad, al, a, to_date = record.right
        if ed + el != e:
            raise self.fail("estimate direct + loan does not equal estimate total", record.right_citation)
        if ad + al != a:
            raise self.fail("actual direct + loan does not equal actual total", record.right_citation)
        if self.plans["left"] == self.plans["right"]:
            if prior + a != to_date:
                raise self.fail(
                    "plan spending to date is not prior plan spending plus the year's actual", record.right_citation
                )
        elif a != to_date:
            # First year of a new plan: spending to date under it is this year's actual.
            raise self.fail(
                "first year of a plan, but plan spending to date is not the year's actual", record.right_citation
            )

    def finish(self) -> DevelopmentStatement:
        if not self.finished:
            raise self.fail("no statement total")
        used: set[tuple[str, str]] = set()
        projects: list[DevelopmentProject] = []
        seen: set[tuple[str, str]] = set()
        for p in self.projects:
            key = (p.vote_code, p.code)
            if key in seen:
                other = next(o for o in self.projects if (o.vote_code, o.code) == key)
                if other.group == p.group and _norm(" ".join(other.parts)) == _norm(" ".join(p.parts)):
                    raise self.fail(f"project {p.code} appears twice in {p.vote_code}", p.first)
                # Named rule DUPLICATE_PROJECT_CODE: two different rows printed with one code,
                # in different groups or under different names (FY2018 P.21 90700, PDF p224;
                # FY2016 P.10 96000, p227). Both are stored; each is its own row of the statement.
                detail = (
                    f"{p.vote_code} {p.code} also printed at pdf page {other.first.pdf_page} line {other.first.line_no}"
                )
                self.corrections.append(Correction("DUPLICATE_PROJECT_CODE", detail, p.first))
                if p.mark and other.mark:
                    raise self.fail(f"project {p.code} is printed twice, both marked; its note is ambiguous", p.first)
            seen.add(key)
            if p.left is None or p.right is None or p.left_citation is None or p.right_citation is None:
                raise self.fail(f"project {p.code} has no amounts", p.first)
            footnote = None
            if p.mark:
                footnote = self.notes.get(key)
                if footnote is None and self.slug_pages:
                    # Named rule MARK_WITHOUT_NOTE: the page marks the project but prints no note
                    # for it (FY2017 p225, P.21 "*23000"; the page's one note names 10810, 22200
                    # and 41000). No footnote is stored.
                    detail = f"{p.vote_code} {p.code} is marked, and no note names it"
                    self.corrections.append(Correction("MARK_WITHOUT_NOTE", detail, p.first))
                elif footnote is None:
                    raise self.fail(f"project {p.code} carries a mark with no note", p.first)
                used.add(key)
            raw = " ".join(" ".join(p.parts).split())
            doubled = _doubled(p.raw_label) if p.raw_label else None
            if doubled is not None:
                name = doubled
                self.corrections.append(Correction("DOUBLED_TEXT_LAYER", f"{p.raw_label!r} read as {name!r}", p.first))
            else:
                name = _collapse_repeats(raw)
                if name != raw:
                    self.corrections.append(
                        Correction("DUPLICATED_WORD_COLLAPSED", f"{raw!r} read as {name!r}", p.first)
                    )
            left_text = "\n".join(p.lines)
            projects.append(
                DevelopmentProject(
                    p.vote_code,
                    p.code,
                    p.group,
                    name,
                    _amounts(p.left, p.right),
                    footnote,
                    SpreadCitation(
                        Citation(p.first.pdf_page, p.first.book_page, p.first.line_no, left_text),
                        p.right_citation,
                    ),
                )
            )
        unused = set(self.notes) - used
        if unused:
            raise self.fail(f"notes for {sorted(unused)} are carried by no project")

        totals: list[DevelopmentTotal] = []
        for t in self.totals:
            if t.right is None or t.right_citation is None:
                raise self.fail("total has no right-page amounts", t.left_citation)
            footnote = None
            if t.marks:
                if len(self.statement_notes) != 1:
                    raise self.fail("statement total mark needs exactly one statement note", t.left_citation)
                footnote = self.statement_notes[0]
            elif t.scope is DevelopmentScope.STATEMENT and self.statement_notes:
                raise self.fail("statement note with no mark", t.left_citation)
            totals.append(
                DevelopmentTotal(
                    t.scope,
                    t.vote_code,
                    t.group,
                    _amounts(t.left, t.right),
                    footnote,
                    SpreadCitation(t.left_citation, t.right_citation),
                )
            )

        groups = [
            DevelopmentGroup(g.vote_code, g.ordinal, g.name, g.parent, g.citation) for v in self.votes for g in v.groups
        ]
        for g in groups:
            if not any(t.group_ordinal == g.ordinal and t.vote_code == g.vote_code for t in totals):
                raise self.fail(f"group {g.name!r} has no printed total", g.citation)
        return DevelopmentStatement(
            fiscal_year=self.fiscal_year,
            prior_plan=next(iter(self.plans["left"])),
            plan=next(iter(self.plans["right"])),
            votes=tuple(DevelopmentVote(v.code, v.name, v.citation) for v in self.votes),
            groups=tuple(groups),
            projects=tuple(projects),
            totals=tuple(totals),
            corrections=tuple(self.corrections),
        )


def _amounts(left: tuple[int, int], right: tuple[int, ...]) -> DevelopmentAmounts:
    return DevelopmentAmounts(left[0], left[1], *right)


def parse_development(pages: Sequence[PageText], fiscal_year: int, slug_pages: bool = False) -> DevelopmentStatement:
    if len(pages) % 2:
        raise ParseError(pages[-1].pdf_page, 1, "", "Lampiran 2 page range is not whole spreads")
    parser = _Parser(fiscal_year, slug_pages)
    for left, right in zip(pages[::2], pages[1::2], strict=True):
        parser.feed_spread(left, right)
    return parser.finish()
