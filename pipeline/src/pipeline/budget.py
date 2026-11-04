"""Parse the MOF budget book's vote summary: "Ringkasan Perbelanjaan Sebenar dan Anggaran
Perbelanjaan Mengurus dan Pembangunan" (Budget 2027: book pages 21-33).

Every vote prints a total line ("B.6 Mengurus" or "P.6 Pembangunan") and its parts
(Emolumen and Perbelanjaan-perbelanjaan Lain; or Cara Langsung and Pinjaman), each with
four amounts: two years of actuals, the current year's original estimate and the coming
year's estimate. Votes sit in blocks under a ministry heading, each closed by a JUMLAH
line; a block of several votes also prints its own Mengurus/Pembangunan subtotal. The
document ends with the charged-expenditure summary and the grand summary.

Every printed figure is checked as it is read: parts against their total, every block
JUMLAH and subtotal against its votes, and the summaries against all votes. Any line the
parser cannot place, or any sum that does not hold, stops the parse.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from pipeline.development import trailing_values
from pipeline.model import Citation
from pipeline.parse import PageText, ParseError

# Odd pages print "ANGGARAN PERBELANJAAN PERSEKUTUAN 2027 | 21", even pages "22 | ANGGARAN ...".
_FOOTER = re.compile(r"(?:(?P<left>\d+) \| )?ANGGARAN PERBELANJAAN PERSEKUTUAN (?P<year>\d{4})(?: \| (?P<right>\d+))?")
_HEAD_LINES = {
    "RINGKASAN PERBELANJAAN SEBENAR DAN",
    "ANGGARAN PERBELANJAAN MENGURUS DAN PEMBANGUNAN",
}
_HEAD_WORDS = {"Perbelanjaan", "Anggaran", "Maksud", "Sebenar", "Asal", "RM"}
_VOTE = re.compile(r"(?P<letter>[TBP])\.(?P<num>\d{1,2})\s+(?P<kind>Mengurus|Pembangunan|Simpanan Luar Jangka)")
_PARTS = {
    "Emolumen": "emoluments",
    "Perbelanjaan-perbelanjaan Lain": "other",
    "Cara Langsung": "direct",
    "Pinjaman": "loan",
}
_SUBTOTAL = {"Mengurus": "operating", "Pembangunan": "development"}
_NOTE = re.compile(r"(?P<mark>\d) (?P<text>(?:[TBP]|B/P)\.\d{1,2} - .+)")


@dataclass
class BudgetFigure:
    """One printed line's four amounts, in sen, by column."""

    amounts: tuple[int, int, int, int]
    citation: Citation


@dataclass
class BudgetVote:
    code: str  # "B.06"
    heading: str
    total: BudgetFigure
    parts: dict[str, BudgetFigure] = field(default_factory=dict)
    note: str | None = None  # footnote on the ministry heading, e.g. a renamed or merged ministry

    @property
    def operating(self) -> bool:
        return not self.code.startswith("P.")


@dataclass(frozen=True)
class BudgetSummary:
    """The grand summary, per column."""

    lines: dict[str, BudgetFigure]  # operating, emoluments, other, development, direct, loan, contingency, grand_total


@dataclass(frozen=True)
class BudgetStatement:
    budget_year: int
    columns: tuple[tuple[int, str], ...]  # (fiscal year, basis) per amount column
    votes: tuple[BudgetVote, ...]
    summary: BudgetSummary
    checks: int  # printed totals verified
    rounding: tuple[str, ...]  # named rule ROUNDED_INDEPENDENTLY: totals off their parts by rounding


def _add(*rows: tuple[int, ...]) -> tuple[int, int, int, int]:
    a = [0, 0, 0, 0]
    for row in rows:
        for i, v in enumerate(row):
            a[i] += v
    return (a[0], a[1], a[2], a[3])


