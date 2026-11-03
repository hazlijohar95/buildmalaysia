"""Full FY2025 ingest against Postgres (PIPELINE_DATABASE_URL, default the local buildmalaysia_pipeline db)."""

import os
from collections.abc import Iterator
from dataclasses import dataclass, replace
from datetime import datetime

import psycopg
import pytest

from pipeline.load import LoadResult, ReconciliationError, load_statement
from pipeline.model import Statement
from pipeline.parse import parse_statement
from pipeline.sources import DEFAULT_RAW_DIR, SOURCES, ensure_pdf, extract_pages, page_count, retrieved_at

DATABASE_URL = os.environ.get("PIPELINE_DATABASE_URL", "postgresql:///buildmalaysia_pipeline")
SOURCE = SOURCES[2025]


@dataclass(frozen=True)
class Ingest:
    conn: psycopg.Connection
    statement: Statement
    result: LoadResult
    pages: int
    retrieved: datetime


@pytest.fixture(scope="module")
def ingest() -> Iterator[Ingest]:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    statement = parse_statement(extract_pages(pdf, SOURCE), SOURCE.fiscal_year)
    pages, retrieved = page_count(pdf), retrieved_at(pdf)
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        result = load_statement(conn, SOURCE, statement, pages, retrieved)
        yield Ingest(conn, statement, result, pages, retrieved)


def scalar(conn: psycopg.Connection, sql: str) -> object:
    row = conn.execute(sql, (SOURCE.id,)).fetchone()
    assert row is not None
    return row[0]


def test_every_printed_total_reconciles(ingest: Ingest) -> None:
    assert ingest.result.printed_totals == 2474
    assert ingest.result.reconciled == 2474
    assert scalar(ingest.conn, "select count(*) from reconciliation where document_id = %s and not matches") == 0


def test_counts_and_statement_total(ingest: Ingest) -> None:
    r = ingest.result
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
        load_statement(ingest.conn, SOURCE, bad, ingest.pages, ingest.retrieved)

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
    again = load_statement(ingest.conn, SOURCE, ingest.statement, ingest.pages, ingest.retrieved)
    assert again == ingest.result
    assert scalar(ingest.conn, "select count(*) from operating_line where document_id = %s") == 2309
    assert scalar(ingest.conn, "select count(*) from printed_total where document_id = %s") == 2474
