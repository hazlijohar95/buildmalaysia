"""Full FY2025 ingest against Postgres (PIPELINE_DATABASE_URL, default the local buildmalaysia_pipeline db)."""

import os
from collections.abc import Iterator
from dataclasses import dataclass, replace
from datetime import datetime

import psycopg
import pytest

from pipeline.covid import parse_covid
from pipeline.development import parse_development
from pipeline.load import ReconciliationError, YearLoad, load_year
from pipeline.model import DevelopmentStatement, Statement
from pipeline.parse import parse_statement
from pipeline.sources import DEFAULT_RAW_DIR, SOURCES, ensure_pdf, extract_pages, page_count, retrieved_at

DATABASE_URL = os.environ.get("PIPELINE_DATABASE_URL", "postgresql:///buildmalaysia_pipeline")
SOURCE = SOURCES[2025]


@dataclass(frozen=True)
class Ingest:
    conn: psycopg.Connection
    statement: Statement
    development: DevelopmentStatement
    result: YearLoad
    pages: int
    retrieved: datetime


@pytest.fixture(scope="module")
def ingest() -> Iterator[Ingest]:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    statement = parse_statement(extract_pages(pdf, SOURCE.operating_pages), SOURCE.fiscal_year)
    development = parse_development(extract_pages(pdf, SOURCE.development_pages), SOURCE.fiscal_year)
    pages, retrieved = page_count(pdf), retrieved_at(pdf)
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        result = load_year(conn, SOURCE, statement, development, pages, retrieved)
        yield Ingest(conn, statement, development, result, pages, retrieved)


def scalar(conn: psycopg.Connection, sql: str) -> object:
    row = conn.execute(sql, (SOURCE.id,)).fetchone()
    assert row is not None
    return row[0]


def test_every_printed_total_reconciles(ingest: Ingest) -> None:
    assert ingest.result.operating.printed_totals == 2474
    assert ingest.result.operating.reconciled == 2474
    assert scalar(ingest.conn, "select count(*) from reconciliation where document_id = %s and not matches") == 0


def test_counts_and_statement_total(ingest: Ingest) -> None:
    r = ingest.result.operating
    assert (r.votes, r.programmes, r.activities, r.lines) == (53, 279, 1123, 2309)
    sql = "select actual_sen from printed_total where document_id = %s and scope = 'statement' and object_code is null"
    assert scalar(ingest.conn, sql) == 33_606_926_296_850
    by_section = dict(
        ingest.conn.execute(
            "select section, actual_sen from printed_total"
            " where document_id = %s and scope = 'section' and object_code is null",
            (SOURCE.id,),
        ).fetchall()
    )
    assert by_section == {"charged": 9_938_129_643_029, "supply": 23_668_796_653_821}
    assert (
        scalar(ingest.conn, "select sum(actual_sen) from operating_line where document_id = %s") == 33_606_926_296_850
    )


def test_every_row_cites_a_lampiran_1_page(ingest: Ingest) -> None:
    for table in ("operating_line", "printed_total"):
        bad = scalar(
            ingest.conn,
            f"select count(*) from {table} where document_id = %s"
            " and not (pdf_page between 105 and 211 and book_page = pdf_page - 14 and source_text <> '')",
        )
        assert bad == 0, table


def test_one_sen_edit_is_rejected_and_rolled_back(ingest: Ingest) -> None:
    first = ingest.statement.lines[0]
    edited = replace(first, amounts=replace(first.amounts, actual=first.amounts.actual + 1))
    bad = replace(ingest.statement, lines=(edited, *ingest.statement.lines[1:]))

    with pytest.raises(ReconciliationError) as error:
        load_year(ingest.conn, SOURCE, bad, ingest.development, ingest.pages, ingest.retrieved)

    # Every total above T.01 / 010100 / Emolumen: activity, programme (object and all),
    # vote (object and all), section (object and all), statement (object and all).
    mismatches = error.value.mismatches
    assert len(mismatches) == 9
    assert all(m.diffs_sen == (0, 0, 0, 0, -1) for m in mismatches)
    stored = ingest.conn.execute(
        "select actual_sen from operating_line where document_id = %s"
        " and (vote_code, activity_code, object_code) = (%s, %s, %s)",
        (SOURCE.id, first.vote_code, first.activity_code, first.object_code),
    ).fetchone()
    assert stored == (first.amounts.actual,)


def test_rerun_converges_to_the_same_rows(ingest: Ingest) -> None:
    again = load_year(ingest.conn, SOURCE, ingest.statement, ingest.development, ingest.pages, ingest.retrieved)
    assert again == ingest.result
    assert scalar(ingest.conn, "select count(*) from operating_line where document_id = %s") == 2309
    assert scalar(ingest.conn, "select count(*) from printed_total where document_id = %s") == 2474
    assert scalar(ingest.conn, "select count(*) from development_project where document_id = %s") == 918
    assert scalar(ingest.conn, "select count(*) from development_printed_total where document_id = %s") == 89


def test_every_development_total_reconciles(ingest: Ingest) -> None:
    d = ingest.result.development
    assert (d.votes, d.groups, d.projects, d.printed_totals, d.reconciled) == (31, 57, 918, 89, 89)
    sql = "select count(*) from development_reconciliation where document_id = %s and not matches"
    assert scalar(ingest.conn, sql) == 0


