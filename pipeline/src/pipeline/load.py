"""Load one year's parsed statements into Postgres, gated on the reconciliation views."""

from collections.abc import Callable
from dataclasses import astuple, dataclass
from datetime import datetime
from typing import Any

import psycopg
from psycopg.rows import dict_row

from pipeline.model import Citation, Amounts, CovidFundStatement, DevelopmentStatement, Statement
from pipeline.budget import BudgetStatement
from pipeline.budget_detail import Estimate, OperatingEstimates
from pipeline.budget_development import DevelopmentEstimates
from pipeline.sources import BudgetSource, SourceDocument, SourceError

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
    covid_lines: int  # COVID-19 Fund programmes loaded; zero for a year without Lampiran 3


def _amounts(a: Amounts) -> tuple[int, int, int, int, int]:
    return (a.original, a.supplementary, a.virement, a.revised, a.actual)


def load_year(
    conn: psycopg.Connection,
    source: SourceDocument,
    operating: Statement,
    development: DevelopmentStatement,
    page_count: int,
    retrieved_at: datetime,
    covid: CovidFundStatement | None = None,
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
        cur.execute("delete from covid_fund_line where document_id = %s", (doc,))
        cur.execute("delete from covid_fund_total where document_id = %s", (doc,))
        for table in ("activity", "programme", "vote"):
            cur.execute(f"delete from {table} where fiscal_year = %s", (year,))
        cur.execute("update development_group set parent_ordinal = null where fiscal_year = %s", (year,))
        for table in ("development_group", "development_vote"):
            cur.execute(f"delete from {table} where fiscal_year = %s", (year,))

        _insert_operating(cur, doc, operating)
        _insert_development(cur, doc, development)
        if covid is not None:
            _insert_covid(cur, doc, covid)

        operating_rows = _mismatches(cur, doc, "reconciliation", OPERATING_COLUMNS, _operating_key)
        development_rows = _mismatches(cur, doc, "development_reconciliation", DEVELOPMENT_COLUMNS, _development_key)
        mismatches = operating_rows[1] + development_rows[1]
        known = {(m.key, m.diffs_sen) for m in source.known_misprints}
        found = {(m.key, m.diffs_sen) for m in mismatches}
        if known - found:
            raise SourceError(f"known misprints no longer occur: {sorted(known - found)}; update sources.py")
        unexplained = [m for m in mismatches if (m.key, m.diffs_sen) not in known]
        unexplained += _covid_mismatches(cur, doc)
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
        covid_lines=len(covid.lines) if covid else 0,
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


COVID_COLUMNS = (
    "ceiling", "spent_prior", "allocation", "supplementary", "virement", "revised", "actual", "spent_to_date",
)  # fmt: skip


def _insert_covid(cur: psycopg.Cursor, doc: str, statement: CovidFundStatement) -> None:
    columns = ", ".join(f"{c}_sen" for c in COVID_COLUMNS)
    placeholders = ", ".join(["%s"] * len(COVID_COLUMNS))
    spread = "pdf_page, book_page, amounts_pdf_page, amounts_book_page, source_text, amounts_source_text"
    cur.executemany(
        f"""
        insert into covid_fund_line (fiscal_year, code, name_ms, {columns}, document_id, line_no, {spread})
        values (%s, %s, %s, {placeholders}, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            (
                statement.fiscal_year,
                line.code,
                line.name,
                *astuple(line.amounts),
                doc,
                line.citation.left.line_no,
                line.citation.left.pdf_page,
                line.citation.left.book_page,
                line.citation.right.pdf_page,
                line.citation.right.book_page,
                line.citation.left.text,
                line.citation.right.text,
            )
            for line in statement.lines
        ],
    )
    c = statement.total_citation
    cur.execute(
        f"""
        insert into covid_fund_total (document_id, fiscal_year, {columns}, {spread})
        values (%s, %s, {placeholders}, %s, %s, %s, %s, %s, %s)
        """,
        (
            doc,
            statement.fiscal_year,
            *astuple(statement.total),
            c.left.pdf_page,
            c.left.book_page,
            c.right.pdf_page,
            c.right.book_page,
            c.left.text,
            c.right.text,
        ),
    )


def _covid_mismatches(cur: psycopg.Cursor, doc: str) -> list[Mismatch]:
    row = cur.execute(
        "select matches, pdf_page, line_count, revised_diff_sen, actual_diff_sen, spent_to_date_diff_sen"
        " from covid_fund_reconciliation where document_id = %s",
        (doc,),
    ).fetchone()
    if row is None or row[0]:
        return []
    return [
        Mismatch(
            "covid_fund_reconciliation",
            0,
            "COVID-19 Fund total",
            row[1],
            row[2],
            ("revised", "actual", "spent_to_date"),
            (int(row[3]), int(row[4]), int(row[5])),
        )  # fmt: skip
    ]


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


@dataclass(frozen=True)
class BudgetLoadResult:
    votes: int
    printed_checks: int
    actual_checks: dict[str, int]  # result of budget_actual_check -> count
    operating_lines: int
    operating_totals_reconciled: int
    development_projects: int
    development_totals_reconciled: int


def load_budget(
    conn: psycopg.Connection,
    source: BudgetSource,
    statement: BudgetStatement,
    page_count: int,
    retrieved_at: datetime,
    operating: OperatingEstimates | None = None,
    development: DevelopmentEstimates | None = None,
) -> BudgetLoadResult:
    """Replace this budget book's rows in one transaction.

    The book must agree with itself: every printed operating total must equal the sum of
    its activity lines, and every vote's detail total its line in the summary pages, or the
    transaction rolls back. The comparison of MOF's actuals with the audited statements is
    reported, not gated: a difference there is a finding about two sources, not a parse error."""
    if not conn.autocommit:
        raise ValueError("load_budget needs an autocommit connection")
    doc = source.id
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
            (
                doc,
                source.publisher,
                source.title,
                source.budget_year,
                source.url,
                source.sha256,
                page_count,
                retrieved_at,
            ),
        )
        cur.execute("delete from budget_development_total where document_id = %s", (doc,))
        cur.execute("delete from budget_development_project where document_id = %s", (doc,))
        cur.execute("delete from budget_development_group where document_id = %s", (doc,))
        cur.execute("delete from budget_operating_total where document_id = %s", (doc,))
        cur.execute("delete from budget_operating_line where document_id = %s", (doc,))
        cur.execute("delete from budget_heading where document_id = %s", (doc,))
        cur.execute("delete from budget_vote_figure where document_id = %s", (doc,))
        cur.execute("delete from budget_total where document_id = %s", (doc,))
        cur.execute(
            "insert into budget_document (document_id, budget_year) values (%s, %s)"
            " on conflict (document_id) do update set budget_year = excluded.budget_year",
            (doc, source.budget_year),
        )
        rows = []
        for vote in statement.votes:
            for i, (year, basis) in enumerate(statement.columns):
                part = {name: figure.amounts[i] for name, figure in vote.parts.items()}
                rows.append(
                    (
                        doc,
                        vote.code,
                        vote.heading,
                        year,
                        basis,
                        vote.total.amounts[i],
                        part.get("emoluments"),
                        part.get("other"),
                        part.get("direct"),
                        part.get("loan"),
                        vote.total.citation.pdf_page,
                        vote.total.citation.book_page,
                        vote.total.citation.text,
                    )
                )
        cur.executemany(
            """
            insert into budget_vote_figure (document_id, vote_code, heading, fiscal_year, basis, total_sen,
              emoluments_sen, other_sen, direct_sen, loan_sen, pdf_page, book_page, source_text)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            rows,
        )
        s = statement.summary.lines
        names = ("operating", "emoluments", "other", "development", "direct", "loan", "contingency", "grand_total")
        cur.executemany(
            f"""
            insert into budget_total (document_id, fiscal_year, basis, {", ".join(f"{n}_sen" for n in names)},
              pdf_page, book_page)
            values (%s, %s, %s, {", ".join(["%s"] * len(names))}, %s, %s)
            """,
            [
                (
                    doc,
                    year,
                    basis,
                    *(s[n].amounts[i] for n in names),
                    s["grand_total"].citation.pdf_page,
                    s["grand_total"].citation.book_page,
                )
                for i, (year, basis) in enumerate(statement.columns)
            ],
        )
        lines, reconciled = _insert_operating_estimates(cur, doc, operating) if operating else (0, 0)
        projects, dev_reconciled = _insert_development_estimates(cur, doc, development) if development else (0, 0)
        counts = dict(
            cur.execute(
                "select result, count(*) from budget_actual_check where document_id = %s group by result", (doc,)
            ).fetchall()
        )
    return BudgetLoadResult(
        len(statement.votes),
        statement.checks,
        {str(k): int(v) for k, v in counts.items()},
        lines,
        reconciled,
        projects,
        dev_reconciled,
    )


def _insert_development_estimates(cur: psycopg.Cursor, doc: str, estimates: DevelopmentEstimates) -> tuple[int, int]:
    groups, projects, totals = [], [], []
    for vote in estimates.votes:
        assert vote.total is not None
        for g in vote.groups:
            assert g.total is not None
            groups.append((doc, vote.code, g.ordinal, g.name, g.citation.pdf_page, g.citation.book_page))
            a, c = g.total
            totals.append((doc, vote.code, g.ordinal, *astuple(a), c.pdf_page, c.book_page, c.text))
        a, c = vote.total
        totals.append((doc, vote.code, None, *astuple(a), c.pdf_page, c.book_page, c.text))
        for p in vote.projects:
            assert p.amounts is not None
            c = p.citation
            projects.append(
                (
                    doc,
                    vote.code,
                    p.code,
                    p.group,
                    p.name,
                    *astuple(p.amounts),
                    c.line_no,
                    c.pdf_page,
                    c.book_page,
                    c.text,
                )
            )
    amounts = "total_cost_sen, actual_prior_sen, revised_sen, estimate_direct_sen, estimate_loan_sen"
    cur.executemany(
        "insert into budget_development_group (document_id, vote_code, ordinal, name_ms, pdf_page, book_page)"
        " values (%s, %s, %s, %s, %s, %s)",
        groups,
    )
    cur.executemany(
        f"insert into budget_development_project (document_id, vote_code, code, group_ordinal, name_ms, {amounts},"
        " line_no, pdf_page, book_page, source_text)"
        " values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        projects,
    )
    cur.executemany(
        f"insert into budget_development_total (document_id, vote_code, group_ordinal, {amounts},"
        " pdf_page, book_page, source_text) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        totals,
    )
    rows = cur.execute(
        "select matches, vote_code, group_ordinal, pdf_page from budget_development_reconciliation"
        " where document_id = %s",
        (doc,),
    ).fetchall()
    bad = [f"{r[1]} {'group ' + str(r[2]) if r[2] else 'total'} (pdf page {r[3]})" for r in rows if not r[0]]
    bad += [
        f"{r[0]} 2027 direct/loan {r[1]}/{r[2]} sen, summary pages {r[3]}/{r[4]} sen"
        for r in cur.execute(
            "select vote_code, estimate_direct_sen, estimate_loan_sen, summary_direct_sen, summary_loan_sen"
            " from budget_development_consistency where document_id = %s and not matches",
            (doc,),
        ).fetchall()
    ]
    if bad:
        raise SourceError(f"{len(bad)} development estimates do not reconcile; load rolled back\n  " + "\n  ".join(bad))
    return len(projects), len(rows)


def _insert_operating_estimates(cur: psycopg.Cursor, doc: str, estimates: OperatingEstimates) -> tuple[int, int]:
    headings, lines, totals = [], [], []

    def total(
        scope: str, vote: str, programme: str | None, activity: str | None, obj: str | None, e: Estimate, c: Citation
    ) -> None:
        totals.append(
            (
                doc,
                scope,
                vote,
                programme,
                activity,
                obj,
                e.prior,
                e.estimate,
                e.prior_posts,
                e.posts,
                c.pdf_page,
                c.book_page,
                c.text,
            )
        )

    for vote in estimates.votes:
        assert vote.total is not None and vote.object_page_total is not None
        total("vote", vote.code, None, None, None, *vote.total)
        total("vote", vote.code, None, None, None, *vote.object_page_total)
        for obj, (e, c) in vote.by_object.items():
            total("vote", vote.code, None, None, obj, e, c)
        for h in vote.headings:
            programme = h.code[:2] + "0000"
            c = h.citation
            headings.append((doc, vote.code, h.code, programme, h.name, c.pdf_page, c.book_page))
            assert h.total is not None
            if h.is_programme:
                total("programme", vote.code, programme, None, None, h.total, c)
                for obj, (e, oc) in h.objects.items():
                    total("programme", vote.code, programme, None, obj, e, oc)
            else:
                total("activity", vote.code, programme, h.code, None, h.total, c)
                for obj, (e, oc) in h.objects.items():
                    lines.append(
                        (
                            doc,
                            vote.code,
                            programme,
                            h.code,
                            obj,
                            e.prior,
                            e.estimate,
                            e.prior_posts,
                            e.posts,
                            oc.pdf_page,
                            oc.book_page,
                            oc.text,
                        )
                    )
    cur.executemany(
        "insert into budget_heading (document_id, vote_code, code, programme_code, name_ms, pdf_page, book_page)"
        " values (%s, %s, %s, %s, %s, %s, %s)",
        headings,
    )
    cur.executemany(
        """
        insert into budget_operating_line (document_id, vote_code, programme_code, activity_code, object_code,
          prior_estimate_sen, estimate_sen, prior_posts, posts, pdf_page, book_page, source_text)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        lines,
    )
    cur.executemany(
        """
        insert into budget_operating_total (document_id, scope, vote_code, programme_code, activity_code, object_code,
          prior_estimate_sen, estimate_sen, prior_posts, posts, pdf_page, book_page, source_text)
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        totals,
    )
    rows = cur.execute(
        "select matches, scope, vote_code, programme_code, activity_code, object_code, pdf_page,"
        " prior_estimate_diff_sen, estimate_diff_sen, prior_posts_diff, posts_diff"
        " from budget_operating_reconciliation where document_id = %s",
        (doc,),
    ).fetchall()
    bad = [r for r in rows if not r[0]]
    inconsistent = cur.execute(
        "select vote_code, prior_estimate_sen, summary_prior_estimate_sen, estimate_sen, summary_estimate_sen"
        " from budget_vote_consistency where document_id = %s and not matches",
        (doc,),
    ).fetchall()
    if bad or inconsistent:
        detail = [
            f"{r[1]} total {r[2]} {r[3] or ''} {r[4] or ''} {r[5] or ''} (pdf page {r[6]}): diffs {r[7:]}" for r in bad
        ]
        detail += [f"{r[0]} detail total {r[1]}/{r[3]} sen, summary pages {r[2]}/{r[4]} sen" for r in inconsistent]
        raise SourceError(f"{len(detail)} budget totals do not reconcile; load rolled back\n  " + "\n  ".join(detail))
    return len(lines), len(rows)
