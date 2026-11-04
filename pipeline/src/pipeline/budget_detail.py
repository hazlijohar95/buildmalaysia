"""Parse the MOF budget book's operating estimates per vote (T and B votes).

Each vote prints two tables:
  - "Anggaran Perbelanjaan Mengurus ... Mengikut Objek Am": the vote's estimate per
    object group and its total.
  - The detail table: programme (XX0000) -> activity (XXYY00) -> object group, each with
    the current year's original estimate and the coming year's estimate, and established
    posts (Bil. Jawatan) on object lines that have them. Programme rows and the object
    lines straight under them are totals over the programme's activities; activity object
    lines are the leaves. The table closes with JUMLAH ANGGARAN PERBELANJAAN MENGURUS.

Names wrap. The wrapped text can stand alone, or share a line with an object row
("Pelancongan    40000    4,000    4,000"), or follow the object row ("(IBRD)"); every
such piece belongs to the heading whose block it is in. The parser stores every printed
total; the budget_operating_reconciliation view recomputes each from the leaves.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from pipeline.model import Citation
from pipeline.parse import PageText, ParseError, Value, parse_value

_FOOTER = re.compile(r"(?:\d+ \| )?ANGGARAN PERBELANJAAN PERSEKUTUAN (?P<year>\d{4})(?: \| \d+)?")
_BOOK_PAGE = re.compile(r"^(\d+) \| ANGGARAN|ANGGARAN PERBELANJAAN PERSEKUTUAN \d{4} \| (\d+)$")
_VOTE = re.compile(r"(?<![\w./])(?P<letter>[TB])(?:/P)?\.(?P<num>\d{1,2})(?![\w.])")  # "B.6", "B/P.6"
_TITLE = re.compile(r"Maksud (?:Bekalan|Tanggungan)(?:/Pembangunan)? \d+ [–-] (?P<name>.+?)(?:\s+[TB](?:/P)?\.\d+)?$")
_HEAD_WORDS = {
    "Kod", "Anggaran", "Bil.", "Jawatan", "Butiran", "Program/Aktiviti", "(Objek", "Am)", "RM",
    "Jenis", "Perbelanjaan", "Tahun",
}  # fmt: skip
_LEADERS = re.compile(r"(?<!\S)\.{2,}(?!\S)")
_HEADING = re.compile(r"(?P<code>\d{6})(?:\s+(?P<name>.*))?")
_OBJECT = re.compile(r"(?:(?P<text>.*?)\s+)?(?P<code>[1-5]0000)")
_OBJECT_ROW = re.compile(r"(?P<code>[1-5]0000)\s+(?P<name>\D.*)")


@dataclass(frozen=True)
class Estimate:
    prior: int  # current year's original estimate, sen (Anggaran 2026 in Budget 2027)
    estimate: int  # coming year's estimate, sen
    prior_posts: int | None = None
    posts: int | None = None


@dataclass
class Heading:
    vote_code: str
    code: str  # XX0000 programme or XXYY00 activity
    parts: list[str]
    citation: Citation
    total: Estimate | None = None
    objects: dict[str, tuple[Estimate, Citation]] = field(default_factory=dict)

    @property
    def is_programme(self) -> bool:
        return self.code.endswith("0000")

    @property
    def name(self) -> str:
        return " ".join(" ".join(self.parts).split())


@dataclass
class OperatingVote:
    code: str
    name: str
    headings: list[Heading] = field(default_factory=list)
    total: tuple[Estimate, Citation] | None = None
    by_object: dict[str, tuple[Estimate, Citation]] = field(default_factory=dict)
    object_page_total: tuple[Estimate, Citation] | None = None
    # A ministry with a development vote (B/P.nn) also prints development by object group.
    development_by_object: dict[str, tuple[Estimate, Citation]] = field(default_factory=dict)
    development_total: tuple[Estimate, Citation] | None = None
    object_section: str = "operating"  # which table of the object page is being read
    summary_rows: dict[str, Estimate] = field(default_factory=dict)
    total_pending: bool = False  # a JUMLAH printed without amounts, which follow on the next line
    last_ends: list[int] = field(default_factory=list)  # where the last two-amount row's amounts end
    development_split: tuple[Estimate, Estimate] | None = None  # (Cara Langsung, Pinjaman)


@dataclass(frozen=True)
class OperatingEstimates:
    budget_year: int
    votes: tuple[OperatingVote, ...]


def trailing_values(line: str, limit: int) -> tuple[str, list[Value], list[int]]:
    """Split off up to `limit` trailing amounts. The budget book prints zero as "0", never
    as a dash, so a trailing "-" belongs to the label ("Pencen dan Pencen Terbitan -")."""
    values: list[Value] = []
    ends: list[int] = []
    label_end = len(line)
    for token in reversed(list(re.finditer(r"\S+", line))):
        value = parse_value(token.group()) if re.fullmatch(r"\(?[\d,]+\)?", token.group()) else None
        if value is None or len(values) == limit:
            break
        values.insert(0, value)
        ends.insert(0, token.end())
        label_end = token.start()
    return line[:label_end].strip(), values, ends


def _estimate(values: list[Value]) -> Estimate:
    if any(v.marks or v.has_decimals for v in values):
        raise ValueError("estimates are whole ringgit")
    amounts = [v.hundredths for v in values]
    if len(values) == 2:
        return Estimate(amounts[0], amounts[1])
    if len(values) == 4:
        # posts are counts printed as plain integers; hundredths holds count * 100
        return Estimate(amounts[0], amounts[1], amounts[2] // 100, amounts[3] // 100)
    raise ValueError(f"{len(values)} amounts")


class _Parser:
    def __init__(self, budget_year: int) -> None:
        self.budget_year = budget_year
        self.votes: dict[str, OperatingVote] = {}
        self.vote: OperatingVote | None = None
        self.heading: Heading | None = None
        self.closed = False  # the open vote's detail table has printed its JUMLAH
        # Budget 2025 prints a small vote's object-group summary ("RINGKASAN ANGGARAN
        # PERBELANJAAN") at the top of its detail page; then the vote name, then the table.
        self.embedded = False
        self.after_embedded = False
        self.notes: list[str] = []  # named rules applied, for the ingest log
        self.where = Citation(0, 0, 0, "")
        self.page_offset: int | None = None

    def book_page(self, page: PageText, texts: list[str]) -> int | None:
        """The printed page number; Budget 2025 omits it on a few pages, which then take it
        from the PDF-to-book offset of the pages that print one."""
        printed = next((int(m[1] or m[2]) for t in texts if (m := _BOOK_PAGE.search(t))), None)
        if printed is not None:
            self.page_offset = page.pdf_page - printed
            return printed
        return page.pdf_page - self.page_offset if self.page_offset is not None else None

    def fail(self, message: str) -> ParseError:
        return ParseError(self.where.pdf_page, self.where.line_no, self.where.text, message)

    def feed_page(self, page: PageText) -> None:
        lines = page.layout.split("\n")
        texts = [" ".join(line.split()) for line in lines]
        body = "\n".join(texts)
        if "MENGIKUT OBJEK AM" in body or ("Jenis Perbelanjaan" in body and "Bil. Jawatan" not in body):
            kind = "objects"  # Budget 2025 titles some of these pages without "MENGIKUT OBJEK AM"
        elif "Bil. Jawatan" in body and "Butiran" in body:
            kind = "detail"
        else:
            return  # charts, outcome tables, development tables, blank pages
        book_page = self.book_page(page, texts)
        if book_page is None:
            raise ParseError(page.pdf_page, 1, "", "no book page in the footer")
        head = next((i for i, t in enumerate(texts) if _TITLE.search(t)), None)
        if head is None:
            raise ParseError(page.pdf_page, 1, texts[0], "table page without a 'Maksud ...' title")
        codes = {f"{m['letter']}.{int(m['num']):02d}" for t in texts[: head + 1] for m in _VOTE.finditer(t)}
        if len(codes) != 1:
            raise ParseError(page.pdf_page, head + 1, texts[head], f"page names votes {sorted(codes)}")
        code = codes.pop()
        title = _TITLE.search(texts[head])
        assert title is not None
        self.enter_vote(code, title["name"], Citation(page.pdf_page, book_page, head + 1, texts[head]))
        units = next((i for i, t in enumerate(texts) if t == "RM RM"), None)
        if units is None:
            raise ParseError(page.pdf_page, 1, "", "no 'RM RM' units line")
        for i in range(units + 1, len(lines)):
            # Budget 2025 (Word) prints leader dots between a heading's name and its amounts.
            line = _LEADERS.sub(" ", lines[i]).strip()
            text = " ".join(line.split())
            self.where = Citation(page.pdf_page, book_page, i + 1, texts[i])
            if not text or _FOOTER.fullmatch(text):
                continue
            if kind == "objects":
                self.object_page_line(line)
            else:
                self.detail_line(line)

    def enter_vote(self, code: str, name: str, at: Citation) -> None:
        if self.vote is not None and self.vote.code == code:
            return
        if self.vote is not None:
            self.finish_vote()
        if code in self.votes:
            raise ParseError(at.pdf_page, at.line_no, at.text, f"{code} appears again after another vote")
        self.vote = OperatingVote(code, " ".join(name.split()))
        self.votes[code] = self.vote
        self.heading, self.closed = None, False

    def object_page_line(self, line: str) -> None:
        """Operating by object group; for B/P ministries also development by object group and a
        RINGKASAN of the two, whose rows are checked here against the two tables' totals."""
        vote = self.vote
        assert vote is not None
        text = " ".join(line.split())
        if text.startswith("ANGGARAN PERBELANJAAN PEMBANGUNAN BAGI TAHUN"):
            vote.object_section = "development"
            return
        if text == "RINGKASAN":
            vote.object_section = "summary"
            return
        label, values, ends = trailing_values(line, 2)
        label = " ".join(label.split())
        if len(values) == 2:
            vote.last_ends = ends
        elif len(values) == 1 and vote.last_ends:
            # One cell blank (Budget 2025: a Pinjaman row with nothing in the prior year):
            # place the amount by its right edge against the row above; the blank reads as zero.
            nearest = min(range(2), key=lambda c: abs(ends[0] - vote.last_ends[c]))
            zero = parse_value("0")
            assert zero is not None
            values = [zero, values[0]] if nearest == 1 else [values[0], zero]
        if not values:
            if text.startswith("JUMLAH ANGGARAN PERBELANJAAN"):
                vote.total_pending = True  # the amounts follow on the next line, beside the vote name
            return  # column heads, a wrapped "MENGURUS"/"PEMBANGUNAN", the vote name under the table
        if vote.total_pending:
            vote.total_pending = False
            label = "JUMLAH ANGGARAN PERBELANJAAN"
        if len(values) != 2:
            raise self.fail("object summary row without two amounts")
        estimate = _estimate(values)
        section = vote.object_section
        if section == "summary":
            rows = vote.summary_rows
            if label == "Anggaran Perbelanjaan Mengurus":
                rows["operating"] = estimate
            elif label in ("(Cara Langsung)", "Anggaran Perbelanjaan Pembangunan"):
                rows["direct"] = estimate
            elif label == "(Pinjaman)":
                rows["loan"] = estimate
            elif label.startswith("JUMLAH ANGGARAN PERBELANJAAN"):
                self.check_summary(rows, estimate)
            else:
                raise self.fail("unknown RINGKASAN row")
            return
        by_object = vote.by_object if section == "operating" else vote.development_by_object
        if label.startswith("JUMLAH ANGGARAN PERBELANJAAN"):
            if section == "operating":
                vote.object_page_total = (estimate, self.where)
            else:
                vote.development_total = (estimate, self.where)
        elif (m := _OBJECT_ROW.fullmatch(label)) is not None:
            if m["code"] in by_object:
                raise self.fail(f"object {m['code']} twice in the summary")
            by_object[m["code"]] = (estimate, self.where)
        else:
            raise self.fail("unknown object summary row")

    def check_summary(self, rows: dict[str, Estimate], total: Estimate) -> None:
        """RINGKASAN: Mengurus = the operating table's total; Cara Langsung + Pinjaman = the
        development table's total; JUMLAH = both."""
        vote = self.vote
        assert vote is not None
        op, dev = vote.object_page_total, vote.development_total
        if op is None or dev is None or "operating" not in rows or "direct" not in rows:
            raise self.fail("RINGKASAN without both tables and rows")

        def pair(e: Estimate) -> tuple[int, int]:
            return (e.prior, e.estimate)

        if "loan" in rows:
            loan = rows["loan"]
        else:
            # Named rule RINGKASAN_LOAN_ROW_MISSING: Budget 2025 prints no (Pinjaman) row for
            # B/P.6 although its JUMLAH and development table include RM60m loan-funded in
            # 2024. With no loan row, the loan is what the development table has beyond the
            # direct row; it must not be negative, and Mengurus and JUMLAH still check.
            gap = (dev[0].prior - rows["direct"].prior, dev[0].estimate - rows["direct"].estimate)
            if min(gap) < 0:
                raise self.fail(f"RINGKASAN direct row exceeds the development table by {gap}")
            loan = Estimate(gap[0], gap[1])
            if any(gap):
                self.notes.append(f"{vote.code} RINGKASAN has no (Pinjaman) row; loan read as {gap} sen")

        checks = [
            ("Mengurus", pair(rows["operating"]), pair(op[0])),
            ("Pembangunan", (rows["direct"].prior + loan.prior, rows["direct"].estimate + loan.estimate), pair(dev[0])),
            ("JUMLAH", pair(total), (op[0].prior + dev[0].prior, op[0].estimate + dev[0].estimate)),
        ]
        for name, printed, expected in checks:
            if printed != expected:
                raise self.fail(f"RINGKASAN {name} prints {printed}, the tables give {expected}")
        vote.development_split = (rows["direct"], loan)

    def detail_line(self, line: str) -> None:
        assert self.vote is not None
        if self.closed:
            return  # notes printed below the table's JUMLAH
        text = " ".join(line.split())
        if text == "RINGKASAN ANGGARAN PERBELANJAAN" and not self.vote.headings:
            self.embedded = True
            return
        if self.embedded:
            if self.vote.object_page_total is None:
                self.object_page_line(text)  # title lines without amounts are skipped there
                return
            self.embedded, self.after_embedded = False, True
        if self.after_embedded and not self.vote.headings and not trailing_values(text, 2)[1]:
            return  # the vote name printed between the summary and the table
        # Programme and activity rows carry two amounts and no posts; a name can end in a
        # number ("Cawangan Kerja Bangunan Am 1"), so take only two from those rows.
        label, values, _ = trailing_values(line, 2 if _HEADING.match(line) else 4)
        label = " ".join(label.split())
        try:
            estimate = _estimate(values) if values else None
        except ValueError as error:
            raise self.fail(str(error)) from error
        if label.startswith("JUMLAH ANGGARAN PERBELANJAAN"):  # the word MENGURUS may wrap below
            if estimate is None:
                raise self.fail("vote total without amounts")
            self.vote.total = (estimate, self.where)
            self.heading, self.closed = None, True
            return
        if (m := _HEADING.fullmatch(label)) is not None:
            if estimate is not None and estimate.posts is not None:
                raise self.fail("posts on a programme or activity row")
            self.open_heading(m["code"], m["name"] or "", estimate)
            return
        if (m := _OBJECT.fullmatch(label)) is not None and estimate is not None:
            heading = self.require_heading()
            if m["text"]:
                heading.parts.append(m["text"])
            if m["code"] in heading.objects:
                raise self.fail(f"object {m['code']} twice under {heading.code}")
            heading.objects[m["code"]] = (estimate, self.where)
            return
        heading = self.require_heading()
        if label:
            heading.parts.append(label)
        if estimate is not None:
            if heading.total is not None or estimate.posts is not None:
                raise self.fail("amounts with no code on a heading that already has its total")
            heading.total = estimate  # amounts printed on a wrapped heading's later line

    def open_heading(self, code: str, name: str, estimate: Estimate | None) -> None:
        assert self.vote is not None
        if any(h.code == code for h in self.vote.headings):
            raise self.fail(f"{code} appears twice in {self.vote.code}")
        programme = next((h for h in reversed(self.vote.headings) if h.is_programme), None)
        if not code.endswith("0000") and (programme is None or programme.code[:2] != code[:2]):
            raise self.fail(f"activity {code} outside its programme")
        self.heading = Heading(self.vote.code, code, [name], self.where, estimate)
        self.vote.headings.append(self.heading)

    def require_heading(self) -> Heading:
        if self.heading is None:
            raise self.fail("line outside any programme or activity")
        return self.heading

    def finish_vote(self) -> None:
        vote = self.vote
        assert vote is not None
        if vote.total is None:
            raise ParseError(self.where.pdf_page, 0, "", f"{vote.code} detail table has no JUMLAH")
        if vote.object_page_total is None:
            raise ParseError(self.where.pdf_page, 0, "", f"{vote.code} has no object summary total")
        for heading in vote.headings:
            if heading.total is None:
                raise ParseError(
                    heading.citation.pdf_page,
                    heading.citation.line_no,
                    heading.citation.text,
                    f"{heading.code} has no amounts",
                )
        programmes = [h for h in vote.headings if h.is_programme]
        for programme in programmes:
            if not any(h.code[:2] == programme.code[:2] and not h.is_programme for h in vote.headings):
                c = programme.citation
                raise ParseError(c.pdf_page, c.line_no, c.text, f"programme {programme.code} has no activities")


def parse_operating_estimates(pages: Sequence[PageText], budget_year: int) -> OperatingEstimates:
    parser = _Parser(budget_year)
    for page in pages:
        parser.feed_page(page)
    if parser.vote is not None:
        parser.finish_vote()
    return OperatingEstimates(budget_year, tuple(parser.votes.values()))
