"""A Lampiran 1 with a registered missing page (sources.KnownGap), FY2019.

The statement's English version, Attachment 1 ("Statement of Operating Expenditures"),
prints every vote's totals by object group. It supplies the vote totals that sit on the
missing page, and it checks the rest:

- every vote total Lampiran 1 prints equals the attachment's, column by column;
- every section total (and its object lines) equals the sum of its vote totals, and the
  statement total the sum of its section totals;
- a vote total that lost rows to the gap but whose programme totals are all printed
  equals the sum of those programme totals.

Totals that lose rows to the gap cannot be checked against their rows; the checks above
are the evidence that they were read right. Any disagreement stops the load.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, replace

from pipeline.model import OBJECT_GROUPS, Amounts, Citation, PrintedTotal, Scope, Section, Statement
from pipeline.parse import PageText, ParseError, _check_row, _split

_ENGLISH_OBJECTS = {
    "Emolument": "10000",
    "Emoluments": "10000",
    "Supplies and Services": "20000",
    "Assets": "30000",
    "Grants and Fixed Charges": "40000",
    "Other Expenditure": "50000",
    "Other Expenditures": "50000",
}
_VOTE = re.compile(r"(?P<code>[TB]\.\d{2}) (?P<name>.+)")
_OBJECT = re.compile(r"Total (?P<name>.+)")
_TOTAL = re.compile(r"TOTAL (?:FOR )?(?P<name>.+)")
Key = tuple[str, str | None]  # (vote, object code or None for all)


@dataclass(frozen=True)
class EnglishVoteTotals:
    totals: dict[Key, tuple[Amounts, Citation]]


def parse_english_vote_totals(pages: Sequence[PageText]) -> EnglishVoteTotals:
    """Each vote's 'Total <object>' lines and its 'TOTAL [FOR] <name>' line."""
    totals: dict[Key, tuple[Amounts, Citation]] = {}
    vote: str | None = None
    offsets: set[int] = set()
    for page in pages:
        # The attachment's slug numbers its own file ("BI.indd 7"); the page draws the book
        # page as the first bare number of its -raw text (PDF p335: 67), which must keep a
        # constant offset from the PDF page.
        numbers = [line for line in page.raw.split("\n") if re.fullmatch(r"\d{1,3}", line.strip())]
        if not numbers:
            raise ParseError(page.pdf_page, 1, "", "Attachment 1 page without a printed page number")
        book_page = int(numbers[0])
        offsets.add(page.pdf_page - book_page)
        if len(offsets) != 1:
            raise ParseError(page.pdf_page, 1, "", f"book page {book_page} breaks the page sequence")
        for i, line in enumerate(page.layout.split("\n")):
            row = _split(line.replace("!", " "), 4)
            label = row.label.lstrip("*").strip()
            if len(row.values) != 4:
                m = _VOTE.fullmatch(" ".join(line.split()))
                if m is not None and not row.values:
                    vote = m["code"]
                continue
            amounts, error, _ = _check_row(row.values)
            at = Citation(page.pdf_page, book_page, i + 1, line.strip())
            if error is not None:
                raise ParseError(page.pdf_page, i + 1, line, error)
            if vote is None:
                continue  # section and statement lines; Lampiran 1's own are checked against vote sums
            if (m := _OBJECT.fullmatch(label)) is not None and m["name"] in _ENGLISH_OBJECTS:
                key: Key = (vote, _ENGLISH_OBJECTS[m["name"]])
            elif _TOTAL.fullmatch(label) is not None:
                key, vote = (vote, None), None
            else:
                raise ParseError(page.pdf_page, i + 1, line, "row in Attachment 1 that is not a vote total")
            if key in totals:
                raise ParseError(page.pdf_page, i + 1, line, f"{key} printed twice")
            totals[key] = (amounts, at)
    for code in {v for v, _ in totals}:
        parts = [a for (v, o), (a, _) in totals.items() if v == code and o is not None]
        whole = totals.get((code, None))
        if whole is None or any(sum(getattr(p, f) for p in parts) != getattr(whole[0], f) for f in _COLUMNS):
            raise ParseError(pages[0].pdf_page, 1, "", f"Attachment 1: {code}'s object lines do not add to its total")
    return EnglishVoteTotals(totals)


