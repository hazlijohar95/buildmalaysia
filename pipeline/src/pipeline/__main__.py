"""CLI: `python -m pipeline ingest --year 2025 --database-url postgresql:///buildmalaysia_pipeline`."""

import argparse
import sys
from pathlib import Path

import psycopg

from pipeline.load import ReconciliationError, load_statement
from pipeline.parse import ParseError, parse_statement
from pipeline.sources import DEFAULT_RAW_DIR, SOURCES, SourceError, ensure_pdf, extract_pages, page_count, retrieved_at


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
        statement = parse_statement(extract_pages(pdf, source), source.fiscal_year)
        with psycopg.connect(database_url, autocommit=True) as conn:
            result = load_statement(conn, source, statement, pages, retrieved_at(pdf))
    except (SourceError, ParseError, ReconciliationError) as error:
        print(f"ingest {year} failed: {error}", file=sys.stderr)
        return 1

    print(f"ingested {source.id} from {pdf}")
    print(
        f"  votes {result.votes}, programmes {result.programmes}, activities {result.activities}, "
        f"leaf lines {result.lines}, printed totals {result.printed_totals}, reconciled {result.reconciled}"
    )
    for correction in statement.corrections:
        c = correction.citation
        print(
            f"  rule {correction.rule}: pdf page {c.pdf_page} (book page {c.book_page}) line {c.line_no}: "
            f"{correction.detail}"
        )
    for note in statement.unreferenced_notes:
        print(f"  note defined but carried by no line: {note}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="pipeline")
    commands = parser.add_subparsers(dest="command", required=True)
    ingest_cmd = commands.add_parser("ingest", help="fetch, parse and load one year's source document")
    ingest_cmd.add_argument("--year", type=int, required=True)
    ingest_cmd.add_argument("--database-url", required=True)
    ingest_cmd.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR, help="where source PDFs are kept")
    args = parser.parse_args()
    return ingest(args.year, args.database_url, args.raw_dir)


if __name__ == "__main__":
    sys.exit(main())
