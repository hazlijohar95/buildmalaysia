"""Parse Lampiran 2 (Penyata Perbelanjaan Pembangunan) from per-page pdftotext text.

The statement is printed as two-page spreads. The left page lists each row's label
(vote header, group heading, project, or a total) with two amounts: total cost and
plan spending to the end of the prior year. The right page prints, on the same row,
the year's seven figures. Rows without amounts on the left (vote headers, group
headings, wrapped names) have no row on the right, so the n-th left row that carries
amounts pairs with the n-th right row. Each spread must pair exactly.

Groups: a heading in capitals opens a group, and "Jumlah <name>" closes it. Two
patterns have no heading line of their own, and each is a named rule:
  VOTE_NAMED_GROUP: "Jumlah <vote name>" totals the projects printed under the vote
    header before the first heading (the ministry's own projects).
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
from pipeline.parse import PageText, ParseError, Value, parse_value

_RUNNING_HEAD = re.compile(
    r"(?:(?P<left>\d+)\s+)?PENYATA KEWANGAN KERAJAAN PERSEKUTUAN (?P<year>\d{4})(?:\s+(?P<right>\d+))?"
)
_LEFT_UNITS = re.compile(r"RM\s+RM")
_RIGHT_UNITS = re.compile(r"RM(?:\s+RM){6}")
_HEAD_WORDS = {
    "Penyata", "Perbelanjaan", "Pembangunan", "bagi", "tahun", "berakhir", "31", "Disember",
    "Maksud", "Kos", "Keseluruhan", "Sebenar", "RMKe-12", "Hingga", "Anggaran", "Tahun",
    "Cara", "Langsung", "Pinjaman", "Jumlah", "(", "sambungan)", "(sambungan)",
}  # fmt: skip
_FOOTER = re.compile(r"\d{1,3}|LAMPIRAN 2 - PERBELANJAAN PEMBANGUNAN")
_SAMB = re.compile(r"\s*\(SAMB\.\)$")

_VOTE = re.compile(r"P\.(?P<num>\d{2})\s+(?P<name>.+)")
_PROJECT = re.compile(r"(?P<mark>\*?)(?P<code>\d{5})(?:\s+(?P<name>.*))?")
_STATEMENT_TOTAL = re.compile(r"JUMLAH PERBELANJAAN PEMBANGUNAN")
_VOTE_TOTAL = re.compile(r"JUMLAH (?P<name>.+)")
_GROUP_TOTAL = re.compile(r"Jumlah (?P<name>.+)")
_NOTE = re.compile(r"Nota:\s*(?P<text>.*)")
_PROJECT_NOTE = re.compile(r"\*(?P<vote>P\.\d{2})\s*[–-]\s*Butiran\s+(?P<codes>[\d\s,dan]+?)\s*-\s*(?P<text>.+)")
_STATEMENT_NOTE = re.compile(r"\*\s+(?P<text>.+)")
_PARENT_NAME = re.compile(r"(?P<stem>.+?) (?P<first>\S+), (?P<middle>.+?) dan (?P<last>.+)")


def _norm(name: str) -> str:
    return " ".join(_SAMB.sub("", name).split()).casefold()


def _trailing_values(line: str, limit: int) -> tuple[str, list[Value]]:
    """Split a layout line into its label and up to `limit` trailing amounts."""
    line = re.sub(r"\s+\)", ")", line)  # "(846,800,930.00 )" prints a space before the bracket
    tokens = list(re.finditer(r"\S+", line))
    values: list[Value] = []
    label_end = len(line)
    for token in reversed(tokens):
        value = parse_value(token.group())
        if value is None or len(values) == limit:
            break
        values.insert(0, value)
        label_end = token.start()
    return line[:label_end].strip(), values


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
    def __init__(self, fiscal_year: int) -> None:
        self.fiscal_year = fiscal_year
        self.votes: list[_Vote] = []
        self.vote: _Vote | None = None
        self.projects: list[_Project] = []
        self.totals: list[_Total] = []
        self.corrections: list[Correction] = []
        self.notes: dict[tuple[str, str], str] = {}  # (vote, project code) -> note
        self.statement_notes: list[str] = []
        self.note_keys: list[tuple[str, str]] = []  # the projects the note being read applies to
        self.last_project: _Project | None = None
        self.finished = False
        self.where = Citation(0, 0, 0, "")

    def fail(self, message: str, at: Citation | None = None) -> ParseError:
        at = at or self.where
        return ParseError(at.pdf_page, at.line_no, at.text, message)

    # pages

    def body(self, page: PageText, units: re.Pattern[str]) -> tuple[int, list[tuple[int, str]]]:
        """Return the book page and the numbered lines below the column units line."""
        lines = page.layout.split("\n")
        at = next((i for i, line in enumerate(lines) if units.fullmatch(line.strip())), None)
        if at is None:
            raise ParseError(page.pdf_page, 1, lines[0] if lines else "", "no column units line")
        book_pages: list[int] = []
        for i, line in enumerate(lines[:at]):
            text = " ".join(line.split())
            running = _RUNNING_HEAD.fullmatch(text)
            if running is not None and int(running["year"]) == self.fiscal_year:
                book_pages.append(int(running["left"] or running["right"]))
            elif not set(text.split()) <= _HEAD_WORDS | {
                str(self.fiscal_year),
                f"31.12.{self.fiscal_year}",
                f"31.12.{self.fiscal_year - 1}",
            }:
                raise ParseError(page.pdf_page, i + 1, line, "unexpected line in the page head")
        if len(book_pages) != 1:
            raise ParseError(page.pdf_page, 1, lines[0], "page head has no single running head")
        return book_pages[0], [(i + 1, lines[i]) for i in range(at + 1, len(lines))]

    def feed_spread(self, left: PageText, right: PageText) -> None:
        left_book, left_lines = self.body(left, _LEFT_UNITS)
        right_book, right_lines = self.body(right, _RIGHT_UNITS)
        if (right.pdf_page, right_book) != (left.pdf_page + 1, left_book + 1):
            raise ParseError(right.pdf_page, 1, "", "right page does not follow its left page")

        waiting: list[_Project | _Total] = []  # left rows with amounts, in print order
        in_notes = False
        for line_no, line in left_lines:
            text = line.strip()
            self.where = Citation(left.pdf_page, left_book, line_no, text)
            if not text or _FOOTER.fullmatch(text):
                in_notes = False if _FOOTER.fullmatch(text) else in_notes
                continue
            note = _NOTE.fullmatch(text)
            if note is not None:
                self.add_note(note["text"])
                in_notes = True
                continue
            if in_notes:
                self.extend_note(text)
                continue
            row = self.feed_left(text)
            if row is not None:
                waiting.append(row)

        rows: list[tuple[Citation, list[Value]]] = []
        trailing_text: list[Citation] = []
        for line_no, line in right_lines:
            text = line.strip()
            at = Citation(right.pdf_page, right_book, line_no, text)
            if not text or _FOOTER.fullmatch(text):
                continue
            label, values = _trailing_values(text, 7)
            if label == "" and len(values) == 7:
                if trailing_text:
                    raise self.fail("text between amount rows on the right page", trailing_text[0])
                if any(v.marks for v in values):
                    raise self.fail("footnote mark on a right-page amount", at)
                rows.append((at, values))
            elif values:
                raise self.fail(f"right-page row with {len(values)} amounts, expected 7", at)
            else:
                trailing_text.append(at)  # the tail of a left-page note running across the gutter

        if len(rows) != len(waiting):
            raise ParseError(left.pdf_page, 1, "", f"spread pairs {len(waiting)} left rows with {len(rows)} right rows")
        for record, (at, values) in zip(waiting, rows, strict=True):
            record.right = tuple(v.hundredths for v in values)
            record.right_citation = at
            self.check_row(record)

    # left page

    def feed_left(self, text: str) -> _Project | _Total | None:
        label, values = _trailing_values(text, 2)
        if len(values) == 1:
            raise self.fail("left-page row with one amount, expected 2")
        if values:
            return self.left_row(label, values)
        return self.left_text(text)

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
        if (m := _VOTE_TOTAL.fullmatch(label)) is not None:
            if _norm(m["name"]) != _norm(vote.name):
                raise self.fail(f"vote total for {m['name']!r} inside {vote.code} {vote.name}")
            if (open_group := self.open_group()) is not None:
                raise self.fail(f"vote total while group {open_group.name!r} is open")
            self.vote = None
            self.last_project = None
            return self.total(DevelopmentScope.VOTE, vote.code, None, "", left)
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
        if project is None:
            raise self.fail("wrapped text with no project above it")
        project.parts.append(text)
        project.lines.append(text)

    def heading(self, vote: _Vote, text: str) -> None:
        open_group = self.open_group()
        if open_group is not None:
            if _norm(text) == _norm(open_group.name):
                return  # repeated at the top of a continuation page
            # No heading opens inside an open group, so capitals here wrap a project
            # name (e.g. "MASMA" under 15200).
            if self.last_project is None:
                raise self.fail(f"heading while group {open_group.name!r} is open")
            self.last_project.parts.append(text)
            self.last_project.lines.append(text)
            return
        if _SAMB.search(text):
            raise self.fail("continued heading with no group open")
        vote.groups.append(_Group(vote.code, len(vote.groups) + 1, text, self.where))
        self.last_project = None

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
            return open_group
        if _norm(name) == _norm(vote.name):
            return self.vote_named_group(vote)
        return self.parent_group(vote, name)

    def vote_named_group(self, vote: _Vote) -> _Group:
        members = [p for p in self.projects if p.vote_code == vote.code and p.group is None]
        if not members or vote.groups:
            raise self.fail("vote-named total without a run of projects directly under the vote header")
        group = _Group(vote.code, len(vote.groups) + 1, vote.name, vote.citation, closed=True)
        vote.groups.append(group)
        for project in members:
            project.group = group.ordinal
        self.corrections.append(
            Correction("VOTE_NAMED_GROUP", f"{len(members)} projects under the vote header form a group", self.where)
        )
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
            g = group.name.casefold()
            if group.parent is not None or stem not in g or not any(p in g for p in parts):
                break
            members.insert(0, group)
        if len(members) < 2 or not all(any(p in g.name.casefold() for g in members) for p in parts):
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

    def add_note(self, text: str) -> None:
        if (m := _PROJECT_NOTE.fullmatch(text)) is not None:
            codes = re.findall(r"\d{5}", m["codes"])
            if not codes:
                raise self.fail("note names no butiran")
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
        if prior + a != to_date:
            raise self.fail(
                "plan spending to date is not prior plan spending plus the year's actual", record.right_citation
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
                raise self.fail(f"project {p.code} appears twice in {p.vote_code}", p.first)
            seen.add(key)
            if p.left is None or p.right is None or p.left_citation is None or p.right_citation is None:
                raise self.fail(f"project {p.code} has no amounts", p.first)
            footnote = None
            if p.mark:
                footnote = self.notes.get(key)
                if footnote is None:
                    raise self.fail(f"project {p.code} carries a mark with no note", p.first)
                used.add(key)
            raw = " ".join(" ".join(p.parts).split())
            name = _collapse_repeats(raw)
            if name != raw:
                self.corrections.append(Correction("DUPLICATED_WORD_COLLAPSED", f"{raw!r} read as {name!r}", p.first))
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
            votes=tuple(DevelopmentVote(v.code, v.name, v.citation) for v in self.votes),
            groups=tuple(groups),
            projects=tuple(projects),
            totals=tuple(totals),
            corrections=tuple(self.corrections),
        )


def _amounts(left: tuple[int, int], right: tuple[int, ...]) -> DevelopmentAmounts:
    return DevelopmentAmounts(left[0], left[1], *right)


def parse_development(pages: Sequence[PageText], fiscal_year: int) -> DevelopmentStatement:
    if len(pages) % 2:
        raise ParseError(pages[-1].pdf_page, 1, "", "Lampiran 2 page range is not whole spreads")
    parser = _Parser(fiscal_year)
    for left, right in zip(pages[::2], pages[1::2], strict=True):
        parser.feed_spread(left, right)
    return parser.finish()