_COLUMNS = ("original", "revised", "actual")


def _vector(a: Amounts) -> tuple[int, int, int]:
    return (a.original, a.revised, a.actual)


def _add(rows: Sequence[Amounts]) -> tuple[int, int, int]:
    return (sum(a.original for a in rows), sum(a.revised for a in rows), sum(a.actual for a in rows))


def fill_gap(statement: Statement, english: EnglishVoteTotals, gap_votes: set[str]) -> tuple[Statement, list[str]]:
    """Add the vote totals the gap removed from Lampiran 1 and check every total above the gap.

    Returns the statement with those totals added (cited to Attachment 1) and a log of checks.
    """
    printed = {(t.vote_code or "", t.object_code): t for t in statement.totals if t.scope is Scope.VOTE and t.vote_code}
    log: list[str] = []
    added: list[PrintedTotal] = []
    for vote in statement.votes:
        own = {k: t for k, t in printed.items() if k[0] == vote.code}
        theirs = {k: v for k, v in english.totals.items() if k[0] == vote.code}
        if not theirs:
            raise ParseError(vote.citation.pdf_page, vote.citation.line_no, vote.code, "vote not in Attachment 1")
        if own:
            if set(own) != set(theirs):
                raise ParseError(
                    0, 0, vote.code, f"object lines differ from Attachment 1: {sorted(own)} {sorted(theirs)}"
                )
            for key, total in own.items():
                if _vector(total.amounts) != _vector(theirs[key][0]):
                    raise ParseError(total.citation.pdf_page, total.citation.line_no, total.citation.text,
                                     f"{key} differs from Attachment 1 (pdf page {theirs[key][1].pdf_page})")  # fmt: skip
            continue
        if vote.code not in gap_votes:
            raise ParseError(vote.citation.pdf_page, vote.citation.line_no, vote.code, "vote total not printed")
        for (code, obj), (amounts, at) in theirs.items():
            total = PrintedTotal(Scope.VOTE, None, code, None, None, obj, amounts, None, at)
            added.append(total)
            printed[(code, obj)] = total
        log.append(f"{vote.code}: vote totals from Attachment 1, pdf page {next(iter(theirs.values()))[1].pdf_page}")
    compared = len({v for v, _ in printed} - {t.vote_code for t in added})
    log.append(f"{compared} votes' Lampiran 1 totals equal Attachment 1's, every object line and column")

    sections = {v.code: v.section for v in statement.votes}
    for t in statement.totals:
        if t.scope is Scope.SECTION:
            votes = [p.amounts for (v, o), p in printed.items() if sections[v] is t.section and o == t.object_code]
            parts = _add(votes)
            what = f"section {t.section} {t.object_code or 'all'}"
        elif t.scope is Scope.STATEMENT:
            secs = [s.amounts for s in statement.totals if s.scope is Scope.SECTION and s.object_code == t.object_code]
            parts = _add(secs)
            what = f"statement {t.object_code or 'all'}"
        else:
            continue
        if parts != _vector(t.amounts):
            raise ParseError(
                t.citation.pdf_page, t.citation.line_no, t.citation.text, f"{what} is not the sum below it"
            )
        log.append(f"{what} equals the sum of the totals below it")

    for code in gap_votes:
        programmes = [p for p in statement.programmes if p.vote_code == code]
        for obj in [None, *OBJECT_GROUPS]:
            mine = [t.amounts for t in statement.totals
                    if t.scope is Scope.PROGRAMME and t.vote_code == code and t.object_code == obj]  # fmt: skip
            whole = [t.amounts for t in statement.totals
                     if t.scope is Scope.PROGRAMME and t.vote_code == code and t.object_code is None]  # fmt: skip
            if len(whole) != len(programmes) or (code, obj) not in printed:
                continue  # a programme total is on the missing page: the vote cannot be summed
            if _add(mine) != _vector(printed[(code, obj)].amounts):
                raise ParseError(0, 0, code, f"{code} {obj or 'all'} is not the sum of its programme totals")
            log.append(f"{code} {obj or 'all'} equals the sum of its programme totals")
    return replace(statement, totals=statement.totals + tuple(added)), log


__all__ = ["EnglishVoteTotals", "Section", "fill_gap", "parse_english_vote_totals"]
