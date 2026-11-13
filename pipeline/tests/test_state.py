from dataclasses import replace
from pathlib import Path

import pytest

from pipeline.state import (
    PageWords,
    RowName,
    StateParseError,
    TableSpec,
    Word,
    parse_amount,
    parse_bbox_words,
    parse_table,
)
from pipeline.state_load import COLUMNS, StateReconciliationError, _check_misprints
from pipeline.state_sources import STATE_GAPS, STATE_SOURCES, STATES, StateMisprint

FIXTURES = Path(__file__).parent / "fixtures" / "states"


def page(name: str, pdf_page: int) -> PageWords:
    return PageWords(pdf_page, tuple(parse_bbox_words((FIXTURES / f"{name}.xml").read_text())))


def sums(table, category=None):
    rows = [r for r in table.lines if category is None or r.category == category]
    return {c: sum(r.amounts.get(c) or 0 for r in rows) for c in COLUMNS if c in rows[0].amounts}


def test_amounts() -> None:
    assert parse_amount("1,234.56") == 123456
    assert parse_amount("(1,234.56)") == -123456
    assert parse_amount("0.00") == 0
    assert parse_amount("-") == 0
    assert parse_amount("1234.56") is None  # never printed without separators
    assert parse_amount("2024") is None
    assert parse_amount("(1,234.56") is None


def test_melaka_revenue_names_wrapped_around_their_amounts() -> None:
    spec = STATE_SOURCES[("melaka", 2023)].revenue
    table = parse_table([page("melaka-2023-p46", 46)], spec)
    names = [r.name for r in table.lines]
    assert names[5] == "Lesen, Bayaran Pendaftaran dan Permit"  # one line above its amounts, one below
    assert "Pulangan Balik Perbelanjaan" in names  # "Perbelanjaan" alone is a name line, not a column header
    assert len(table.lines) == 16
    [cukai] = [r for r in table.lines if r.name == "Cukai Tanah"]
    assert cukai.amounts == {
        "original": 11184059950,
        "revised": 11184059950,
        "actual": 9570012488,
        "prior_actual": 9076041334,
    }
    assert cukai.pdf_page == 46
    by_label = {t.label: t for t in table.totals}
    for total in table.totals:
        expected = sums(table, total.category)
        assert {c: v for c, v in total.amounts.items() if v is not None} == expected, total.label
    assert by_label["JUMLAH HASIL"].amounts["actual"] == 42751548037
    assert {r.category for r in table.lines} == {"hasil_cukai", "hasil_bukan_cukai", "terimaan_bukan_hasil"}


def test_melaka_transfer_row_prints_only_its_actual() -> None:
    spec = STATE_SOURCES[("melaka", 2023)].operating
    table = parse_table([page("melaka-2023-p47", 47), page("melaka-2023-p48", 48)], spec)
    [transfer] = table.transfers
    assert transfer.amounts == {"original": None, "revised": None, "actual": 3971000000}
    codes = [f"T{n:02}" for n in range(1, 5)] + [f"B{n:02}" for n in range(1, 22)]
    assert [r.code for r in table.lines] == codes  # the header repeated above the Bekalan votes is skipped
    after = [t for t in table.totals if t.scope == "statement_plus_transfer"]
    assert after[0].amounts == {"original": None, "revised": None, "actual": 44650046603}


def test_perak_bottom_wrap_and_row_name_fix() -> None:
    spec = STATE_SOURCES[("perak", 2024)].revenue
    table = parse_table([page("perak-2024-p32", 32)], spec)
    names = [r.name for r in table.lines]
    assert "Lesen, Bayaran Pendaftaran dan Permit" in names  # three lines, amounts on the last
    assert "Keuntungan Pembiayaan dan Perolehan Pelaburan" in names
    assert names[-4:-2] == ["Pemberian Pelancongan", "Pulangan Balik Perbelanjaan"]
    assert len(table.fixes) == 2
    for total in table.totals:
        assert {c: v for c, v in total.amounts.items() if v is not None} == sums(table, total.category)


def test_unused_row_name_fix_fails() -> None:
    spec = STATE_SOURCES[("perak", 2024)].revenue
    stale = replace(spec, row_names=(*spec.row_names, RowName(32, "No Such Row", "x", "test")))
    with pytest.raises(StateParseError, match="row name fix matches no row"):
        parse_table([page("perak-2024-p32", 32)], stale)


def words(*lines: tuple[float, list[tuple[float, float, str]]]) -> PageWords:
    out = []
    for y, cells in lines:
        for x0, x1, text in cells:
            out.append(Word(x0, y - 4, x1, y + 4, text))
    return PageWords(1, tuple(out))


