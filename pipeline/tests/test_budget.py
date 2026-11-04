"""MOF Budget 2027 vote summary: parse, load, and compare with the audited statements."""

import os
from dataclasses import replace

import psycopg
import pytest

from pipeline.budget import parse_budget_summary
from pipeline.budget_word import parse_budget_summary_word
from pipeline.budget_detail import parse_operating_estimates
from pipeline.budget_development import parse_development_estimates, parse_dropped_projects
from pipeline.development import parse_development
from pipeline.load import load_budget, load_year
from pipeline.parse import PageText, ParseError, parse_statement
from pipeline.revenue import parse_revenue
from pipeline.sources import (
    BUDGET_SOURCES,
    DEFAULT_RAW_DIR,
    SOURCES,
    SourceError,
    ensure_pdf,
    extract_pages,
    page_count,
    retrieved_at,
)

DATABASE_URL = os.environ.get("PIPELINE_DATABASE_URL", "postgresql:///buildmalaysia_pipeline")
SOURCE = BUDGET_SOURCES[2027]


@pytest.fixture(scope="module")
def pages() -> list[PageText]:
    return extract_pages(ensure_pdf(SOURCE, DEFAULT_RAW_DIR), SOURCE.summary_pages)


def test_every_printed_total_in_the_summary_is_checked(pages: list[PageText]) -> None:
    statement = parse_budget_summary(pages, 2027)
    assert len(statement.votes) == 83
    assert statement.checks == 153
    grand = statement.summary.lines["grand_total"].amounts
    # Book p.33, JUMLAH BESAR: 2024 and 2025 actual, 2026 original estimate, 2027 estimate.
    assert grand == (40_862_924_471_200, 41_798_978_908_200, 42_120_200_000_000, 46_184_000_000_000)


@pytest.mark.parametrize(
    ("old", "new"),
    [
        # T.1 Emolumen. Estimates are whole ringgit and must add exactly: one ringgit fails.
        ("7,602,000     7,602,000", "7,602,000     7,602,001"),
        # Actuals may be off their parts by rounding (at most RM1.50 for two parts); RM5 fails.
        ("7,601,986        7,602,000", "7,601,991        7,602,000"),
    ],
)
def test_an_edit_to_a_vote_part_beyond_rounding_is_rejected(pages: list[PageText], old: str, new: str) -> None:
    page = pages[0]
    edited = page.layout.replace(old, new, 1)
    assert edited != page.layout
    with pytest.raises(ParseError, match="T.01 parts"):
        parse_budget_summary([replace(page, layout=edited), *pages[1:]], 2027)


def test_mof_actuals_agree_with_the_audited_statements(pages: list[PageText]) -> None:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    statement = parse_budget_summary(pages, 2027)
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        for year in (2024, 2025):  # the audited years this budget restates
            if conn.execute("select 1 from federal_spending where fiscal_year = %s", (year,)).fetchone() is None:
                source = SOURCES[year]
                janm = ensure_pdf(source, DEFAULT_RAW_DIR)
                load_year(
                    conn,
                    source,
                    parse_statement(extract_pages(janm, source.operating_pages), year),
                    parse_development(extract_pages(janm, source.development_pages), year),
                    parse_revenue(extract_pages(janm, source.revenue_pages), year),
                    page_count(janm),
                    retrieved_at(janm),
                )
        result = load_budget(conn, SOURCE, statement, page_count(pdf), retrieved_at(pdf))
        assert set(result.actual_checks) <= {"matches", "rounding"}
        assert sum(result.actual_checks.values()) == 272
        worst = conn.execute(
            "select max(abs(diff_sen)) from budget_actual_check where document_id = %s", (SOURCE.id,)
        ).fetchone()
        assert worst is not None and worst[0] <= 1000


@pytest.fixture(scope="module")
def book() -> list[PageText]:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    return extract_pages(pdf, (SOURCE.summary_pages[1] + 1, SOURCE.page_count))


def test_operating_estimates_reconcile_and_agree_with_the_summary(pages: list[PageText], book: list[PageText]) -> None:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    operating = parse_operating_estimates(book, 2027)
    assert len(operating.votes) == 53
    assert sum(len(v.headings) for v in operating.votes) == 1336  # 245 programmes, 1,091 activities
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        result = load_budget(
            conn, SOURCE, parse_budget_summary(pages, 2027), page_count(pdf), retrieved_at(pdf), operating
        )
        assert (result.operating_lines, result.operating_totals_reconciled) == (2231, 2354)


