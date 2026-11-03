"""Classifier and state machine on fixtures copied from the FY2025 PDF (see fixtures/build.py)."""

from pathlib import Path

import pytest

from pipeline.model import Scope, Statement
from pipeline.parse import PageText, ParseError, parse_statement

FIXTURES = Path(__file__).parent / "fixtures"
P105 = (FIXTURES / "janm2025_p105.layout.txt").read_text()
P106 = (FIXTURES / "janm2025_p106.layout.txt").read_text()
CLOSING = (FIXTURES / "janm2025_closing.layout.txt").read_text()
CLOSING_RAW = (FIXTURES / "janm2025_closing.raw.txt").read_text()

T01_EMOLUMEN = "10000 Emolumen                                   7,602,000"


def parse(p105: str = P105, p106: str = P106, closing: str = CLOSING) -> Statement:
    pages = [PageText(105, p105, ""), PageText(106, p106, ""), PageText(211, closing, CLOSING_RAW)]
    return parse_statement(pages, 2025)


def edit_line(text: str, starts_with: str, old: str, new: str) -> tuple[str, int]:
    """Replace `old` in the first line whose stripped text starts with `starts_with`; return text and line number."""
    lines = text.split("\n")
    index = next(i for i, line in enumerate(lines) if line.strip().startswith(starts_with))
    assert old in lines[index]
    lines[index] = lines[index].replace(old, new, 1)
    return "\n".join(lines), index + 1


def test_fixture_statement_parses() -> None:
    statement = parse()
    assert [v.code for v in statement.votes] == ["T.01", "T.02", "T.03", "T.04", "T.05", "T.06", "T.07", "B.64"]
    assert len(statement.lines) == 34


def test_wrapped_vote_total_takes_amounts_between_the_name_halves() -> None:
    statement = parse()
    t01 = next(v for v in statement.votes if v.code == "T.01")
    assert t01.name == "PERUNTUKAN DIRAJA BAGI S.P.B. YANG DI-PERTUAN AGONG"
    total = next(t for t in statement.totals if t.scope is Scope.VOTE and t.vote_code == "T.01" and not t.object_code)
    assert total.amounts.revised == 1_353_300_000
    assert total.amounts.actual == 1_353_277_240
    assert total.citation.pdf_page == 105
    assert total.citation.text.split("\n")[0] == "JUMLAH PERUNTUKAN DIRAJA BAGI"
    assert total.citation.text.split("\n")[2] == "S.P.B. YANG DI-PERTUAN AGONG"

    t03 = next(t for t in statement.totals if t.scope is Scope.VOTE and t.vote_code == "T.03" and not t.object_code)
    assert t03.amounts.actual == 11_478_059_080
    assert t03.citation.pdf_page == 106


def test_samb_continuation_resumes_the_open_vote_and_programme() -> None:
    statement = parse()
    assert [v.code for v in statement.votes].count("T.03") == 1
    assert [p.code for p in statement.programmes if p.vote_code == "T.03"] == ["010000", "020000", "030000"]
    programme_030000 = [
        t
        for t in statement.totals
        if t.scope is Scope.PROGRAMME and (t.vote_code, t.programme_code) == ("T.03", "030000")
    ]
    assert [(t.object_code, t.citation.pdf_page) for t in programme_030000] == [
        ("10000", 106),
        ("20000", 106),
        ("30000", 106),
        ("40000", 106),
        (None, 106),
    ]
    activity_030100 = next(t for t in statement.totals if t.scope is Scope.ACTIVITY and t.activity_code == "030100")
    assert activity_030100.citation.pdf_page == 105


def test_parenthesised_amount_is_negative() -> None:
    line = next(
        line
        for line in parse().lines
        if (line.vote_code, line.activity_code, line.object_code) == ("T.01", "010100", "20000")
    )
    assert line.amounts.virement == -12_150_000
    assert line.amounts.revised == 548_950_000
    assert line.amounts.actual == 548_943_046
    assert (line.citation.pdf_page, line.citation.book_page) == (105, 91)