def test_development_statement_total(ingest: Ingest) -> None:
    row = ingest.conn.execute(
        "select estimate_sen, actual_direct_sen, actual_loan_sen, actual_sen from development_printed_total"
        " where document_id = %s and scope = 'statement'",
        (SOURCE.id,),
    ).fetchone()
    # Book p.235: Anggaran 83,867,723,620; Sebenar 80,563,809,466.06 + 1,356,716,647.35 = 81,920,526,113.41.
    assert row == (8_386_772_362_000, 8_056_380_946_606, 135_671_664_735, 8_192_052_611_341)
    assert scalar(ingest.conn, "select sum(actual_sen) from development_project where document_id = %s") == (
        8_192_052_611_341
    )


def test_every_development_row_cites_both_pages_of_its_spread(ingest: Ingest) -> None:
    for table in ("development_project", "development_printed_total"):
        bad = scalar(
            ingest.conn,
            f"select count(*) from {table} where document_id = %s and not ("
            " pdf_page between 214 and 248 and pdf_page %% 2 = 0 and book_page = pdf_page - 14"
            " and amounts_pdf_page = pdf_page + 1 and source_text <> '' and amounts_source_text <> '')",
        )
        assert bad == 0, table


def test_parent_groups_sum_their_members(ingest: Ingest) -> None:
    rows = ingest.conn.execute(
        "select p.vote_code, p.name_ms, count(m.*) from development_group p"
        " join development_group m on m.fiscal_year = p.fiscal_year and m.vote_code = p.vote_code"
        "  and m.parent_ordinal = p.ordinal"
        " where p.fiscal_year = 2025 group by 1, 2 order by 1",
    ).fetchall()
    assert rows == [
        ("P.23", "Perhutanan Semenanjung, Sarawak dan Sabah", 3),
        ("P.27", "Jalan Raya dan Jambatan Semenanjung, Sabah dan Sarawak", 3),
    ]


def test_one_sen_development_edit_is_rejected(ingest: Ingest) -> None:
    first = ingest.development.projects[0]  # P.06 00100, directly under the vote header
    edited = replace(first, amounts=replace(first.amounts, total_cost=first.amounts.total_cost + 1))
    bad = replace(ingest.development, projects=(edited, *ingest.development.projects[1:]))

    with pytest.raises(ReconciliationError) as error:
        load_year(ingest.conn, SOURCE, ingest.statement, bad, ingest.pages, ingest.retrieved)

    mismatches = error.value.mismatches
    assert [m.key for m in mismatches] == ["vote total vote=P.06", "statement total"]
    assert all(m.diffs_sen == (-1, 0, 0, 0, 0, 0, 0, 0, 0) for m in mismatches)
    stored = scalar(
        ingest.conn,
        "select total_cost_sen from development_project where document_id = %s and (vote_code, code) = ('P.06', '00100')",
    )
    assert stored == first.amounts.total_cost


@pytest.mark.parametrize(
    ("year", "operating_counts", "development_counts", "operating_actual", "development_actual", "covid_actual"),
    [
        # (votes, programmes, activities, leaf lines, printed totals); (votes, groups, projects, printed totals)
        # covid_actual: COVID-19 Fund (Lampiran 3) spending, None where the statement has no Lampiran 3.
        (2024, (53, 237, 1068, 2206, 2280), (31, 57, 923, 89), 32_461_764_924_833, 8_401_159_546_378, None),
        (2023, (51, 231, 1037, 2094, 2201), (30, 58, 856, 89), 31_495_948_173_121, 9_608_973_712_254, 0),
        (
            2022,
            (52, 226, 1009, 2057, 2162),
            (29, 56, 746, 86),
            29_435_676_061_497,
            7_157_396_142_579,
            3_097_911_954_653,
        ),
        # FY2021 prints one programme total RM1,000,000 short of its rows (sources.KnownMisprint).
        (
            2021,
            (52, 229, 1032, 2089, 2210),
            (31, 69, 1051, 101),
            23_375_205_502_913,
            6_425_666_575_457,
            3_771_101_636_510,
        ),
    ],
)
def test_earlier_years_load_and_reconcile(
    year: int,
    operating_counts: tuple[int, ...],
    development_counts: tuple[int, ...],
    operating_actual: int,
    development_actual: int,
    covid_actual: int | None,
) -> None:
    source = SOURCES[year]
    pdf = ensure_pdf(source, DEFAULT_RAW_DIR)
    operating = parse_statement(extract_pages(pdf, source.operating_pages), year)
    development = parse_development(extract_pages(pdf, source.development_pages), year)
    covid = (
        parse_covid(extract_pages(pdf, source.covid_pages), year, source.covid_columns) if source.covid_pages else None
    )
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        result = load_year(conn, source, operating, development, page_count(pdf), retrieved_at(pdf), covid)
        o, d = result.operating, result.development
        assert (o.votes, o.programmes, o.activities, o.lines, o.printed_totals) == operating_counts
        assert (d.votes, d.groups, d.projects, d.printed_totals) == development_counts
        assert o.reconciled == o.printed_totals - len(source.known_misprints)
        assert d.reconciled == d.printed_totals
        row = conn.execute(
            "select operating_actual_sen, development_actual_sen, covid_fund_actual_sen"
            " from federal_spending where fiscal_year = %s",
            (year,),
        ).fetchone()
        assert row == (operating_actual, development_actual, covid_actual)
        if covid is not None:
            sql = "select matches, line_count from covid_fund_reconciliation where fiscal_year = %s"
            assert conn.execute(sql, (year,)).fetchone() == (True, 31)
