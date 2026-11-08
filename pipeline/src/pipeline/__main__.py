"""CLI: `python -m pipeline ingest --year 2025 --database-url postgresql:///buildmalaysia_pipeline`."""

import argparse
import sys
from pathlib import Path

import psycopg

from pipeline.budget import parse_budget_summary
from pipeline.budget_detail import parse_operating_estimates
from pipeline.budget_development import parse_development_estimates, parse_dropped_projects
from pipeline.budget_word import parse_budget_summary_word
from pipeline.lineage import DEFAULT_LINEAGE_DIR, LineageError, load_lineage, read_lineage
from pipeline.load import ReconciliationError, load_budget, load_year
from pipeline.model import Correction
from pipeline.ocr import OcrError
from pipeline.parse import ParseError
from pipeline.procurement import ProcurementError, fetch_snapshot, latest_snapshot, load_snapshot
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
from pipeline.tax_schedule import ScheduleError, write_schedule
from pipeline.year import parse_year


def ingest(year: int, database_url: str, raw_dir: Path) -> int:
    source = SOURCES.get(year)
    if source is None:
        print(f"no source registered for {year}; known years: {sorted(SOURCES)}", file=sys.stderr)
        return 2
    try:
        parsed = parse_year(source, raw_dir)
        pdf, operating, development, revenue, covid = (
            parsed.pdf, parsed.operating, parsed.development, parsed.revenue, parsed.covid
        )  # fmt: skip
        with psycopg.connect(database_url, autocommit=True) as conn:
            result = load_year(
                conn, source, operating, development, revenue, parsed.pages, retrieved_at(pdf), covid,
                parsed.operating_ocr_engine,
            )  # fmt: skip
    except (SourceError, ParseError, ReconciliationError, OcrError, LineageError) as error:
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
    for line in parsed.gap_log:
        print(f"  gap check: {line}")
    if parsed.operating_ocr_engine is not None:
        print(f"  Lampiran 1 read by OCR: {parsed.operating_ocr_engine}")
        for hand in source.ocr_manual_readings:
            print(
                f"  manual reading: pdf page {hand.pdf_page} line top {hand.line_top} column {hand.column}: {hand.text!r}"
            )
    _print_corrections(operating.corrections + development.corrections + revenue.corrections + parsed.covid_corrections)
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
    except (SourceError, ParseError, LineageError) as error:
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


def load_lineage_files(database_url: str, lineage_dir: Path) -> int:
    try:
        lineage = read_lineage(lineage_dir)
        with psycopg.connect(database_url, autocommit=True) as conn:
            result = load_lineage(conn, lineage)
    except (OSError, LineageError) as error:
        print(f"load-lineage failed: {error}", file=sys.stderr)
        return 1
    print(
        f"loaded {lineage_dir}: bodies {result.bodies}, aliases {result.aliases}, vote holders {result.holders},"
        f" edges {result.edges}; {result.checked} printed vote names in the loaded documents all covered"
    )
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


def fetch_procurement(raw_dir: Path) -> int:
    try:
        folder = fetch_snapshot(raw_dir)
    except (OSError, ProcurementError) as error:
        print(f"fetch-procurement failed: {error}", file=sys.stderr)
        return 1
    print(f"saved {folder}")
    return 0


def load_procurement(database_url: str, raw_dir: Path, snapshot: Path | None) -> int:
    try:
        folder = snapshot or latest_snapshot(raw_dir)
        with psycopg.connect(database_url) as conn:
            result = load_snapshot(conn, folder)
    except (OSError, ProcurementError) as error:
        print(f"load-procurement failed: {error}", file=sys.stderr)
        return 1
    print(
        f"loaded {folder}: {result.notices} notices, {result.awards} awards; every listing's count matches the total"
        f" MyProcurement reported ({result.duplicates} listed as both current and archived, {result.repeats} read"
        " twice as new results arrived; each kept once)"
    )
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
    lineage_cmd = commands.add_parser("load-lineage", help="replace the ministry lineage tables from data/lineage/")
    lineage_cmd.add_argument("--database-url", required=True)
    lineage_cmd.add_argument("--lineage-dir", type=Path, default=DEFAULT_LINEAGE_DIR)
    tax_cmd = commands.add_parser("tax-schedule", help="read one year's personal income tax schedule into JSON")
    tax_cmd.add_argument("--year", type=int, required=True, help="the year of assessment, e.g. 2025")
    tax_cmd.add_argument("--out", type=Path, required=True)
    tax_cmd.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    fetch_cmd = commands.add_parser("fetch-procurement", help="save every MyProcurement result page under data/raw")
    fetch_cmd.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    proc_cmd = commands.add_parser("load-procurement", help="replace the procurement tables from a saved snapshot")
    proc_cmd.add_argument("--database-url", required=True)
    proc_cmd.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    proc_cmd.add_argument("--snapshot", type=Path, help="a data/raw/myprocurement/<date> folder; the newest by default")
    args = parser.parse_args()
    if args.command == "fetch-procurement":
        return fetch_procurement(args.raw_dir)
    if args.command == "load-procurement":
        return load_procurement(args.database_url, args.raw_dir, args.snapshot)
    if args.command == "tax-schedule":
        return tax_schedule(args.year, args.raw_dir, args.out)
    if args.command == "load-lineage":
        return load_lineage_files(args.database_url, args.lineage_dir)
    if args.command == "ingest-budget":
        return ingest_budget(args.year, args.database_url, args.raw_dir)
    return ingest(args.year, args.database_url, args.raw_dir)


if __name__ == "__main__":
    sys.exit(main())
