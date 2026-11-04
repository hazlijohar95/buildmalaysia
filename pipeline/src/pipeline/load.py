"""Load one year's parsed statements into Postgres, gated on the reconciliation views."""

from collections.abc import Callable
from dataclasses import astuple, dataclass
from datetime import datetime
from typing import Any

import psycopg
from psycopg.rows import dict_row

from pipeline.model import Amounts, DevelopmentStatement, Statement
from pipeline.sources import SourceDocument, SourceError

OPERATING_COLUMNS = ("original", "supplementary", "virement", "revised", "actual")
DEVELOPMENT_COLUMNS = (
    "total_cost",
    "plan_actual_prior",
    "estimate_direct",
    "estimate_loan",
    "estimate",
    "actual_direct",
    "actual_loan",
    "actual",
    "plan_actual_to_date",
)


@dataclass(frozen=True)
class Mismatch:
    view: str  # the reconciliation view that reported it
    printed_total_id: int
    key: str  # scope and identifying codes, e.g. "vote total vote=T.01 object=10000"
    pdf_page: int
    leaf_count: int
    columns: tuple[str, ...]
    diffs_sen: tuple[int, ...]  # printed minus leaf sum, one per column

    def __str__(self) -> str:
        diffs = " ".join(f"{n}{d:+d}" for n, d in zip(self.columns, self.diffs_sen, strict=True) if d)
        return f"{self.view}: {self.key} (pdf page {self.pdf_page}): {diffs or 'no leaf rows'} sen"


class ReconciliationError(Exception):
    def __init__(self, mismatches: list[Mismatch]) -> None:
        lines = "\n".join(f"  {m}" for m in mismatches)
        super().__init__(f"{len(mismatches)} printed totals do not reconcile; load rolled back\n{lines}")
        self.mismatches = mismatches


@dataclass(frozen=True)
class LoadResult:
    votes: int
    programmes: int
    activities: int
    lines: int
    printed_totals: int
    reconciled: int


@dataclass(frozen=True)
class DevelopmentLoadResult:
    votes: int
    groups: int
    projects: int
    printed_totals: int
    reconciled: int


@dataclass(frozen=True)
class YearLoad:
    operating: LoadResult
    development: DevelopmentLoadResult


def _amounts(a: Amounts) -> tuple[int, int, int, int, int]:
    return (a.original, a.supplementary, a.virement, a.revised, a.actual)