def test_a_one_ringgit_edit_to_an_activity_line_is_rejected(pages: list[PageText], book: list[PageText]) -> None:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    # B.3 (book p.87): 010100 Pengurusan Am, 10000 Emolumen, 2027 estimate 18,777,100.
    index = next(i for i, p in enumerate(book) if "18,956,800      18,777,100" in p.layout)
    edited = book[index].layout.replace("18,956,800      18,777,100", "18,956,800      18,777,101", 1)
    altered = [*book[:index], replace(book[index], layout=edited), *book[index + 1 :]]
    operating = parse_operating_estimates(altered, 2027)
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        with pytest.raises(SourceError, match="do not reconcile"):
            load_budget(conn, SOURCE, parse_budget_summary(pages, 2027), page_count(pdf), retrieved_at(pdf), operating)
        stored = conn.execute(
            "select estimate_sen from budget_operating_line where document_id = %s"
            " and (vote_code, activity_code, object_code) = ('B.03', '010100', '10000')",
            (SOURCE.id,),
        ).fetchone()
        assert stored == (1_877_710_000,)


def test_development_estimates_reconcile_with_tables_appendix_and_summary(
    pages: list[PageText], book: list[PageText]
) -> None:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    development = parse_development_estimates(book, 2027)
    assert (len(development.votes), sum(len(v.projects) for v in development.votes)) == (30, 645)
    assert development.appendix_checks == 31  # 30 vote rows of Lampiran D and its total
    assert development.contingency == 200_000_000_000  # P.70, RM2 bn
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        result = load_budget(
            conn,
            SOURCE,
            parse_budget_summary(pages, 2027),
            page_count(pdf),
            retrieved_at(pdf),
            parse_operating_estimates(book, 2027),
            development,
        )
        assert (result.development_projects, result.development_totals_reconciled) == (645, 85)


def test_lampiran_d_disagreeing_with_a_vote_table_is_rejected(book: list[PageText]) -> None:
    index = next(i for i, p in enumerate(book) if "RINGKASAN ANGGARAN PERBELANJAAN PEMBANGUNAN TAHUN" in p.layout)
    edited = book[index].layout.replace(
        "5,753,683,900               0    5,753,683,900", "5,753,683,901               0    5,753,683,901", 1
    )
    assert edited != book[index].layout
    altered = [*book[:index], replace(book[index], layout=edited), *book[index + 1 :]]
    with pytest.raises(ParseError, match="Lampiran D"):
        parse_development_estimates(altered, 2027)


def test_budget_2026_restates_the_audited_years_and_the_2025_original_estimate() -> None:
    source = BUDGET_SOURCES[2026]
    pdf = ensure_pdf(source, DEFAULT_RAW_DIR)
    summary = parse_budget_summary(extract_pages(pdf, source.summary_pages), 2026, source.known_misprints)
    assert (len(summary.votes), summary.checks) == (83, 153)
    # Budget 2026 rounds each figure on its own: 19 totals are a ringgit or two off their parts.
    assert len(summary.rounding) == 19
    notes = {v.code: v.note for v in summary.votes if v.note}
    assert set(notes) == {"B.23", "P.23", "B.33", "P.33", "B.47", "P.47", "B.50", "P.50"}
    book = extract_pages(pdf, (source.summary_pages[1] + 1, source.page_count))
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        if conn.execute("select 1 from federal_spending where fiscal_year = 2025").fetchone() is None:
            janm = SOURCES[2025]
            janm_pdf = ensure_pdf(janm, DEFAULT_RAW_DIR)
            load_year(
                conn,
                janm,
                parse_statement(extract_pages(janm_pdf, janm.operating_pages), 2025),
                parse_development(extract_pages(janm_pdf, janm.development_pages), 2025),
                parse_revenue(extract_pages(janm_pdf, janm.revenue_pages), 2025),
                page_count(janm_pdf),
                retrieved_at(janm_pdf),
            )
        result = load_budget(
            conn,
            source,
            summary,
            page_count(pdf),
            retrieved_at(pdf),
            parse_operating_estimates(book, 2026),
            parse_development_estimates(book, 2026),
        )
        assert (result.operating_lines, result.operating_totals_reconciled) == (2270, 2482)
        assert (result.development_projects, result.development_totals_reconciled) == (640, 86)
        original = conn.execute(
            "select count(*), count(*) filter (where matches) from budget_original_check"
            " where document_id = %s and fiscal_year = 2025",
            (source.id,),
        ).fetchone()
        assert original == (53, 53)