def test_footnote_marker_attaches_the_note_text() -> None:
    statement = parse()
    marked = [t for t in statement.totals if t.footnote]
    assert len(marked) == 1
    assert (marked[0].scope, marked[0].object_code) == (Scope.STATEMENT, "40000")
    assert marked[0].amounts.actual == 19_037_476_880_374
    assert marked[0].footnote == "(*) Termasuk pindahan ke Kumpulan Wang Pembangunan sebanyak RM5,293,447,361.93"
    assert statement.unreferenced_notes == ("(**) Tidak termasuk pindahan ke Kumpulan Wang Pembangunan.",)


def test_named_rules_are_applied_and_recorded() -> None:
    statement = parse()
    assert sorted((c.citation.pdf_page, c.citation.line_no, c.rule) for c in statement.corrections) == [
        (211, 25, "BLANK_CELL_READ_AS_ZERO"),
        (211, 33, "ACTIVITY_CODE_LEADING_ZERO_DROPPED"),
        (211, 41, "STRAY_BACKTICK_IGNORED"),
        (211, 47, "OBJECT_CODE_EXTRA_LEADING_ZERO"),
        (211, 49, "ACTIVITY_CODE_LEADING_ZERO_DROPPED"),
    ]
    leaves = {(line.activity_code, line.object_code): line for line in statement.lines if line.vote_code == "B.64"}
    blank = leaves["010500", "40000"].amounts
    assert (blank.original, blank.supplementary, blank.virement, blank.revised) == (
        60_000_000_000,
        0,
        0,
        60_000_000_000,
    )
    assert ("020600", "40000") in leaves and ("050200", "20000") in leaves and ("050100", "10000") in leaves
    assert leaves["020700", "40000"].amounts.original == 3_470_000_000


def test_unclassifiable_line_fails_with_page_and_line() -> None:
    lines = P105.split("\n")
    index = next(i for i, line in enumerate(lines) if line.strip().startswith(T01_EMOLUMEN))
    lines.insert(index + 1, " Catatan tidak dikenali")
    with pytest.raises(ParseError, match="unclassified line") as error:
        parse(p105="\n".join(lines))
    assert (error.value.pdf_page, error.value.line_no) == (105, index + 2)


def test_row_arithmetic_error_fails_with_page_and_line() -> None:
    p105, line_no = edit_line(P105, T01_EMOLUMEN, "7,601,986.15", "7,601,986.16")
    with pytest.raises(ParseError, match="Varian prints") as error:
        parse(p105=p105)
    assert (error.value.pdf_page, error.value.line_no) == (105, line_no)


def test_percent_never_rounds_up_to_100_when_not_fully_spent() -> None:
    p105, line_no = edit_line(P105, T01_EMOLUMEN, "99.99", "100.00")  # 7,601,986.15 / 7,602,000 = 99.9998%
    with pytest.raises(ParseError, match="% Prestasi prints 100.00; the rule gives 99.99") as error:
        parse(p105=p105)
    assert error.value.line_no == line_no


def test_duplicate_leaf_fails() -> None:
    lines = P105.split("\n")
    index = next(i for i, line in enumerate(lines) if line.strip().startswith(T01_EMOLUMEN))
    lines.insert(index + 1, lines[index])
    with pytest.raises(ParseError, match="duplicate leaf"):
        parse(p105="\n".join(lines))


def test_vote_total_label_must_match_the_vote() -> None:
    lines = P105.split("\n")
    index = max(i for i, line in enumerate(lines) if line.strip() == "S.P.B. YANG DI-PERTUAN AGONG")
    lines[index] = lines[index].replace("AGONG", "AGUNG")
    with pytest.raises(ParseError, match="vote total label does not match vote T.01"):
        parse(p105="\n".join(lines))


def test_row_missing_two_columns_fails() -> None:
    closing, line_no = edit_line(
        CLOSING, "40000 Pemberian dan Kenaan Bayaran Tetap         600,000,000      ", "–  ", ""
    )
    with pytest.raises(ParseError, match="holds an amount but not the seven numeric columns") as error:
        parse(closing=closing)
    assert error.value.line_no == line_no
