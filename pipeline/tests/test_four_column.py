"""The FY2016-2019 layout: four-column Lampiran 1, book pages from the printer slug, and the
named rules those statements need. Lines are copied from the FY2018 PDF (page and line named)."""

from functools import cache

import pytest

from pipeline.development import parse_development
from pipeline.model import DevelopmentStatement, Statement
from pipeline.parse import FOUR_COLUMNS, PageText, ParseError, _check_row, _fill_blank_cell, _split, slug_book_page
from pipeline.revenue import parse_revenue
from pipeline.sources import DEFAULT_RAW_DIR, SOURCES, ensure_pdf, extract_pages
from pipeline.parse import parse_statement

SOURCE = SOURCES[2018]


@cache
def operating() -> Statement:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    return parse_statement(extract_pages(pdf, SOURCE.operating_pages, SOURCE.crop), 2018, SOURCE.operating_columns)


@cache
def development() -> DevelopmentStatement:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    return parse_development(extract_pages(pdf, SOURCE.development_pages, SOURCE.crop), 2018, True)


def test_a_four_column_row_leaves_supplementary_and_virement_unknown() -> None:
    # PDF p80 line 26 (T.01 010100 Emolumen): Asal, Dipinda, Amaun, Prestasi.
    row = _split("10000 Emolumen        7,602,000          7,834,284     7,834,274.90          99.99", 4)
    amounts, error, percent_off = _check_row(row.values)
    assert (error, percent_off) == (None, None)
    assert (amounts.original, amounts.supplementary, amounts.virement) == (760_200_000, None, None)
    assert (amounts.revised, amounts.actual) == (783_428_400, 783_427_490)


def test_a_four_column_percent_must_carry_decimals() -> None:
    _, error, _ = _check_row(_split("10000 Emolumen   7,602,000   7,834,284   7,834,274.90   99", 4).values)
    assert error == "% column is not a 2-decimal percentage"


def test_an_empty_amaun_cell_is_placed_by_column_and_reads_as_zero() -> None:
    # PDF p113 lines 21-22 (B.10 081000): the 20000 row prints no Amaun.
    blank = _split("20000 Perkhidmatan dan Bekalan        3,300,000           –                              –", 4)
    full = _split("40000 Pemberian dan Kenaan Bayaran Tetap      –     3,300,000   2,475,000.00          75.00", 4)
    filled = _fill_blank_cell(blank, full, FOUR_COLUMNS)
    assert filled is not None
    row, missing = filled
    assert FOUR_COLUMNS.columns[missing] == "Amaun"
    assert [v.hundredths for v in row.values] == [330_000_000, 0, 0, 0]


def test_the_book_page_comes_from_the_slug_and_must_be_printed() -> None:
    slug = "6 WJD012552 Teks Lampiran 1-8 BM.indd 68 02/10/2019 8:35 PM"
    assert slug_book_page(PageText(80, "", f"68\nLAMPIRAN 1 - PERBELANJAAN MENGURUS\n30\n{slug}")) == 68
    with pytest.raises(ParseError, match="slug page 68 is not printed on the page"):
        slug_book_page(PageText(80, "", f"LAMPIRAN 1 - PERBELANJAAN MENGURUS\n30\n{slug}"))


def test_fy2018_lampiran_1_rules_fire_where_the_page_shows_them() -> None:
    statement = operating()
    fired = {(c.rule, c.citation.pdf_page) for c in statement.corrections}
    assert {
        ("SAMB_HEADING_OPENS", 168),  # B.32 040000 first printed as "(SAMB.)"
        ("PROGRAMME_TOTAL_CODE_MISPRINTED", 213),  # "Jumlah 100000" closes B.63 110000
        ("STRAY_GLYPH_IGNORED", 141),  # "99.94 b" and "u", not drawn
        ("BLANK_CELL_READ_AS_ZERO", 113),
    } <= fired
    assert all(line.amounts.supplementary is None and line.amounts.virement is None for line in statement.lines)


def test_fy2018_activity_notes_wrap_and_continue_under_one_vote() -> None:
    notes = {(t.vote_code, t.activity_code): t.footnote for t in operating().totals if t.activity_code and t.footnote}
    # PDF p92: the note wraps onto a second line.
    assert notes[("B.04", "040100")].endswith("telah dimasuk kira sebagai pendahuluan.")
    # PDF p97: the second note under "Nota:*B06" names no vote.
    assert notes[("B.06", "050600")].startswith("– Program/Aktiviti - 050600 - Peruntukan sebanyak RM 7,396,000")


def test_fy2018_lampiran_2_grouping_rules() -> None:
    statement = development()
    fired = {(c.rule, c.citation.pdf_page) for c in statement.corrections}
    assert {
        ("HEADING_WITHOUT_TOTAL", 220),  # P.10 "PERBADANAN KEMAJUAN NEGERI"
        ("SUBHEADING_NOT_TOTALLED", 236),  # P.28 "PROJEK KTMB"
        ("OWN_PROJECTS_TOTAL_IN_CAPITALS", 232),  # P.24's first "JUMLAH KEMENTERIAN ..."
        ("TITLE_CASE_HEADING", 242),  # P.43 "Kerajaan Tempatan"
        ("DUPLICATE_PROJECT_CODE", 224),  # P.21 90700, twice
    } <= fired
    p24 = [g.name for g in statement.groups if g.vote_code == "P.24"]
    assert p24[0] == "KEMENTERIAN PERDAGANGAN ANTARABANGSA DAN INDUSTRI (MITI)"
    p10 = [p for p in statement.projects if p.vote_code == "P.10"]
    assert p10 and all(p.group_ordinal is None for p in p10)
    names = {p.name for p in statement.projects if (p.vote_code, p.code) == ("P.21", "90700")}
    assert names == {"Majlis Latihan Pertanian Kebangsaan (NATC)", "Latihan Pertanian Kebangsaan"}


def test_fy2018_revenue_drops_the_doubled_text_layer() -> None:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    revenue = parse_revenue(extract_pages(pdf, SOURCE.revenue_pages), 2018, True)
    names = {i.name for i in revenue.items}
    assert {"Terimaan daripada Agensi-agensi Kerajaan", "Hasil Bukan Cukai Wilayah Persekutuan"} <= names
    assert [c.rule for c in revenue.corrections] == ["DOUBLED_TEXT_LAYER"] * 3
