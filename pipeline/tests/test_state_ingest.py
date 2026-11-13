"""Every registered state statement, parsed from its PDF and loaded into Postgres (PIPELINE_DATABASE_URL)."""

import os
from dataclasses import replace
from datetime import UTC, datetime

import psycopg
import pytest

from pipeline.sources import DEFAULT_RAW_DIR, ensure_pdf, page_count
from pipeline.state_load import StateReconciliationError, load_gaps, load_state, parse_state
from pipeline.state_sources import STATE_GAPS, STATE_SOURCES

pytestmark = pytest.mark.integration

DATABASE_URL = os.environ.get("PIPELINE_DATABASE_URL", "postgresql:///buildmalaysia_pipeline")
AT = datetime(2026, 11, 10, tzinfo=UTC)


@pytest.fixture(scope="module")
def conn():
    with psycopg.connect(DATABASE_URL, autocommit=True) as c:
        yield c


@pytest.mark.parametrize("key", sorted(STATE_SOURCES), ids=lambda k: f"{k[0]}-{k[1]}")
def test_statement_loads_and_reconciles(conn: psycopg.Connection, key: tuple[str, int]) -> None:
    source = STATE_SOURCES[key]
    pdf = ensure_pdf(source, DEFAULT_RAW_DIR, source.intermediate)
    assert page_count(pdf) == source.page_count
    tables = parse_state(pdf, source)
    result = load_state(conn, source, tables, source.page_count, AT)
    assert result.totals["revenue"] == 4  # three categories and JUMLAH HASIL
    assert result.totals["operating"] >= 3
    rows = conn.execute(
        "select label, matches from state_reconciliation where statement_id = %s", (source.id,)
    ).fetchall()
    misprinted = {m.label for m in source.known_misprints}
    assert all(matches or label in misprinted for label, matches in rows)
    lines = conn.execute(
        "select count(*), count(*) filter (where pdf_page between %s and %s or pdf_page between %s and %s)"
        " from state_line where statement_id = %s",
        (*source.revenue.pages, *source.operating.pages, source.id),
    ).fetchone()
    assert lines[0] == lines[1] > 0  # every row cites a page of its table


def test_a_mismatch_rolls_the_statement_back(conn: psycopg.Connection) -> None:
    source = STATE_SOURCES[("terengganu", 2024)]
    pdf = ensure_pdf(source, DEFAULT_RAW_DIR, source.intermediate)
    revenue, operating = parse_state(pdf, source)
    first = revenue.lines[0]
    broken = replace(first, amounts={**first.amounts, "actual": first.amounts["actual"] + 1})
    tampered = replace(revenue, lines=(broken, *revenue.lines[1:]))
    load_state(conn, source, (revenue, operating), source.page_count, AT)
    before = conn.execute("select loaded_at from state_statement where id = %s", (source.id,)).fetchone()
    with pytest.raises(StateReconciliationError, match="JUMLAH HASIL"):
        load_state(conn, source, (tampered, operating), source.page_count, AT)
    after = conn.execute("select loaded_at from state_statement where id = %s", (source.id,)).fetchone()
    assert before == after  # the earlier load is untouched


def test_gaps_load(conn: psycopg.Connection) -> None:
    assert load_gaps(conn, STATE_GAPS) == len(STATE_GAPS)
    states = conn.execute("select count(distinct state_slug) from state_gap").fetchone()[0]
    assert states == len({g.state for g in STATE_GAPS})
