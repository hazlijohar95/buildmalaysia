"""Parse the vote summary of a Word-typeset MOF budget book (Budget 2025).

Same content as `budget.py`'s summary, laid out differently:

    B. 6   Jabatan Perdana Menteri -          vote code and name, no amounts; names wrap
           Mengurus            a  b  c  d     B votes print their total; T votes do not
           Emolumen            ...            parts; a part that is zero may be left out
           Perbelanjaan-perbelanjaan Lain ...
    P. 6   Pembangunan         a  b  c  d     development votes print their total inline
           Cara Langsung / Pinjaman ...
           Jumlah ..           a  b  c  d     closes the block since the last Jumlah
           Jumlah Kementerian Kewangan ...    closes the ministry since its capitals heading
    Ringkasan Maksud Tanggungan               the charged votes' parts and total
    Ringkasan                                 the grand summary: operating parts and total,
                                              development parts, P. 70, total, JUMLAH BESAR

A T vote's total is the Jumlah of its own block. Every printed total is checked with the
same rounding allowance as `budget.py` (actual columns only; estimates exact).
"""

import re
from collections.abc import Sequence

from pipeline.budget import BudgetFigure, BudgetStatement, BudgetSummary, BudgetVote, _add
from pipeline.budget_detail import trailing_values
from pipeline.model import Citation
from pipeline.parse import PageText, ParseError

_FOOTER = re.compile(r"(?:\d+ \| )?ANGGARAN PERBELANJAAN PERSEKUTUAN (?P<year>\d{4})(?: \| (?P<page>\d+))?")
_LEADERS = re.compile(r"(?<!\S)\.{2,}(?!\S)")
_VOTE = re.compile(r"(?P<letter>[TBP])\. ?(?P<num>\d{1,2})\s+(?P<rest>.+)")
_PARTS = {
    "Emolumen": "emoluments",
    "Perbelanjaan-perbelanjaan Lain": "other",
    "Cara Langsung": "direct",
    "Pinjaman": "loan",
}
_NOTE = re.compile(r"(?P<mark>\d) (?P<text>(?:[TBP]|B/P)\.\d{1,2} - .+)")
_MARKED = re.compile(r"(?P<text>.*[A-Z]) (?P<mark>\d)")
_HEAD = {
    "RINGKASAN PERBELANJAAN SEBENAR DAN ANGGARAN MENGURUS",
    "DAN PEMBANGUNAN",
}