def load_year(
    conn: psycopg.Connection,
    source: SourceDocument,
    operating: Statement,
    development: DevelopmentStatement,
    page_count: int,
    retrieved_at: datetime,
) -> YearLoad:
    """Replace this document's rows in one transaction; commit only if every printed total reconciles.

    The connection must be in autocommit mode, so that the transaction below is the
    whole transaction and not a savepoint inside one the caller left open.
    """
    if not conn.autocommit:
        raise ValueError("load_year needs an autocommit connection")
    if operating.fiscal_year != source.fiscal_year or development.fiscal_year != source.fiscal_year:
        raise ValueError("statements and source document disagree on the fiscal year")
    doc, year = source.id, source.fiscal_year
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            """
            insert into source_document (id, publisher, title, fiscal_year, url, sha256, page_count, retrieved_at)
            values (%s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (id) do update set
              publisher = excluded.publisher, title = excluded.title, fiscal_year = excluded.fiscal_year,
              url = excluded.url, sha256 = excluded.sha256, page_count = excluded.page_count,
              retrieved_at = excluded.retrieved_at
            """,
            (doc, source.publisher, source.title, year, source.url, source.sha256, page_count, retrieved_at),
        )
        # The hierarchies are keyed by fiscal year. This document is the year's only source,
        # so its hierarchy is replaced too; a row another document still uses fails the FK.
        cur.execute("delete from printed_total where document_id = %s", (doc,))
        cur.execute("delete from operating_line where document_id = %s", (doc,))
        cur.execute("delete from development_printed_total where document_id = %s", (doc,))
        cur.execute("delete from development_project where document_id = %s", (doc,))
        cur.execute("delete from development_statement where document_id = %s", (doc,))
        for table in ("activity", "programme", "vote"):
            cur.execute(f"delete from {table} where fiscal_year = %s", (year,))
        cur.execute("update development_group set parent_ordinal = null where fiscal_year = %s", (year,))
        for table in ("development_group", "development_vote"):
            cur.execute(f"delete from {table} where fiscal_year = %s", (year,))

        _insert_operating(cur, doc, operating)
        _insert_development(cur, doc, development)

        operating_rows = _mismatches(cur, doc, "reconciliation", OPERATING_COLUMNS, _operating_key)
        development_rows = _mismatches(cur, doc, "development_reconciliation", DEVELOPMENT_COLUMNS, _development_key)
        mismatches = operating_rows[1] + development_rows[1]
        known = {(m.key, m.diffs_sen) for m in source.known_misprints}
        found = {(m.key, m.diffs_sen) for m in mismatches}
        if known - found:
            raise SourceError(f"known misprints no longer occur: {sorted(known - found)}; update sources.py")
        unexplained = [m for m in mismatches if (m.key, m.diffs_sen) not in known]
        if unexplained:
            raise ReconciliationError(unexplained)

    return YearLoad(
        LoadResult(
            votes=len(operating.votes),
            programmes=len(operating.programmes),
            activities=len(operating.activities),
            lines=len(operating.lines),
            printed_totals=len(operating.totals),
            reconciled=operating_rows[0] - len(operating_rows[1]),
        ),
        DevelopmentLoadResult(
            votes=len(development.votes),
            groups=len(development.groups),
            projects=len(development.projects),
            printed_totals=len(development.totals),
            reconciled=development_rows[0] - len(development_rows[1]),
        ),
    )


def _insert_operating(cur: psycopg.Cursor, doc: str, statement: Statement) -> None:
    year = statement.fiscal_year
    cur.executemany(
        "insert into vote (fiscal_year, code, name_ms, section) values (%s, %s, %s, %s)",
        [(year, v.code, v.name, v.section.value) for v in statement.votes],
    )
    cur.executemany(
        "insert into programme (fiscal_year, vote_code, code, name_ms) values (%s, %s, %s, %s)",
        [(year, p.vote_code, p.code, p.name) for p in statement.programmes],
    )
    cur.executemany(
        "insert into activity (fiscal_year, vote_code, code, programme_code, name_ms) values (%s, %s, %s, %s, %s)",
        [(year, a.vote_code, a.code, a.programme_code, a.name) for a in statement.activities],
    )
    cur.executemany(
        """
        insert into operating_line (fiscal_year, vote_code, activity_code, object_code, original_sen,
          supplementary_sen, virement_sen, revised_sen, actual_sen, document_id, pdf_page, book_page, source_text)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (
                year,
                line.vote_code,
                line.activity_code,
                line.object_code,
                *_amounts(line.amounts),
                doc,
                line.citation.pdf_page,
                line.citation.book_page,
                line.citation.text,
            )
            for line in statement.lines
        ],
    )
    cur.executemany(
        """
        insert into printed_total (document_id, fiscal_year, scope, section, vote_code, programme_code,
          activity_code, object_code, original_sen, supplementary_sen, virement_sen, revised_sen, actual_sen,
          footnote, pdf_page, book_page, source_text)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (
                doc,
                year,
                t.scope.value,
                t.section.value if t.section else None,
                t.vote_code,
                t.programme_code,
                t.activity_code,
                t.object_code,
                *_amounts(t.amounts),
                t.footnote,
                t.citation.pdf_page,
                t.citation.book_page,
                t.citation.text,
            )
            for t in statement.totals
        ],
    )