SPEC = TableSpec(
    section="operating",
    pages=(1, 1),
    start=r"^START$",
    end=r"^Jumlah Semua",
    columns=("original", "actual"),
    amount_x=200,
    wrap="middle",
    code=r"S\d{2}",
    headings={"perbelanjaan bekalan": "bekalan"},
    totals={"jumlah semua": ("statement", None)},
)


def test_a_coded_row_starting_on_its_amounts_line_takes_no_name_from_above() -> None:
    # "daripada Kerajaan" sits exactly between two rows; S02 starts its name on its own line.
    table = parse_table(
        [
            words(
                (10, [(10, 40, "START")]),
                (20, [(10, 60, "PERBELANJAAN"), (62, 100, "BEKALAN")]),
                (30, [(10, 25, "S01"), (30, 80, "Terimaan"), (220, 260, "1.00"), (280, 320, "1.00")]),
                (40, [(30, 80, "daripada"), (82, 120, "Kerajaan")]),
                (50, [(10, 25, "S02"), (30, 80, "Lain"), (220, 260, "2.00"), (280, 320, "2.00")]),
                (60, [(10, 40, "Jumlah"), (42, 80, "Semua"), (220, 260, "3.00"), (280, 320, "3.00")]),
            )
        ],
        SPEC,
    )
    assert [(r.code, r.name) for r in table.lines] == [("S01", "Terimaan daripada Kerajaan"), ("S02", "Lain")]


def test_an_uncoded_line_equally_near_two_uncoded_rows_fails() -> None:
    with pytest.raises(StateParseError, match="equally near"):
        parse_table(
            [
                words(
                    (10, [(10, 40, "START")]),
                    (20, [(10, 60, "PERBELANJAAN"), (62, 100, "BEKALAN")]),
                    (30, [(30, 80, "Satu"), (220, 260, "1.00"), (280, 320, "1.00")]),
                    (40, [(30, 80, "Mana")]),
                    (50, [(30, 80, "Dua"), (220, 260, "2.00"), (280, 320, "2.00")]),
                    (60, [(10, 40, "Jumlah"), (42, 80, "Semua"), (220, 260, "3.00"), (280, 320, "3.00")]),
                )
            ],
            SPEC,
        )


def test_a_total_the_spec_does_not_name_fails() -> None:
    with pytest.raises(StateParseError, match="a total the table spec does not name"):
        parse_table(
            [
                words(
                    (10, [(10, 40, "START")]),
                    (20, [(10, 60, "PERBELANJAAN"), (62, 100, "BEKALAN")]),
                    (30, [(10, 25, "S01"), (30, 80, "Satu"), (220, 260, "1.00"), (280, 320, "1.00")]),
                    (40, [(10, 40, "Jumlah"), (42, 80, "Kecil"), (220, 260, "1.00"), (280, 320, "1.00")]),
                    (60, [(10, 40, "Jumlah"), (42, 80, "Semua"), (220, 260, "1.00"), (280, 320, "1.00")]),
                )
            ],
            SPEC,
        )


def test_misprints_are_accepted_exactly() -> None:
    source = STATE_SOURCES[("sabah", 2024)]
    [misprint] = source.known_misprints
    row = ("operating", misprint.label, 43, 0, -1000, 0, None)
    _check_misprints(source, [row])  # the registered difference passes
    with pytest.raises(StateReconciliationError, match="printed minus rows"):
        _check_misprints(source, [("operating", misprint.label, 43, 0, -2000, 0, None)])
    with pytest.raises(StateReconciliationError, match="not found"):
        _check_misprints(source, [])
    other = replace(source, known_misprints=())
    with pytest.raises(StateReconciliationError):
        _check_misprints(other, [row])
    assert isinstance(misprint, StateMisprint)


def test_registry() -> None:
    slugs = {s.slug for s in STATES}
    assert len(slugs) == 13
    for (state, year), source in STATE_SOURCES.items():
        assert source.state == state and source.fiscal_year == year
        assert source.raw_path == f"states/{state}/{year}.pdf"
        assert len(source.sha256) == 64
        assert source.revenue.section == "revenue" and source.operating.section == "operating"
    loaded = set(STATE_SOURCES)
    for gap in STATE_GAPS:
        assert gap.state in slugs
        assert (gap.state, gap.fiscal_year) not in loaded
    covered = {s for s, _ in loaded} | {g.state for g in STATE_GAPS}
    assert covered == slugs  # every state is either loaded or says why not