class _Parser:
    def __init__(self, budget_year: int, known_misprints: Sequence[tuple[str, tuple[int, ...]]] = ()) -> None:
        self.budget_year = budget_year
        self.known = dict(known_misprints)
        self.misprints_seen: list[str] = []
        self.votes: list[BudgetVote] = []
        self.current: BudgetVote | None = None
        self.naming: BudgetVote | None = None  # a vote whose wrapped name is still being read
        self.block: list[BudgetVote] = []
        self.group: list[BudgetVote] = []
        self.heading: str = ""
        self.section = "votes"  # "votes", "charged summary", "grand operating", "grand development", "done"
        self.summary_parts: dict[str, BudgetFigure] = {}
        self.summary: dict[str, BudgetFigure] = {}
        self.checks = 0
        self.rounded: list[str] = []
        self.sub_kind: str | None = None  # an uncoded Mengurus or Pembangunan subtotal being read
        self.notes: dict[str, str] = {}  # footnote mark -> text
        self.mark: str | None = None  # the footnote mark on the current ministry heading
        self.vote_marks: dict[str, str] = {}
        self.heading_open = False  # a heading line was just read and may continue
        self.sub: dict[str, BudgetFigure] = {}
        self.where = Citation(0, 0, 0, "")

    def fail(self, message: str) -> ParseError:
        return ParseError(self.where.pdf_page, self.where.line_no, self.where.text, message)

    def expect(self, label: str, printed: tuple[int, ...], parts: Sequence[tuple[int, ...]]) -> None:
        computed = _add(*parts)
        diffs = [p - c for p, c in zip(printed, computed, strict=True)]
        if self.known.get(label) == tuple(diffs):
            self.misprints_seen.append(label)
            self.checks += 1
            return
        if any(diffs[2:]) or any(abs(d) > 50 * (len(parts) + 1) for d in diffs[:2]):
            raise self.fail(f"{label}: printed minus computed is {diffs} sen per column")
        if any(diffs):
            self.rounded.append(f"{label}: {diffs[:2]} sen in the actual columns ({len(parts)} parts)")
        self.checks += 1

    def feed_page(self, page: PageText) -> None:
        texts = [" ".join(_LEADERS.sub(" ", line).split()) for line in page.layout.split("\n")]
        book_page = next((int(m["page"]) for t in texts if (m := _FOOTER.fullmatch(t)) and m["page"]), None)
        if book_page is None:
            book_page = next((int(t.split(" | ")[0]) for t in texts if _FOOTER.fullmatch(t) and t[:1].isdigit()), None)
        if book_page is None:
            raise ParseError(page.pdf_page, 1, "", "no book page in the footer")
        lines = page.layout.split("\n")
        in_note: str | None = None
        for i, text in enumerate(texts):
            self.where = Citation(page.pdf_page, book_page, i + 1, text)
            if not text or text in _HEAD or _FOOTER.fullmatch(text):
                continue
            # Footnotes at the page foot ("1 B/P.15 - Kementerian Ekonomi diwujudkan ..."), wrapped.
            if (m := _NOTE.fullmatch(text)) is not None:
                in_note = m["mark"]
                self.notes[in_note] = m["text"]
                continue
            if in_note is not None:
                self.notes[in_note] += " " + text
                continue
            # A footnote mark at the end of a heading or vote line ("KEMENTERIAN EKONOMI 1").
            if (m := _MARKED.fullmatch(text)) is not None:
                self.mark = m["mark"]
                if self.naming is not None:
                    self.vote_marks[self.naming.code] = m["mark"]  # on a vote's wrapped name (B. 33)
                text = m["text"]
                lines[i] = text
            words = set(text.split())
            if words <= {"Perbelanjaan", "Anggaran", "Maksud", "Sebenar", "Asal", "RM"} or all(
                re.fullmatch(r"20\d\d|RM", w) for w in words
            ):
                continue
            label, values, _ = trailing_values(_LEADERS.sub(" ", lines[i]).strip(), 4)
            label = " ".join(label.split())
            if values and len(values) != 4:
                raise self.fail("expected four amounts")
            amounts = tuple(v.hundredths for v in values)
            self.line(label, (amounts[0], amounts[1], amounts[2], amounts[3]) if values else None)

    def line(self, label: str, amounts: tuple[int, int, int, int] | None) -> None:
        figure = BudgetFigure(amounts, self.where) if amounts else None
        if label == "Ringkasan Maksud Tanggungan":
            self.close_vote()
            self.section, self.summary_parts = "charged summary", {}
            return
        if label == "Ringkasan":
            self.close_vote()
            self.section = "grand"
            return
        if label in ("Perbelanjaan Mengurus -", "Perbelanjaan Pembangunan -") and figure is None:
            self.section, self.summary_parts = ("grand operating" if "Mengurus" in label else "grand development"), {}
            return
        if (m := _VOTE.fullmatch(label)) is not None:
            self.vote_line(m, figure)
            return
        if self.naming is not None and figure is None:
            self.naming.heading += " " + label.removesuffix(" -").strip()
            if label.endswith("-"):
                self.naming = None
            return
        if label in ("Mengurus", "Pembangunan") and figure is not None and self.current is None:
            self.close_subtotal()  # a ministry-wide subtotal over the votes since its heading
            self.sub_kind, self.sub = ("operating" if label == "Mengurus" else "development"), {"total": figure}
            return
        if label in _PARTS and figure is not None and self.sub_kind is not None:
            self.sub[_PARTS[label]] = figure
            return
        if label in _PARTS and figure is not None:
            target = self.current.parts if self.current is not None else self.summary_parts
            if self.current is None and not self.section.startswith(("charged", "grand")):
                raise self.fail(f"{label} with no vote above it")
            target[_PARTS[label]] = figure
            return
        if label == "Mengurus" and figure is not None:
            if self.current is None or not self.current.operating:
                raise self.fail("Mengurus with no operating vote above it")
            self.current.total = figure
            self.current.total_printed = True
            return
        if label.startswith(("Jumlah", "JUMLAH")) and figure is not None:
            self.close_vote()
            self.close_subtotal()
            self.jumlah(label, figure)
            return
        if figure is None:
            if label.isupper():
                self.close_vote()
                if self.heading_open:
                    self.heading += " " + label  # a heading wrapped over two lines
                else:
                    self.heading, self.group, self.heading_open = label, [], True
            return  # the wrapped end of a "Jumlah <ministry>" label
        raise self.fail(f"unknown line {label!r}")

    def vote_line(self, m: re.Match[str], figure: BudgetFigure | None) -> None:
        self.close_vote()
        self.heading_open = False
        name = m["rest"].removesuffix(" -").strip()
        if m["letter"] == "B" and name.isupper():
            self.heading, self.group = name, []  # the vote line doubles as the ministry heading (B. 32)
        code = f"{m['letter']}.{int(m['num']):02d}"
        rest = m["rest"]
        if any(v.code == code for v in self.votes):
            raise self.fail(f"{code} appears twice")
        if m["letter"] == "P":
            if figure is None:
                raise self.fail(f"{code} printed without amounts")
            name = self.heading or rest
            vote = BudgetVote(code, name, figure)
            if code == "P.70":
                self.summary["contingency"] = figure
        else:
            if figure is not None:
                raise self.fail(f"{code} printed with amounts on its name line")
            placeholder = BudgetFigure((0, 0, 0, 0), self.where)
            vote = BudgetVote(code, rest.removesuffix(" -").strip(), placeholder)
            vote.total_printed = False
            if not rest.endswith("-"):
                self.naming = vote
        if self.mark is not None:
            self.vote_marks[code] = self.mark
        self.votes.append(vote)
        if code != "P.70":
            self.block.append(vote)
            self.group.append(vote)
        self.current = vote

    def close_vote(self) -> None:
        self.naming = None
        vote, self.current = self.current, None
        if vote is None or vote.code == "P.70":
            return
        if not vote.total_printed:
            return  # a T vote: its total is its block's Jumlah, checked then
        self.check_parts(vote)

    def close_subtotal(self) -> None:
        kind, self.sub_kind = self.sub_kind, None
        if kind is None:
            return
        operating = kind == "operating"
        votes = [v for v in self.group if v.operating == operating]
        self.expect(f"ministry {kind} subtotal", self.sub["total"].amounts, [v.total.amounts for v in votes])
        for part in ("emoluments", "other") if operating else ("direct", "loan"):
            if part in self.sub:
                self.expect(f"ministry {part} subtotal", self.sub[part].amounts, [v.parts[part].amounts for v in votes])

    def check_parts(self, vote: BudgetVote) -> None:
        names = ("emoluments", "other") if vote.operating else ("direct", "loan")
        zero = BudgetFigure((0, 0, 0, 0), vote.total.citation)
        for name in names:
            vote.parts.setdefault(name, zero)  # a part that is zero may be left out
        self.expect(f"{vote.code} parts", vote.total.amounts, [vote.parts[n].amounts for n in names])

    def jumlah(self, label: str, figure: BudgetFigure) -> None:
        if self.section == "charged summary":
            charged = [v for v in self.votes if v.code.startswith("T.")]
            self.expect(label, figure.amounts, [v.total.amounts for v in charged])
            for part in ("emoluments", "other"):
                self.expect(
                    f"charged {part}", self.summary_parts[part].amounts, [v.parts[part].amounts for v in charged]
                )
            self.section = "votes"
            return
        if self.section == "grand operating":
            self.summary["operating"] = figure
            for part in ("emoluments", "other"):
                self.summary[part] = self.summary_parts[part]
            return
        if self.section == "grand development":
            self.summary["development"] = figure
            for part in ("direct", "loan"):
                self.summary[part] = self.summary_parts[part]
            self.section = "grand total"
            return
        if self.section == "grand total":
            self.summary["grand_total"] = figure
            self.grand_summary()
            self.section = "done"
            return
        if label in ("Jumlah", "Jumlah .."):
            untotalled = [v for v in self.block if not v.total_printed]
            if untotalled:
                if len(self.block) != 1:
                    raise self.fail(f"{label} closes a block of {len(self.block)} votes, one without a total")
                vote = untotalled[0]
                vote.total = figure
                vote.total_printed = True
                self.check_parts(vote)
            self.expect(
                f"Jumlah ({', '.join(v.code for v in self.block)})",
                figure.amounts,
                [v.total.amounts for v in self.block],
            )
        else:
            self.expect(
                f"{label} ({', '.join(v.code for v in self.group)})",
                figure.amounts,
                [v.total.amounts for v in self.group],
            )
            self.group = []  # a ministry's named Jumlah closes the ministry
        self.block = []
        self.mark = None  # a Jumlah ends the reach of a heading's footnote mark
        self.heading_open = False

    def grand_summary(self) -> None:
        s = self.summary
        operating = [v for v in self.votes if v.operating]
        development = [v for v in self.votes if not v.operating and v.code != "P.70"]
        contingency = [v for v in self.votes if v.code == "P.70"]
        self.expect("Mengurus", s["operating"].amounts, [v.total.amounts for v in operating])
        self.expect("Emolumen", s["emoluments"].amounts, [v.parts["emoluments"].amounts for v in operating])
        self.expect("Lain", s["other"].amounts, [v.parts["other"].amounts for v in operating])
        self.expect("Cara Langsung", s["direct"].amounts, [v.parts["direct"].amounts for v in development])
        self.expect("Pinjaman", s["loan"].amounts, [v.parts["loan"].amounts for v in development])
        self.expect("Pembangunan", s["development"].amounts, [v.total.amounts for v in development + contingency])
        self.expect("JUMLAH BESAR", s["grand_total"].amounts, [v.total.amounts for v in self.votes])


