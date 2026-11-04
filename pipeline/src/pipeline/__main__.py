"""CLI: `python -m pipeline ingest --year 2025 --database-url postgresql:///buildmalaysia_pipeline`."""

import argparse
import sys
from pathlib import Path

import psycopg

from pipeline.covid import parse_covid
from pipeline.development import parse_development
from pipeline.budget import parse_budget_summary
from pipeline.budget_word import parse_budget_summary_word
from pipeline.budget_detail import parse_operating_estimates
from pipeline.budget_development import parse_development_estimates, parse_dropped_projects
from pipeline.load import ReconciliationError, load_budget, load_year
from pipeline.model import Correction
from pipeline.parse import ParseError, parse_statement
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


def ingest(year: int, database_url: str, raw_dir: Path) -> int:
    source = SOURCES.get(year)
    if source is None:
        print(f"no source registered for {year}; known years: {sorted(SOURCES)}", file=sys.stderr)
        return 2
    try:
        pdf = ensure_pdf(source, raw_dir)
        pages = page_count(pdf)
        if pages != source.page_count:
            raise SourceError(f"{pdf} has {pages} pages, expected {source.page_count}")
        operating = parse_statement(extract_pages(pdf, source.operating_pages), source.fiscal_year)
        development = parse_development(extract_pages(pdf, source.development_pages), source.fiscal_year)
        covid = (
            parse_covid(extract_pages(pdf, source.covid_pages), source.fiscal_year, source.covid_columns)
            if source.covid_pages
            else None
        )
        with psycopg.connect(database_url, autocommit=True) as conn:
            result = load_year(conn, source, operating, development, pages, retrieved_at(pdf), covid)
    except (SourceError, ParseError, ReconciliationError) as error:
        print(f"ingest {year} failed: {error}", file=sys.stderr)
        return 1

    o, d = result.operating, result.development
    print(f"ingested {source.id} from {pdf}")
    print(
        f"  operating (Lampiran 1): votes {o.votes}, programmes {o.programmes}, activities {o.activities}, "
        f"leaf lines {o.lines}, printed totals {o.printed_totals}, reconciled {o.reconciled}"
    )
    print(
        f"  development (Lampiran 2): votes {d.votes}, groups {d.groups}, projects {d.projects}, "
        f"printed totals {d.printed_totals}, reconciled {d.reconciled}"
    )
    if covid is not None:
        print(f"  COVID-19 Fund (Lampiran 3): programmes {result.covid_lines}, total reconciled")
    _print_corrections(operating.corrections + development.corrections)
    for misprint in source.known_misprints:
        print(f"  known misprint accepted: {misprint.key}: {misprint.evidence}")
    for note in operating.unreferenced_notes:
        print(f"  note defined but carried by no line: {note}")
    return 0


def _print_corrections(corrections: tuple[Correction, ...]) -> None:
    for correction in corrections:
        c = correction.citation
        print(
            f"  rule {correction.rule}: pdf page {c.pdf_page} (book page {c.book_page}) line {c.line_no}: "
            f"{correction.detail}"
        )


def ingest_budget(year: int, database_url: str, raw_dir: Path) -> int:
    source = BUDGET_SOURCES.get(year)
    if source is None:
        print(f"no budget registered for {year}; known: {sorted(BUDGET_SOURCES)}", file=sys.stderr)
        return 2
    try:
        pdf = ensure_pdf(source, raw_dir)
        pages = page_count(pdf)
        if pages != source.page_count:
            raise SourceError(f"{pdf} has {pages} pages, expected {source.page_count}")
        parse_summary = parse_budget_summary_word if source.layout == "word" else parse_budget_summary
        statement = parse_summary(extract_pages(pdf, source.summary_pages), year, source.known_misprints)
        book = extract_pages(pdf, (source.summary_pages[1] + 1, pages))
        operating = parse_operating_estimates(book, year)
        development = parse_development_estimates(book, year, source.known_misprints)
        dropped = parse_dropped_projects(book)
        with psycopg.connect(database_url, autocommit=True) as conn:
            result = load_budget(conn, source, statement, pages, retrieved_at(pdf), operating, development, dropped)
            differs = conn.execute(
                "select fiscal_year, vote_code, line, mof_sen, janm_sen, diff_sen from budget_actual_check"
                " where document_id = %s and result not in ('matches', 'rounding') order by 1, 2, 3",
                (source.id,),
            ).fetchall()
    except (SourceError, ParseError) as error:
        print(f"ingest-budget {year} failed: {error}", file=sys.stderr)
        return 1
    print(f"ingested {source.id} from {pdf}")
    print(f"  votes {result.votes}, printed totals checked {result.printed_checks}")
    for label, diffs in source.known_misprints:
        print(f"  known misprint accepted: {label} printed minus its parts {list(diffs)} sen")
    for note in statement.rounding:
        print(f"  rule ROUNDED_INDEPENDENTLY: {note}")
    print(
        f"  operating estimates: {len(operating.votes)} votes, activity lines {result.operating_lines},"
        f" printed totals reconciled {result.operating_totals_reconciled}"
    )
    print(
        f"  development estimates: {len(development.votes)} votes, projects {result.development_projects},"
        f" printed totals reconciled {result.development_totals_reconciled},"
        f" Lampiran D rows checked {development.appendix_checks}"
    )
    if dropped is not None:
        print(f"  dropped projects (Lampiran F): {result.dropped_projects}, total checked, none in the project tables")
    print(f"  actuals against the audited statements: {result.actual_checks}")
    for row in differs:
        print(f"  {row[0]} {row[1]} {row[2]}: MOF {row[3]} sen, JANM {row[4]} sen, difference {row[5]} sen")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="pipeline")
    commands = parser.add_subparsers(dest="command", required=True)
    ingest_cmd = commands.add_parser("ingest", help="fetch, parse and load one year's source document")
    ingest_cmd.add_argument("--year", type=int, required=True)
    ingest_cmd.add_argument("--database-url", required=True)
    ingest_cmd.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR, help="where source PDFs are kept")
    budget_cmd = commands.add_parser("ingest-budget", help="fetch, parse and load one MOF budget book")
    budget_cmd.add_argument("--year", type=int, required=True, help="the budget year, e.g. 2027")
    budget_cmd.add_argument("--database-url", required=True)
    budget_cmd.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    args = parser.parse_args()
    if args.command == "ingest-budget":
        return ingest_budget(args.year, args.database_url, args.raw_dir)
    return ingest(args.year, args.database_url, args.raw_dir)


if __name__ == "__main__":
    sys.exit(main())
