"""Load one state's statement into Postgres, committing only if every printed total reconciles."""

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import psycopg

from pipeline.state import Row, StateParseError, Table, parse_table, read_words
from pipeline.state_sources import STATES, StateGap, StateMisprint, StateSource

COLUMNS = ("original", "revised", "actual", "prior_actual")


class StateReconciliationError(Exception):
    pass


@dataclass(frozen=True)
class StateLoadResult:
    lines: dict[str, int]  # section -> rows loaded
    totals: dict[str, int]  # section -> printed totals checked
    misprints: tuple[StateMisprint, ...]


def parse_state(pdf: Path, source: StateSource) -> tuple[Table, ...]:
    """Read the statement's revenue and operating tables, checking each is for the source's year."""
    tables = []
    for spec in (source.revenue, source.operating):
        pages = read_words(pdf, spec.pages)
        first = " ".join(w.text for w in pages[0].words)
        if not re.search(rf"31 Disember {source.fiscal_year}\b", first):
            raise StateParseError(spec.pages[0], "", f"page does not name 31 Disember {source.fiscal_year}")
        tables.append(parse_table(pages, spec))
    return tuple(tables)


def _cells(amounts: dict[str, int | None]) -> tuple[int | None, ...]:
    return tuple(amounts.get(c) for c in COLUMNS)


def load_state(
    conn: psycopg.Connection,
    source: StateSource,
    tables: tuple[Table, ...],
    page_count: int,
    retrieved_at: datetime,
) -> StateLoadResult:
    """Replace the statement's rows in one transaction; roll back on any unregistered mismatch."""
    if source.state not in {s.slug for s in STATES}:
        raise ValueError(f"unknown state {source.state!r}")
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "delete from state_statement where id = %s or (state_slug = %s and fiscal_year = %s)",
            (source.id, source.state, source.fiscal_year),
        )
        cur.execute(
            "insert into state_statement (id, state_slug, fiscal_year, publisher, title, url, sha256, page_count,"
            " retrieved_at) values (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                source.id,
                source.state,
                source.fiscal_year,
                source.publisher,
                source.title,
                source.url,
                source.sha256,
                page_count,
                retrieved_at,
            ),
        )
        for table in tables:
            _insert_table(cur, source.id, table)
        mismatches = cur.execute(
            "select section::text, label, pdf_page, original_sen - computed_original_sen,"
            " revised_sen - computed_revised_sen, actual_sen - computed_actual_sen,"
            " prior_actual_sen - computed_prior_actual_sen from state_reconciliation"
            " where statement_id = %s and not matches order by section, position",
            (source.id,),
        ).fetchall()
        _check_misprints(source, mismatches)
        checked = dict(
            cur.execute(
                "select section::text, count(*) from state_reconciliation where statement_id = %s group by section",
                (source.id,),
            ).fetchall()
        )
    return StateLoadResult(
        {t.section: len(t.lines) for t in tables},
        {t.section: checked.get(t.section, 0) for t in tables},
        source.known_misprints,
    )


def _check_misprints(source: StateSource, mismatches: list[tuple]) -> None:
    expected = {(m.section, m.label): m for m in source.known_misprints}
    problems = []
    seen = set()
    for section, label, page, *diffs in mismatches:
        found = {c: d for c, d in zip(COLUMNS, diffs, strict=True) if d}
        misprint = expected.get((section, label))
        if misprint is not None and misprint.diffs_sen == found:
            seen.add((section, label))
            continue
        problems.append(f"{section} {label!r} (pdf p{page}): printed minus rows {found} sen")
    for key in expected.keys() - seen:
        problems.append(f"registered misprint {key[0]} {key[1]!r} not found: the total now reconciles or moved")
    if problems:
        raise StateReconciliationError(f"{source.id}: " + "; ".join(problems))


def _insert_table(cur: psycopg.Cursor, statement_id: str, table: Table) -> None:
    for position, row in enumerate(table.lines, start=1):
        _insert_line(cur, statement_id, position, row)
    printed: list[tuple[str, str | None, str, dict[str, int | None], int, str]] = [
        (t.scope, t.category, t.label, t.amounts, t.pdf_page, t.source_text) for t in table.totals
    ]
    printed += [("transfer", None, r.name, r.amounts, r.pdf_page, r.source_text) for r in table.transfers]
    for position, (scope, category, label, amounts, page, text) in enumerate(printed, start=1):
        cur.execute(
            "insert into state_printed_total (statement_id, section, position, scope, category, label, original_sen,"
            " revised_sen, actual_sen, prior_actual_sen, pdf_page, source_text)"
            " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (statement_id, table.section, position, scope, category, label, *_cells(amounts), page, text),
        )


def _insert_line(cur: psycopg.Cursor, statement_id: str, position: int, row: Row) -> None:
    if row.amounts.get("actual") is None:
        raise StateReconciliationError(f"pdf p{row.pdf_page}: {row.name!r} prints no actual")
    cur.execute(
        "insert into state_line (statement_id, section, position, category, code, name_ms, original_sen,"
        " revised_sen, actual_sen, prior_actual_sen, pdf_page, source_text)"
        " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (statement_id, row.section, position, row.category, row.code, row.name, *_cells(row.amounts), row.pdf_page,
         row.source_text),
    )  # fmt: skip


def load_gaps(conn: psycopg.Connection, gaps: tuple[StateGap, ...]) -> int:
    """Replace state_gap from the registry."""
    known = {s.slug for s in STATES}
    for gap in gaps:
        if gap.state not in known:
            raise ValueError(f"unknown state {gap.state!r}")
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("delete from state_gap")
        for position, gap in enumerate(gaps, start=1):
            cur.execute(
                "insert into state_gap (state_slug, fiscal_year, reason, source_url, position)"
                " values (%s, %s, %s, %s, %s)",
                (gap.state, gap.fiscal_year, gap.reason, gap.source_url, position),
            )
    return len(gaps)