def parse_budget_summary_word(
    pages: Sequence[PageText], budget_year: int, known_misprints: Sequence[tuple[str, tuple[int, ...]]] = ()
) -> BudgetStatement:
    parser = _Parser(budget_year, known_misprints)
    for page in pages:
        parser.feed_page(page)
    parser.close_vote()
    for vote in parser.votes:
        if not vote.total_printed:
            raise ParseError(pages[-1].pdf_page, 0, "", f"{vote.code} never received a total")
    if "grand_total" not in parser.summary:
        raise ParseError(pages[-1].pdf_page, 0, "", "no JUMLAH BESAR")
    missing = {k for k, _ in known_misprints if not k.startswith("Lampiran")} - set(parser.misprints_seen)
    if missing:
        raise ParseError(pages[-1].pdf_page, 0, "", f"known misprints no longer occur: {sorted(missing)}")
    for code, mark in parser.vote_marks.items():
        if mark not in parser.notes:
            raise ParseError(pages[-1].pdf_page, 0, "", f"{code} carries footnote {mark} with no note")
        next(v for v in parser.votes if v.code == code).note = parser.notes[mark]
    unused = set(parser.notes) - set(parser.vote_marks.values())
    if unused:
        raise ParseError(pages[-1].pdf_page, 0, "", f"footnotes {sorted(unused)} are on no vote")
    columns = (
        (budget_year - 3, "actual"),
        (budget_year - 2, "actual"),
        (budget_year - 1, "original_estimate"),
        (budget_year, "estimate"),
    )
    return BudgetStatement(
        budget_year,
        columns,
        tuple(parser.votes),
        BudgetSummary(parser.summary),
        parser.checks,
        tuple(parser.rounded),
    )