class _Parser:
    def __init__(self, budget_year: int, known_misprints: Sequence[tuple[str, tuple[int, int, int, int]]] = ()) -> None:
        self.budget_year = budget_year
        self.known = dict(known_misprints)
        self.misprints_seen: list[str] = []
        self.votes: list[BudgetVote] = []
        self.heading: list[str] = []
        self.block: list[BudgetVote] = []  # votes since the last JUMLAH
        # Votes since the last heading in capitals. A ministry heading is in capitals
        # ("KEMENTERIAN KEWANGAN"); an agency within it in title case ("Perbendaharaan").
        self.group: list[BudgetVote] = []
        self.subtotal: dict[str, BudgetFigure] = {}  # uncoded Mengurus/Pembangunan and their parts
        self.subtotal_kind: str | None = None
        self.current: BudgetVote | None = None
        self.summary: dict[str, BudgetFigure] = {}
        self.section: str = "votes"  # "votes", "charged summary", "grand summary"
        self.checks = 0
        self.rounded: list[str] = []
        self.notes: dict[str, str] = {}  # footnote mark -> text
        self.marked: list[str] = []  # footnote marks on the headings above the open block
        self.vote_marks: dict[
            str, str
        ] = {}  # vote code -> footnote mark  # totals off their parts by rounding, in the actual columns
        self.where = Citation(0, 0, 0, "")

    def fail(self, message: str) -> ParseError:
        return ParseError(self.where.pdf_page, self.where.line_no, self.where.text, message)

    def expect(self, label: str, printed: tuple[int, ...], parts: Sequence[tuple[int, ...]]) -> None:
        """A printed total against the sum of its printed parts.

        The two actual columns restate audited figures in sen, rounded to the ringgit. Budget
        2026 rounds every figure on its own, so a total can differ from the sum of its n
        rounded parts by up to 50 sen x (n + 1); such a difference is logged under
        ROUNDED_INDEPENDENTLY. The estimate columns are whole ringgit and must add exactly.
        """
        computed = _add(*parts)
        diffs = [p - c for p, c in zip(printed, computed, strict=True)]
        if label in self.known and tuple(diffs) == self.known[label]:
            self.misprints_seen.append(label)
            self.checks += 1
            return
        allowance = 50 * (len(parts) + 1)
        if any(diffs[2:]) or any(abs(d) > allowance for d in diffs[:2]):
            raise self.fail(f"{label}: printed minus computed is {diffs} sen per column")
        if any(diffs):
            self.rounded.append(f"{label}: {diffs[:2]} sen in the actual columns ({len(parts)} parts)")
        self.checks += 1

    def feed_page(self, page: PageText) -> None:
        lines = page.layout.split("\n")
        book_page = None
        for line in lines:
            m = _FOOTER.search(line)
            if m is not None and int(m["year"]) == self.budget_year and (m["left"] is None) != (m["right"] is None):
                book_page = int(m["left"] or m["right"])
        if book_page is None:
            raise ParseError(
                page.pdf_page, 1, "", "page has no 'ANGGARAN PERBELANJAAN PERSEKUTUAN <year> | <page>' footer"
            )
        in_note: str | None = None
        for i, line in enumerate(lines):
            text = " ".join(line.split())
            self.where = Citation(page.pdf_page, book_page, i + 1, text)
            if not text or text in _HEAD_LINES or _FOOTER.fullmatch(text):
                continue
            # Footnotes at the page foot ("1 B/P.23 - Nama Kementerian ... pada tahun 2023 adalah ..."),
            # wrapped onto following lines.
            if (m := _NOTE.fullmatch(text)) is not None:
                in_note = m["mark"]
                self.notes[in_note] = m["text"]
                continue
            if in_note is not None:
                self.notes[in_note] += " " + text
                continue
            words = text.split()
            if set(words) <= _HEAD_WORDS or all(re.fullmatch(r"20\d\d|RM", w) for w in words):
                continue
            label, values, _ = trailing_values(line.strip(), 4)
            if not values or len(values) == 1 and re.fullmatch(r"[^a-z]+", label) and values[0].hundredths < 1000:
                self.text(text)  # a heading, possibly ending in a footnote mark ("... ALAM 1")
            elif len(values) != 4 or any(v.marks or v.has_decimals for v in values):
                raise self.fail("expected four whole-ringgit amounts")
            else:
                self.row(
                    " ".join(label.split()),
                    (values[0].hundredths, values[1].hundredths, values[2].hundredths, values[3].hundredths),
                )

    def text(self, text: str) -> None:
        if self.current is not None or self.subtotal:
            raise self.fail("heading inside an open block")
        if (m := re.fullmatch(r"(?P<heading>[^a-z]+?) (?P<mark>\d)", text)) is not None:
            text = m["heading"]  # a ministry heading carrying a footnote mark ("... KELESTARIAN ALAM 1")
            self.marked.append(m["mark"])
        if text == "RINGKASAN MAKSUD TANGGUNGAN":
            self.section = "charged summary"
        elif text == "RINGKASAN KESELURUHAN":
            self.section = "grand summary"
        if text.isupper():
            self.group = []
        self.heading.append(text)

    def row(self, label: str, amounts: tuple[int, int, int, int]) -> None:
        figure = BudgetFigure(amounts, self.where)
        if (m := _VOTE.fullmatch(label)) is not None:
            code = f"{m['letter']}.{int(m['num']):02d}"
            if m["letter"] == "P" and m["kind"] == "Mengurus" or m["letter"] != "P" and m["kind"] != "Mengurus":
                raise self.fail(f"{code} printed as {m['kind']}")
            if any(v.code == code for v in self.votes):
                raise self.fail(f"{code} appears twice")
            self.close_vote()
            heading = " / ".join(h for h in self.heading if not h.startswith("RINGKASAN")) or code
            self.current = BudgetVote(code, heading, figure)
            if self.marked:
                self.vote_marks[code] = self.marked[-1]
            self.votes.append(self.current)
            if self.section != "grand summary":
                self.block.append(self.current)
                self.group.append(self.current)
            elif code != "P.70":
                raise self.fail(f"vote {code} inside the grand summary")
            else:
                self.summary["contingency"] = figure
            return
        if label in _PARTS:
            target = self.current.parts if self.current is not None else self.subtotal if self.subtotal_kind else None
            if target is None:
                target = self.summary if self.section == "grand summary" else None
            if target is None:
                raise self.fail(f"{label} with no total above it")
            key = _PARTS[label]
            if key in target:
                raise self.fail(f"second {label} line")
            target[key] = figure
            return
        if label in _SUBTOTAL:
            self.close_vote()
            kind = _SUBTOTAL[label]
            if self.section == "grand summary":
                self.summary[kind] = figure
                self.subtotal_kind = None
            else:
                self.close_subtotal()
                self.subtotal_kind = kind
                self.subtotal = {kind: figure}
            return
        if label.startswith("JUMLAH"):
            self.close_vote()
            self.close_subtotal()
            self.jumlah(label, figure)
            return
        raise self.fail(f"unknown line {label!r}")

    def close_vote(self) -> None:
        vote, self.current = self.current, None
        if vote is None:
            return
        if vote.code == "P.70":
            if vote.parts:
                raise self.fail("P.70 printed with parts")
            return
        names = ("emoluments", "other") if vote.operating else ("direct", "loan")
        if set(vote.parts) != set(names):
            raise self.fail(f"{vote.code} prints parts {sorted(vote.parts)}, expected {list(names)}")
        self.expect(f"{vote.code} parts", vote.total.amounts, [*(vote.parts[n].amounts for n in names)])

    def close_subtotal(self) -> None:
        """Check an uncoded Mengurus or Pembangunan subtotal against the block's votes."""
        if not self.subtotal_kind:
            return
        kind, self.subtotal_kind = self.subtotal_kind, None
        subtotal, self.subtotal = self.subtotal, {}
        operating = kind == "operating"
        # In "Ringkasan Maksud Tanggungan" the subtotal covers every charged (T) vote.
        scope = [v for v in self.votes if v.code.startswith("T.")] if self.section == "charged summary" else self.group
        votes = [v for v in scope if v.operating == operating]
        self.expect(f"block {kind} subtotal", subtotal[kind].amounts, [*(v.total.amounts for v in votes)])
        for part in ("emoluments", "other") if operating else ("direct", "loan"):
            if part not in subtotal:
                raise self.fail(f"block {kind} subtotal has no {part} line")
            self.expect(f"block {part} subtotal", subtotal[part].amounts, [*(v.parts[part].amounts for v in votes)])

    def jumlah(self, label: str, figure: BudgetFigure) -> None:
        if self.section == "grand summary":
            if label != "JUMLAH BESAR":
                raise self.fail(f"unexpected {label!r} in the grand summary")
            self.summary["grand_total"] = figure
            self.grand_summary()
        elif self.section == "charged summary":
            charged = [v for v in self.votes if v.code.startswith("T.")]
            self.expect(label, figure.amounts, [*(v.total.amounts for v in charged)])
            self.section = "votes"
        else:
            # "JUMLAH" closes the agency block; "JUMLAH KEMENTERIAN KEWANGAN" the ministry group.
            votes = self.block if label == "JUMLAH" else self.group
            if not votes:
                raise self.fail(f"{label} closes no votes")
            self.expect(
                f"{label} ({', '.join(v.code for v in votes)})", figure.amounts, [v.total.amounts for v in votes]
            )
        self.block, self.heading, self.marked = [], [], []

    def grand_summary(self) -> None:
        s = self.summary
        for key in ("operating", "emoluments", "other", "development", "direct", "loan", "contingency", "grand_total"):
            if key not in s:
                raise self.fail(f"grand summary has no {key} line")
        operating = [v for v in self.votes if v.operating]
        development = [v for v in self.votes if not v.operating and v.code != "P.70"]
        self.expect("Mengurus", s["operating"].amounts, [*(v.total.amounts for v in operating)])
        self.expect("Emolumen", s["emoluments"].amounts, [*(v.parts["emoluments"].amounts for v in operating)])
        self.expect("Lain", s["other"].amounts, [*(v.parts["other"].amounts for v in operating)])
        self.expect("Cara Langsung", s["direct"].amounts, [*(v.parts["direct"].amounts for v in development)])
        self.expect("Pinjaman", s["loan"].amounts, [*(v.parts["loan"].amounts for v in development)])
        # Against the vote figures themselves: each summary line is rounded from the exact sum
        # of every vote, so its rounding allowance must count the votes, not the lines above it.
        contingency = [v for v in self.votes if v.code == "P.70"]
        self.expect("Pembangunan", s["development"].amounts, [v.total.amounts for v in development + contingency])
        self.expect("JUMLAH BESAR", s["grand_total"].amounts, [v.total.amounts for v in self.votes])