def _insert_development(cur: psycopg.Cursor, doc: str, statement: DevelopmentStatement) -> None:
    year = statement.fiscal_year
    cur.execute(
        "insert into development_statement (document_id, fiscal_year, prior_plan, plan) values (%s, %s, %s, %s)",
        (doc, year, statement.prior_plan, statement.plan),
    )
    cur.executemany(
        "insert into development_vote (fiscal_year, code, name_ms) values (%s, %s, %s)",
        [(year, v.code, v.name) for v in statement.votes],
    )
    # Parents are inserted without their link first: a parent group is printed after its members.
    cur.executemany(
        "insert into development_group (fiscal_year, vote_code, ordinal, name_ms) values (%s, %s, %s, %s)",
        [(year, g.vote_code, g.ordinal, g.name) for g in statement.groups],
    )
    cur.executemany(
        "update development_group set parent_ordinal = %s where fiscal_year = %s and vote_code = %s and ordinal = %s",
        [(g.parent_ordinal, year, g.vote_code, g.ordinal) for g in statement.groups if g.parent_ordinal is not None],
    )
    columns = ", ".join(f"{c}_sen" for c in DEVELOPMENT_COLUMNS)
    placeholders = ", ".join(["%s"] * len(DEVELOPMENT_COLUMNS))
    spread = "pdf_page, book_page, amounts_pdf_page, amounts_book_page, source_text, amounts_source_text"
    cur.executemany(
        f"""
        insert into development_project (fiscal_year, vote_code, code, group_ordinal, name_ms, {columns},
          footnote, document_id, line_no, {spread})
        values (%s, %s, %s, %s, %s, {placeholders}, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (
                year,
                p.vote_code,
                p.code,
                p.group_ordinal,
                p.name,
                *astuple(p.amounts),
                p.footnote,
                doc,
                p.citation.left.line_no,
                p.citation.left.pdf_page,
                p.citation.left.book_page,
                p.citation.right.pdf_page,
                p.citation.right.book_page,
                p.citation.left.text,
                p.citation.right.text,
            )
            for p in statement.projects
        ],
    )
    cur.executemany(
        f"""
        insert into development_printed_total (document_id, fiscal_year, scope, vote_code, group_ordinal, {columns},
          footnote, {spread})
        values (%s, %s, %s, %s, %s, {placeholders}, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (
                doc,
                year,
                t.scope.value,
                t.vote_code,
                t.group_ordinal,
                *astuple(t.amounts),
                t.footnote,
                t.citation.left.pdf_page,
                t.citation.left.book_page,
                t.citation.right.pdf_page,
                t.citation.right.book_page,
                t.citation.left.text,
                t.citation.right.text,
            )
            for t in statement.totals
        ],
    )


def _operating_key(row: dict[str, Any]) -> str:
    codes = [
        f"{name}={row[column]}"
        for name, column in [
            ("section", "section"),
            ("vote", "vote_code"),
            ("programme", "programme_code"),
            ("activity", "activity_code"),
            ("object", "object_code"),
        ]
        if row[column] is not None
    ]
    return " ".join([f"{row['scope']} total", *codes])


def _development_key(row: dict[str, Any]) -> str:
    codes = [f"{n}={row[c]}" for n, c in [("vote", "vote_code"), ("group", "group_ordinal")] if row[c] is not None]
    return " ".join([f"{row['scope']} total", *codes])


def _mismatches(
    cur: psycopg.Cursor, doc: str, view: str, columns: tuple[str, ...], key: Callable[[dict[str, Any]], str]
) -> tuple[int, list[Mismatch]]:
    """Read a reconciliation view for this document: (rows checked, rows that do not match)."""
    with cur.connection.cursor(row_factory=dict_row) as rows_cur:
        rows = rows_cur.execute(
            f"select * from {view} where document_id = %s order by printed_total_id", (doc,)
        ).fetchall()
    count_column = "line_count" if view == "reconciliation" else "project_count"
    mismatches = [
        Mismatch(
            view=view,
            printed_total_id=row["printed_total_id"],
            key=key(row),
            pdf_page=row["pdf_page"],
            leaf_count=row[count_column],
            columns=columns,
            # The diffs are numeric (bigint minus sum(bigint)); they are whole sen.
            diffs_sen=tuple(int(row[f"{c}_diff_sen"]) for c in columns),
        )
        for row in rows
        if not row["matches"]
    ]
    return len(rows), mismatches
