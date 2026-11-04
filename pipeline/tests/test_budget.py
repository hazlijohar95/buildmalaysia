"""MOF Budget 2027 vote summary: parse, load, and compare with the audited statements."""

import os
from dataclasses import replace

import psycopg
import pytest

from pipeline.budget import parse_budget_summary
from pipeline.budget_detail import parse_operating_estimates
from pipeline.development import parse_development
from pipeline.load import load_budget, load_year
from pipeline.parse import PageText, ParseError, parse_statement
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


def test_a_one_ringgit_edit_to_a_vote_part_is_rejected(pages: list[PageText]) -> None:
    page = pages[0]
    edited = page.layout.replace("7,601,986        7,602,000", "7,601,987        7,602,000", 1)
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