@pytest.mark.parametrize(
    ("year", "projects", "allocation", "repeated"),
    [
        # Book p.574: JUMLAH 2,661,176,542 / 243,403,849 / 264,620,300.
        (2027, 32, 26_462_030_000, []),
        # Book p.571 prints P.24 00200 twice and counts it twice in its JUMLAH (987,416,473).
        (2026, 84, 98_741_647_300, [("P.24", "00200", 2)]),
    ],
)
def test_dropped_projects_total_and_duplicates(
    year: int, projects: int, allocation: int, repeated: list[tuple[str, str, int]]
) -> None:
    source = BUDGET_SOURCES[year]
    pdf = ensure_pdf(source, DEFAULT_RAW_DIR)
    dropped = parse_dropped_projects(extract_pages(pdf, (source.summary_pages[1] + 1, source.page_count)))
    assert dropped is not None
    assert len(dropped.projects) == projects
    assert dropped.total[2] == allocation  # the printed JUMLAH, duplicates included
    assert [(p.vote_code, p.code, p.printed_times) for p in dropped.projects if p.printed_times > 1] == repeated


def test_budget_2025_word_layout_loads_and_restates_2024_by_ministry() -> None:
    source = BUDGET_SOURCES[2025]
    pdf = ensure_pdf(source, DEFAULT_RAW_DIR)
    summary = parse_budget_summary_word(extract_pages(pdf, source.summary_pages), 2025, source.known_misprints)
    assert (len(summary.votes), summary.checks) == (85, 155)  # includes B.32 / P.32, dissolved in 2023
    assert summary.summary.lines["grand_total"].amounts[3] == 42_300_000_000_000  # Budget 2025: RM423 bn
    names = {v.code: v.heading for v in summary.votes}
    # Book p.28: B. 33's name wraps onto a second line, and P. 33 takes it; P. 70 names itself.
    assert names["P.33"] == names["B.33"] == "KEMENTERIAN PERALIHAN TENAGA DAN TRANSFORMASI AIR"
    assert names["P.70"] == "Simpanan Luar Jangka"
    book = extract_pages(pdf, (source.summary_pages[1] + 1, source.page_count))
    development = parse_development_estimates(book, 2025, source.known_misprints)
    dropped = parse_dropped_projects(book)
    assert dropped is not None
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        if conn.execute("select 1 from federal_spending where fiscal_year = 2024").fetchone() is None:
            janm = SOURCES[2024]
            janm_pdf = ensure_pdf(janm, DEFAULT_RAW_DIR)
            load_year(
                conn,
                janm,
                parse_statement(extract_pages(janm_pdf, janm.operating_pages), 2024),
                parse_development(extract_pages(janm_pdf, janm.development_pages), 2024),
                parse_revenue(extract_pages(janm_pdf, janm.revenue_pages), 2024),
                page_count(janm_pdf),
                retrieved_at(janm_pdf),
            )
        result = load_budget(
            conn,
            source,
            summary,
            page_count(pdf),
            retrieved_at(pdf),
            parse_operating_estimates(book, 2025),
            development,
            dropped,
        )
        assert (result.operating_lines, result.operating_totals_reconciled) == (2256, 2488)
        assert (result.development_projects, result.development_totals_reconciled, result.dropped_projects) == (
            683,
            86,
            54,
        )
        # 2024 original estimate: 42 of 53 operating votes equal JANM's Asal; the other 11
        # differences net to zero (money moved between ministries, e.g. B.23 -> B.33).
        row = conn.execute(
            "select count(*), count(*) filter (where matches), sum(diff_sen) from budget_original_check"
            " where document_id = %s",
            (source.id,),
        ).fetchone()
        assert row == (53, 42, 0)
