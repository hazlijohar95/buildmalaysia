"""CLI: `python -m pipeline ingest --year 2025 --database-url postgresql:///buildmalaysia_pipeline`."""

import argparse
import sys
from pathlib import Path

import psycopg

from pipeline.covid import parse_covid
from pipeline.development import parse_development
from pipeline.gap import fill_gap, parse_english_vote_totals
from pipeline.budget import parse_budget_summary
from pipeline.budget_word import parse_budget_summary_word
from pipeline.budget_detail import parse_operating_estimates
from pipeline.budget_development import parse_development_estimates, parse_dropped_projects
from pipeline.load import ReconciliationError, load_budget, load_year
from pipeline.model import Correction
from pipeline.parse import ParseError, parse_statement
from pipeline.revenue import parse_revenue
from pipeline.tax_schedule import ScheduleError, write_schedule
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
        operating = parse_statement(
            extract_pages(pdf, source.operating_pages, source.operating_crop),
            source.fiscal_year,
            source.operating_columns,
            tuple(g.after_pdf_page for g in source.known_gaps),
        )
        gap_log: list[str] = []
        if source.known_gaps:
            if source.english_operating_pages is None:
                raise SourceError("a known gap needs Attachment 1's pages to check the totals above it")
            english = parse_english_vote_totals(
                extract_pages(pdf, source.english_operating_pages, source.operating_crop)
            )
            gap_votes = {s.vote_code for g in source.known_gaps for s in g.scopes}
            operating, gap_log = fill_gap(operating, english, gap_votes)
        development = parse_development(
            extract_pages(pdf, source.development_pages, source.development_crop), source.fiscal_year, source.slug_pages
        )
        revenue = parse_revenue(extract_pages(pdf, source.revenue_pages), source.fiscal_year, source.slug_pages)
        covid = (
            parse_covid(extract_pages(pdf, source.covid_pages), source.fiscal_year, source.covid_columns)
            if source.covid_pages
            else None
        )
        with psycopg.connect(database_url, autocommit=True) as conn:
            result = load_year(conn, source, operating, development, revenue, pages, retrieved_at(pdf), covid)
    except (SourceError, ParseError, ReconciliationError) as error:
        print(f"ingest {year} failed: {error}", file=sys.stderr)
        return 1

    o, d, r = result.operating, result.development, result.revenue
    print(f"ingested {source.id} from {pdf}")
    print(
        f"  operating (Lampiran 1): votes {o.votes}, programmes {o.programmes}, activities {o.activities}, "
        f"leaf lines {o.lines}, printed totals {o.printed_totals}, reconciled {o.reconciled}"
    )
    print(
        f"  development (Lampiran 2): votes {d.votes}, groups {d.groups}, projects {d.projects}, "
        f"printed totals {d.printed_totals}, reconciled {d.reconciled}"
    )
    print(
        f"  revenue (Note 5(a)): items {r.items}, printed totals {r.printed_totals}, reconciled {r.reconciled}; "
        f"HASIL {r.actual_sen} sen against Lampiran 1's {r.operating_actual_sen} sen "
        f"(difference {r.actual_sen - r.operating_actual_sen:+d} sen, the note's rounding to whole ringgit)"
    )
    if covid is not None:
        print(f"  COVID-19 Fund (Lampiran 3): programmes {result.covid_lines}, total reconciled")
    for gap in source.known_gaps:
        print(f"  known gap {gap.id}: {o.over_gaps} printed totals have rows on the missing page")
    for line in gap_log:
        print(f"  gap check: {line}")
    _print_corrections(operating.corrections + development.corrections + revenue.corrections)
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


def tax_schedule(year: int, raw_dir: Path, out: Path) -> int:
    try:
        schedule = write_schedule(raw_dir, year, out)
    except (OSError, ScheduleError) as error:
        print(f"tax-schedule {year} failed: {error}", file=sys.stderr)
        return 1
    bands = schedule["bands"]
    print(f"wrote {out}: {schedule['rate_table']}, {len(bands)} bands, each checked against LHDN's printed tax")
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
    tax_cmd = commands.add_parser("tax-schedule", help="read one year's personal income tax schedule into JSON")
    tax_cmd.add_argument("--year", type=int, required=True, help="the year of assessment, e.g. 2025")
    tax_cmd.add_argument("--out", type=Path, required=True)
    tax_cmd.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    args = parser.parse_args()
    if args.command == "tax-schedule":
        return tax_schedule(args.year, args.raw_dir, args.out)
    if args.command == "ingest-budget":
        return ingest_budget(args.year, args.database_url, args.raw_dir)
    return ingest(args.year, args.database_url, args.raw_dir)


if __name__ == "__main__":
    sys.exit(main())
