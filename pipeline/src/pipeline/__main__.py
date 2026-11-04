"""CLI: `python -m pipeline ingest --year 2025 --database-url postgresql:///buildmalaysia_pipeline`."""

import argparse
import sys
from pathlib import Path

import psycopg

from pipeline.development import parse_development
from pipeline.load import ReconciliationError, load_year
from pipeline.model import Correction
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
        operating = parse_statement(extract_pages(pdf, source.operating_pages), source.fiscal_year)
        development = parse_development(extract_pages(pdf, source.development_pages), source.fiscal_year)
        with psycopg.connect(database_url, autocommit=True) as conn:
            result = load_year(conn, source, operating, development, pages, retrieved_at(pdf))
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
    _print_corrections(operating.corrections + development.corrections)
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
