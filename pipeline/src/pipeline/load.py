"""Load one parsed source document into Postgres, gated on the reconciliation view."""

from dataclasses import dataclass
from datetime import datetime

import psycopg

from pipeline.model import Amounts, Statement
from pipeline.sources import SourceDocument


@dataclass(frozen=True)
class Mismatch:
    printed_total_id: int
    scope: str
    section: str | None
    vote_code: str | None
    programme_code: str | None
    activity_code: str | None
    object_code: str | None
    pdf_page: int
    line_count: int
    diffs_sen: tuple[int, int, int, int, int]  # printed minus leaf sum: Asal, Tambahan, Viremen, Jumlah, Sebenar

    def __str__(self) -> str:
        key = " ".join(
            f"{name}={value}"
            for name, value in [
                ("section", self.section),
                ("vote", self.vote_code),
                ("programme", self.programme_code),
                ("activity", self.activity_code),
                ("object", self.object_code),
            ]
            if value is not None
        )
        names = ("original", "supplementary", "virement", "revised", "actual")
        diffs = " ".join(f"{n}{d:+d}" for n, d in zip(names, self.diffs_sen, strict=True) if d)
        where = f"{self.scope} total {key}".rstrip()
        return f"{where} (pdf page {self.pdf_page}): {diffs or 'no leaf lines'} sen"


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


def _amounts(a: Amounts) -> tuple[int, int, int, int, int]:
    return (a.original, a.supplementary, a.virement, a.revised, a.actual)


def load_statement(
    conn: psycopg.Connection, source: SourceDocument, statement: Statement, page_count: int, retrieved_at: datetime
) -> LoadResult:
    """Replace this document's rows in one transaction; commit only if every printed total reconciles.

    The connection must be in autocommit mode, so that the transaction below is the
    whole transaction and not a savepoint inside one the caller left open.
    """
    if not conn.autocommit:
        raise ValueError("load_statement needs an autocommit connection")
    doc, year = source.id, statement.fiscal_year
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
        cur.execute("delete from printed_total where document_id = %s", (doc,))
        cur.execute("delete from operating_line where document_id = %s", (doc,))
        # The hierarchy is keyed by fiscal year. This document is the year's only source,
        # so its hierarchy is replaced too; a row another document still uses fails the FK.
        for table in ("activity", "programme", "vote"):
            cur.execute(f"delete from {table} where fiscal_year = %s", (year,))

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

        # One pass over the view: it recomputes every total from the leaves and is slow.
        cur.execute(
            """
            select matches, printed_total_id, scope, section, vote_code, programme_code, activity_code, object_code,
                   pdf_page, line_count, original_diff_sen, supplementary_diff_sen, virement_diff_sen,
                   revised_diff_sen, actual_diff_sen
            from reconciliation where document_id = %s order by printed_total_id
            """,
            (doc,),
        )
        rows = cur.fetchall()
        # The view's diffs are numeric (bigint minus sum(bigint)); they are whole sen.
        mismatches = [
            Mismatch(*row[1:10], (int(row[10]), int(row[11]), int(row[12]), int(row[13]), int(row[14])))
            for row in rows
            if not row[0]
        ]
        if mismatches:
            raise ReconciliationError(mismatches)
        reconciled = len(rows)
    return LoadResult(
        votes=len(statement.votes),
        programmes=len(statement.programmes),
        activities=len(statement.activities),
        lines=len(statement.lines),
        printed_totals=len(statement.totals),
        reconciled=reconciled,
    )