def parse_budget_summary(
    pages: Sequence[PageText],
    budget_year: int,
    known_misprints: Sequence[tuple[str, tuple[int, int, int, int]]] = (),
) -> BudgetStatement:
    parser = _Parser(budget_year, known_misprints)
    for page in pages:
        parser.feed_page(page)
    for code, mark in parser.vote_marks.items():
        if mark not in parser.notes:
            raise ParseError(pages[-1].pdf_page, 0, "", f"{code} heading carries footnote {mark} with no note")
        next(v for v in parser.votes if v.code == code).note = parser.notes[mark]
    unused = set(parser.notes) - set(parser.vote_marks.values())
    if unused:
        raise ParseError(pages[-1].pdf_page, 0, "", f"footnotes {sorted(unused)} are on no heading")
    missing = {label for label, _ in known_misprints} - set(parser.misprints_seen)
    if missing:
        raise ParseError(pages[-1].pdf_page, 0, "", f"known misprints no longer occur: {sorted(missing)}")
    if "grand_total" not in parser.summary:
        raise ParseError(pages[-1].pdf_page, 0, "", "no JUMLAH BESAR")
    columns = (
        (budget_year - 3, "actual"),
        (budget_year - 2, "actual"),
        (budget_year - 1, "original_estimate"),
        (budget_year, "estimate"),
    )
    return BudgetStatement(
        budget_year, columns, tuple(parser.votes), BudgetSummary(parser.summary), parser.checks, tuple(parser.rounded)
    )
