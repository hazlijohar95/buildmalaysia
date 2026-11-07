"""How development projects are followed across years (development_project_link and _chain), on every loaded year."""

import os
from collections.abc import Iterator

import psycopg
import pytest

from pipeline.load import load_year
from pipeline.sources import DEFAULT_RAW_DIR, SOURCES, retrieved_at
from pipeline.year import parse_year

pytestmark = pytest.mark.integration

DATABASE_URL = os.environ.get("PIPELINE_DATABASE_URL", "postgresql:///buildmalaysia_pipeline")


@pytest.fixture(scope="module")
def conn() -> Iterator[psycopg.Connection]:
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        loaded = {row[0] for row in conn.execute("select document_id from development_statement")}
        for source in SOURCES.values():
            if source.id in loaded:
                continue
            parsed = parse_year(source, DEFAULT_RAW_DIR)
            load_year(
                conn, source, parsed.operating, parsed.development, parsed.revenue, parsed.pages,
                retrieved_at(parsed.pdf), parsed.covid, parsed.operating_ocr_engine,
            )  # fmt: skip
        yield conn


def history(conn: psycopg.Connection, year: int, vote: str, code: str) -> list[tuple[int, str, bool | None, int]]:
    """(year, vote, cumulative_matches, rows linked in) for every row of the history holding this row."""
    return conn.execute(
        "select fiscal_year, vote_code, cumulative_matches, cardinality(previous) from development_project_chain"
        " where chain_id in (select chain_id from development_project_chain"
        "                    where (fiscal_year, vote_code, code) = (%s, %s, %s))"
        " order by fiscal_year, vote_code",
        (year, vote, code),
    ).fetchall()


def test_prima_is_followed_from_2016_to_2025_through_its_move_to_p43(conn: psycopg.Connection) -> None:
    # FY2018 prints PR1MA twice: under P.06 (spending before the move, p218) and P.43 (after, p242).
    # FY2019 prints one row under P.43 whose spending to 2018, RM 2,120,000,000.00, is their sum (p198).
    assert history(conn, 2025, "P.43", "00110") == [
        (2016, "P.06", None, 0),
        (2017, "P.06", True, 1),
        (2018, "P.06", True, 1),
        (2018, "P.43", None, 0),
        (2019, "P.43", True, 2),
        *[(year, "P.43", True, 1) for year in range(2020, 2026)],
    ]


def test_a_project_that_moved_vote_is_linked_and_flagged(conn: psycopg.Connection) -> None:
    rows = conn.execute(
        "select to_vote_code, cumulative_matches, moved_vote, merged from development_project_link"
        " where (from_year, from_vote_code, from_code) = (2018, 'P.64', '05011')"
    ).fetchall()
    assert rows == [("P.63", True, True, False)]


def test_a_different_project_reusing_a_code_in_another_vote_is_not_linked(conn: psycopg.Connection) -> None:
    # Both print 0 spent to date, but FY2021 P.06 98000 is "Malaysia Nuclear Energy" and FY2022 P.30 98000
    # "Akademi Sains Malaysia (ASM)".
    names = conn.execute(
        "select vote_code, name_ms, plan_actual_to_date_sen, plan_actual_prior_sen from development_project"
        " where code = '98000' and (fiscal_year, vote_code) in ((2021, 'P.06'), (2022, 'P.30')) order by fiscal_year"
    ).fetchall()
    assert [(v, n) for v, n, _, _ in names] == [
        ("P.06", "Malaysia Nuclear Energy"),
        ("P.30", "Akademi Sains Malaysia (ASM)"),
    ]
    assert (names[0][2], names[1][3]) == (0, 0)
    assert history(conn, 2022, "P.30", "98000")[0][0] != 2021
    assert history(conn, 2021, "P.06", "98000")[-1][0] == 2021


def test_a_code_printed_twice_in_a_vote_is_never_linked(conn: psycopg.Connection) -> None:
    repeated = conn.execute(
        "select c.chain_id, c.previous, c.key from development_project_chain c"
        " where (select count(*) from development_project p"
        "        where (p.fiscal_year, p.vote_code, p.code) = (c.fiscal_year, c.vote_code, c.code)) > 1"
    ).fetchall()
    # FY2016 P.10 96000 and P.23 09400, FY2018 P.21 90700 and P.62 16000: each row is a history of one.
    assert len(repeated) == 8
    assert all(chain_id == key and previous == [] for chain_id, previous, key in repeated)


def test_every_row_belongs_to_exactly_one_history_ending_at_its_latest_row(conn: psycopg.Connection) -> None:
    counts = conn.execute(
        "select (select count(*) from development_project), count(*), count(distinct key),"
        " count(*) filter (where chain_id = key) from development_project_chain"
    ).fetchone()
    assert counts is not None
    rows, chained, distinct, latest = counts
    assert rows == chained == distinct
    assert latest == conn.execute("select count(distinct chain_id) from development_project_chain").fetchone()[0]
    links = conn.execute(
        "select count(*) filter (where n > 1) from"
        " (select count(*) as n from development_project_link group by from_year, from_vote_code, from_code) s"
    ).fetchone()
    assert links == (0,)


def test_two_rows_merge_only_when_their_spending_to_date_sums_to_the_next_years_prior(conn: psycopg.Connection) -> None:
    not_summing = conn.execute(
        "select count(*) from development_project_link where merged and not cumulative_matches"
    ).fetchone()
    assert not_summing == (0,)


def test_zero_spending_on_both_sides_does_not_link_differently_named_rows(conn: psycopg.Connection) -> None:
    # FY2021 P.28 00600 "Penyelenggaraan Rangkaian Jalan Raya di Pelabuhan Klang" prints 0 to date (RMKe-12's first
    # year) and FY2022 P.28 00600 "Penyelidikan dan Pembangunan Kejuruteraan" prints 0 to 2021: different projects.
    assert history(conn, 2022, "P.28", "00600")[0][0] == 2022
    assert history(conn, 2021, "P.28", "00600")[-1][0] == 2021
