"""Read one year's statement: every appendix the source registers, parsed and checked."""

import functools
from dataclasses import dataclass
from pathlib import Path

from pipeline.covid import parse_covid, parse_covid_drawn
from pipeline.development import parse_development
from pipeline.gap import fill_gap, parse_english_vote_totals
from pipeline.model import Correction, CovidFundStatement, DevelopmentStatement, RevenueStatement, Statement
from pipeline.ocr import drawn_page, ocr_pages, words
from pipeline.parse import parse_statement
from pipeline.revenue import parse_revenue
from pipeline.sources import REPO_ROOT, SOURCES, SourceDocument, SourceError, ensure_pdf, extract_pages, page_count


@dataclass(frozen=True)
class ParsedYear:
    pdf: Path
    pages: int
    operating: Statement
    development: DevelopmentStatement
    revenue: RevenueStatement
    covid: CovidFundStatement | None
    covid_corrections: tuple[Correction, ...]
    gap_log: tuple[str, ...]
    operating_ocr_engine: str | None  # set where Lampiran 1 was read by OCR


def parse_year(source: SourceDocument, raw_dir: Path) -> ParsedYear:
    pdf = ensure_pdf(source, raw_dir)
    pages = page_count(pdf)
    if pages != source.page_count:
        raise SourceError(f"{pdf} has {pages} pages, expected {source.page_count}")
    operating_pages = extract_pages(pdf, source.operating_pages, source.operating_crop)
    engine: str | None = None
    if source.operating_ocr:

        @functools.cache
        def vocabulary() -> frozenset[str]:
            neighbours = [SOURCES[y] for y in source.ocr_vocabulary_years]
            return words(
                [
                    p
                    for s in neighbours
                    for p in extract_pages(ensure_pdf(s, raw_dir), s.operating_pages, s.operating_crop)
                ]
            )

        cache = REPO_ROOT / "data" / "ocr" / source.raw_path.removesuffix(".pdf")
        operating_pages, engine = ocr_pages(pdf, operating_pages, cache, vocabulary, source.ocr_manual_readings)
    operating = parse_statement(
        operating_pages,
        source.fiscal_year,
        source.operating_columns,
        tuple(g.after_pdf_page for g in source.known_gaps),
        source.operating_ocr,
    )
    gap_log: list[str] = []
    if source.known_gaps:
        if source.english_operating_pages is None:
            raise SourceError("a known gap needs Attachment 1's pages to check the totals above it")
        english = parse_english_vote_totals(extract_pages(pdf, source.english_operating_pages, source.operating_crop))
        operating, gap_log = fill_gap(operating, english, {s.vote_code for g in source.known_gaps for s in g.scopes})
    development = parse_development(
        extract_pages(pdf, source.development_pages, source.development_crop),
        source.fiscal_year,
        source.slug_pages,
        source.development_raw_right_pages,
    )
    revenue = parse_revenue(extract_pages(pdf, source.revenue_pages), source.fiscal_year, source.slug_pages)
    covid: CovidFundStatement | None = None
    covid_corrections: tuple[Correction, ...] = ()
    if source.covid_pages and source.covid_drawn:
        left, right = source.covid_pages
        covid, covid_corrections = parse_covid_drawn(
            drawn_page(pdf, left), drawn_page(pdf, right), source.fiscal_year, source.covid_columns
        )
    elif source.covid_pages:
        covid = parse_covid(extract_pages(pdf, source.covid_pages), source.fiscal_year, source.covid_columns)
    return ParsedYear(pdf, pages, operating, development, revenue, covid, covid_corrections, tuple(gap_log), engine)
