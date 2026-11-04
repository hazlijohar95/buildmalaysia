"""Full FY2025 ingest against Postgres (PIPELINE_DATABASE_URL, default the local buildmalaysia_pipeline db)."""

import os
from collections.abc import Iterator
from dataclasses import dataclass, replace
from datetime import datetime

import psycopg
import pytest

from pipeline.development import parse_development
from pipeline.load import ReconciliationError, YearLoad, load_year
from pipeline.model import DevelopmentStatement, RevenueCategory, RevenueStatement, Statement
from pipeline.parse import ParseError, parse_statement
from pipeline.revenue import parse_revenue
from pipeline.sources import DEFAULT_RAW_DIR, SOURCES, ensure_pdf, extract_pages, page_count, retrieved_at
from pipeline.year import parse_year

DATABASE_URL = os.environ.get("PIPELINE_DATABASE_URL", "postgresql:///buildmalaysia_pipeline")
SOURCE = SOURCES[2025]


@dataclass(frozen=True)
class Ingest:
    conn: psycopg.Connection
    statement: Statement
    development: DevelopmentStatement
    revenue: RevenueStatement
    result: YearLoad
    pages: int
    retrieved: datetime


@pytest.fixture(scope="module")
def ingest() -> Iterator[Ingest]:
    pdf = ensure_pdf(SOURCE, DEFAULT_RAW_DIR)
    statement = parse_statement(extract_pages(pdf, SOURCE.operating_pages), SOURCE.fiscal_year)
    development = parse_development(extract_pages(pdf, SOURCE.development_pages), SOURCE.fiscal_year)
    revenue = parse_revenue(extract_pages(pdf, SOURCE.revenue_pages), SOURCE.fiscal_year)
    pages, retrieved = page_count(pdf), retrieved_at(pdf)
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        result = load_year(conn, SOURCE, statement, development, revenue, pages, retrieved)
        yield Ingest(conn, statement, development, revenue, result, pages, retrieved)


def scalar(conn: psycopg.Connection, sql: str) -> object:
    row = conn.execute(sql, (SOURCE.id,)).fetchone()
    assert row is not None
    return row[0]


def test_every_printed_total_reconciles(ingest: Ingest) -> None:
    assert ingest.result.operating.printed_totals == 2474
    assert ingest.result.operating.reconciled == 2474
    assert scalar(ingest.conn, "select count(*) from reconciliation where document_id = %s and not matches") == 0


def test_counts_and_statement_total(ingest: Ingest) -> None:
    r = ingest.result.operating
    assert (r.votes, r.programmes, r.activities, r.lines) == (53, 279, 1123, 2309)
    sql = "select actual_sen from printed_total where document_id = %s and scope = 'statement' and object_code is null"
    assert scalar(ingest.conn, sql) == 33_606_926_296_850
    by_section = dict(
        ingest.conn.execute(
            "select section, actual_sen from printed_total"
            " where document_id = %s and scope = 'section' and object_code is null",
            (SOURCE.id,),
        ).fetchall()
    )
    assert by_section == {"charged": 9_938_129_643_029, "supply": 23_668_796_653_821}
    assert (
        scalar(ingest.conn, "select sum(actual_sen) from operating_line where document_id = %s") == 33_606_926_296_850
    )


def test_every_row_cites_a_lampiran_1_page(ingest: Ingest) -> None:
    for table in ("operating_line", "printed_total"):
        bad = scalar(
            ingest.conn,
            f"select count(*) from {table} where document_id = %s"
            " and not (pdf_page between 105 and 211 and book_page = pdf_page - 14 and source_text <> '')",
        )
        assert bad == 0, table


def test_one_sen_edit_is_rejected_and_rolled_back(ingest: Ingest) -> None:
    first = ingest.statement.lines[0]
    edited = replace(first, amounts=replace(first.amounts, actual=first.amounts.actual + 1))
    bad = replace(ingest.statement, lines=(edited, *ingest.statement.lines[1:]))

    with pytest.raises(ReconciliationError) as error:
        load_year(ingest.conn, SOURCE, bad, ingest.development, ingest.revenue, ingest.pages, ingest.retrieved)

    # Every total above T.01 / 010100 / Emolumen: activity, programme (object and all),
    # vote (object and all), section (object and all), statement (object and all).
    mismatches = error.value.mismatches
    assert len(mismatches) == 9
    assert all(m.diffs_sen == (0, 0, 0, 0, -1) for m in mismatches)
    stored = ingest.conn.execute(
        "select actual_sen from operating_line where document_id = %s"
        " and (vote_code, activity_code, object_code) = (%s, %s, %s)",
        (SOURCE.id, first.vote_code, first.activity_code, first.object_code),
    ).fetchone()
    assert stored == (first.amounts.actual,)


def test_rerun_converges_to_the_same_rows(ingest: Ingest) -> None:
    again = load_year(
        ingest.conn, SOURCE, ingest.statement, ingest.development, ingest.revenue, ingest.pages, ingest.retrieved
    )
    assert again == ingest.result
    assert scalar(ingest.conn, "select count(*) from operating_line where document_id = %s") == 2309
    assert scalar(ingest.conn, "select count(*) from printed_total where document_id = %s") == 2474
    assert scalar(ingest.conn, "select count(*) from development_project where document_id = %s") == 918
    assert scalar(ingest.conn, "select count(*) from development_printed_total where document_id = %s") == 89
    assert scalar(ingest.conn, "select count(*) from revenue_line where document_id = %s") == 25
    assert scalar(ingest.conn, "select count(*) from revenue_total where document_id = %s") == 7


def test_every_development_total_reconciles(ingest: Ingest) -> None:
    d = ingest.result.development
    assert (d.votes, d.groups, d.projects, d.printed_totals, d.reconciled) == (31, 57, 918, 89, 89)
    sql = "select count(*) from development_reconciliation where document_id = %s and not matches"
    assert scalar(ingest.conn, sql) == 0


def test_development_statement_total(ingest: Ingest) -> None:
    row = ingest.conn.execute(
        "select estimate_sen, actual_direct_sen, actual_loan_sen, actual_sen from development_printed_total"
        " where document_id = %s and scope = 'statement'",
        (SOURCE.id,),
    ).fetchone()
    # Book p.235: Anggaran 83,867,723,620; Sebenar 80,563,809,466.06 + 1,356,716,647.35 = 81,920,526,113.41.
    assert row == (8_386_772_362_000, 8_056_380_946_606, 135_671_664_735, 8_192_052_611_341)
    assert scalar(ingest.conn, "select sum(actual_sen) from development_project where document_id = %s") == (
        8_192_052_611_341
    )


def test_every_development_row_cites_both_pages_of_its_spread(ingest: Ingest) -> None:
    for table in ("development_project", "development_printed_total"):
        bad = scalar(
            ingest.conn,
            f"select count(*) from {table} where document_id = %s and not ("
            " pdf_page between 214 and 248 and pdf_page %% 2 = 0 and book_page = pdf_page - 14"
            " and amounts_pdf_page = pdf_page + 1 and source_text <> '' and amounts_source_text <> '')",
        )
        assert bad == 0, table


def test_parent_groups_sum_their_members(ingest: Ingest) -> None:
    rows = ingest.conn.execute(
        "select p.vote_code, p.name_ms, count(m.*) from development_group p"
        " join development_group m on m.fiscal_year = p.fiscal_year and m.vote_code = p.vote_code"
        "  and m.parent_ordinal = p.ordinal"
        " where p.fiscal_year = 2025 group by 1, 2 order by 1",
    ).fetchall()
    assert rows == [
        ("P.23", "Perhutanan Semenanjung, Sarawak dan Sabah", 3),
        ("P.27", "Jalan Raya dan Jambatan Semenanjung, Sabah dan Sarawak", 3),
    ]


def test_one_sen_development_edit_is_rejected(ingest: Ingest) -> None:
    first = ingest.development.projects[0]  # P.06 00100, directly under the vote header
    edited = replace(first, amounts=replace(first.amounts, total_cost=first.amounts.total_cost + 1))
    bad = replace(ingest.development, projects=(edited, *ingest.development.projects[1:]))

    with pytest.raises(ReconciliationError) as error:
        load_year(ingest.conn, SOURCE, ingest.statement, bad, ingest.revenue, ingest.pages, ingest.retrieved)

    mismatches = error.value.mismatches
    assert [m.key for m in mismatches] == ["vote total vote=P.06", "statement total"]
    assert all(m.diffs_sen == (-1, 0, 0, 0, 0, 0, 0, 0, 0) for m in mismatches)
    stored = scalar(
        ingest.conn,
        "select total_cost_sen from development_project where document_id = %s and (vote_code, code) = ('P.06', '00100')",
    )
    assert stored == first.amounts.total_cost


@pytest.mark.parametrize(
    (
        "year",
        "operating_counts",
        "development_counts",
        "revenue_items",
        "operating_actual",
        "development_actual",
        "covid_actual",
        "revenue_actual",
    ),
    [
        # (votes, programmes, activities, leaf lines, printed totals); (votes, groups, projects, printed totals)
        # covid_actual: COVID-19 Fund (Lampiran 3) spending, None where the statement has no Lampiran 3.
        # revenue_actual: Note 5(a) HASIL, whole ringgit, within 50 sen of operating_actual.
        (
            2024,
            (53, 237, 1068, 2206, 2280),
            (31, 57, 923, 89),
            25,
            32_461_764_924_833,
            8_401_159_546_378,
            None,
            32_461_764_924_800,
        ),
        (
            2023,
            (51, 231, 1037, 2094, 2201),
            (30, 58, 856, 89),
            25,
            31_495_948_173_121,
            9_608_973_712_254,
            0,
            31_495_948_173_100,
        ),
        (
            2022,
            (52, 226, 1009, 2057, 2162),
            (29, 56, 746, 86),
            25,
            29_435_676_061_497,
            7_157_396_142_579,
            3_097_911_954_653,
            29_435_676_061_500,
        ),
        # FY2021 prints one programme total RM1,000,000 short of its rows (sources.KnownMisprint).
        # Its revenue note also lists the two GST items, all dashes.
        (
            2021,
            (52, 229, 1032, 2089, 2210),
            (31, 69, 1051, 101),
            27,
            23_375_205_502_913,
            6_425_666_575_457,
            3_771_101_636_510,
            23_375_205_502_900,
        ),
        # FY2020: Lampiran 1 has no text layer and is read by OCR (cached in data/ocr/janm/2020); 18 of
        # its totals disagree with their rows (sources.KnownMisprint). Lampiran 3 adds a withdrawal column.
        (
            2020,
            (53, 231, 1091, 2221, 2290),
            (31, 61, 968, 93),
            27,
            22_507_494_724_231,
            5_135_985_576_346,
            3_801_923_863_125,
            22_507_494_724_200,
        ),
        # FY2018 prints four columns in Lampiran 1 (no Tambahan or Viremen) and 18 totals that
        # disagree with their rows (sources.KnownMisprint): 17 in Lampiran 1, one in Lampiran 2.
        # FY2019: a page of Lampiran 1 is missing (sources.KnownGap); B.05's vote totals come from
        # Attachment 1. Six totals disagree with their rows (sources.KnownMisprint).
        (
            2019,
            (50, 202, 943, 1938, 1999),
            (28, 66, 819, 95),
            27,
            26_441_475_587_641,
            5_417_323_531_697,
            None,
            26_441_475_587_600,
        ),
        (
            2018,
            (52, 267, 1307, 2604, 2596),
            (29, 66, 911, 96),
            26,
            23_288_256_228_780,
            5_609_545_566_174,
            None,
            23_288_256_228_800,
        ),
        # FY2017: four columns; three Lampiran 1 totals disagree with their rows (sources.KnownMisprint).
        (
            2017,
            (50, 392, 1256, 2525, 2887),
            (27, 66, 743, 94),
            26,
            22_040_600_188_363,
            4_488_383_883_201,
            None,
            22_040_600_188_400,
        ),
        # FY2016: four columns; four Lampiran 1 totals disagree with their rows (sources.KnownMisprint).
        (
            2016,
            (50, 409, 1341, 2598, 3021),
            (27, 67, 952, 95),
            25,
            21_242_109_889_435,
            4_199_503_769_686,
            None,
            21_242_109_889_400,
        ),
    ],
)
def test_earlier_years_load_and_reconcile(
    year: int,
    operating_counts: tuple[int, ...],
    development_counts: tuple[int, ...],
    revenue_items: int,
    operating_actual: int,
    development_actual: int,
    covid_actual: int | None,
    revenue_actual: int,
) -> None:
    source = SOURCES[year]
    parsed = parse_year(source, DEFAULT_RAW_DIR)
    covid = parsed.covid
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        result = load_year(
            conn, source, parsed.operating, parsed.development, parsed.revenue, parsed.pages,
            retrieved_at(parsed.pdf), covid, parsed.operating_ocr_engine,
        )  # fmt: skip
        o, d = result.operating, result.development
        assert (o.votes, o.programmes, o.activities, o.lines, o.printed_totals) == operating_counts
        assert (d.votes, d.groups, d.projects, d.printed_totals) == development_counts
        # Every printed total reconciles except the registered misprints, in either appendix.
        unreconciled = (o.printed_totals - o.reconciled) + (d.printed_totals - d.reconciled)
        assert unreconciled == len(source.known_misprints) + o.over_gaps
        # FY2019's missing page leaves 29 totals that cannot be recomputed from their rows.
        assert o.over_gaps == (29 if year == 2019 else 0)
        r = result.revenue
        # FY2017 prints Cukai Langsung and Cukai Tak Langsung without amounts, FY2016 not at all: 5 printed totals.
        printed = 5 if year in (2016, 2017) else 7
        assert (r.items, r.printed_totals, r.reconciled) == (revenue_items, printed, printed)
        assert (r.actual_sen, r.operating_actual_sen) == (revenue_actual, operating_actual)
        row = conn.execute(
            "select operating_actual_sen, development_actual_sen, covid_fund_actual_sen"
            " from federal_spending where fiscal_year = %s",
            (year,),
        ).fetchone()
        assert row == (operating_actual, development_actual, covid_actual)
        if covid is not None:
            sql = "select matches, line_count from covid_fund_reconciliation where fiscal_year = %s"
            assert conn.execute(sql, (year,)).fetchone() == (True, 31)
        sql = "select operating_ocr_engine is not null from source_document where id = %s"
        assert conn.execute(sql, (source.id,)).fetchone() == (source.operating_ocr,)


def test_revenue_totals_reconcile_and_balance_operating_spending(ingest: Ingest) -> None:
    r = ingest.result.revenue
    assert (r.items, r.printed_totals, r.reconciled) == (25, 7, 7)
    # Book p.75: HASIL Sebenar 336,069,262,969; Lampiran 1 (book p.197) 336,069,262,968.50.
    assert (r.actual_sen, r.operating_actual_sen) == (33_606_926_296_900, 33_606_926_296_850)
    actual = dict(
        ingest.conn.execute(
            "select category::text, actual_sen from revenue_total where document_id = %s", (SOURCE.id,)
        ).fetchall()
    )
    assert actual == {
        "revenue": 33_606_926_296_900,
        "tax": 25_982_644_031_500,
        "direct_tax": 18_055_858_324_700,
        "indirect_tax": 7_926_785_706_800,
        "non_tax": 6_689_834_785_600,
        "non_revenue_receipts": 886_262_212_300,
        "federal_territory": 48_185_267_500,
    }


def test_every_revenue_row_cites_note_5(ingest: Ingest) -> None:
    for table in ("revenue_line", "revenue_total"):
        bad = scalar(
            ingest.conn,
            f"select count(*) from {table} where document_id = %s"
            " and not (pdf_page in (89, 90) and book_page = pdf_page - 14 and source_text <> '')",
        )
        assert bad == 0, table
    wrapped = scalar(
        ingest.conn,
        "select source_text from revenue_line where document_id = %s and name_ms = 'Duti Eksais Terhadap Barangan Tempatan'",
    )
    first, second = str(wrapped).split("\n")
    assert first.split() == (
        "Duti Eksais Terhadap Barangan 6,721,760,000 5,999,427,000 6,263,107,506 104.40 6,704,465,519 100.55".split()
    )
    assert second == "Tempatan"


def test_one_ringgit_revenue_item_edit_is_rejected_and_rolled_back(ingest: Ingest) -> None:
    first = ingest.revenue.items[0]  # Cukai Pendapatan, under Cukai Langsung
    assert (first.name, first.category) == ("Cukai Pendapatan", RevenueCategory.DIRECT_TAX)
    edited = replace(first, amounts=replace(first.amounts, actual=first.amounts.actual + 100))
    bad = replace(ingest.revenue, items=(edited, *ingest.revenue.items[1:]))

    with pytest.raises(ReconciliationError) as error:
        load_year(ingest.conn, SOURCE, ingest.statement, ingest.development, bad, ingest.pages, ingest.retrieved)

    mismatches = error.value.mismatches
    assert sorted(m.key for m in mismatches) == [
        "revenue total category=direct_tax",
        "revenue total category=revenue",
        "revenue total category=tax",
    ]
    assert all(m.diffs_sen == (0, 0, -100, 0) for m in mismatches)
    stored = scalar(
        ingest.conn, "select actual_sen from revenue_line where document_id = %s and name_ms = 'Cukai Pendapatan'"
    )
    assert stored == first.amounts.actual


def test_one_ringgit_edit_to_hasil_breaks_the_balance_with_operating_spending(ingest: Ingest) -> None:
    hasil = ingest.revenue.totals[0]
    edited = replace(hasil, amounts=replace(hasil.amounts, actual=hasil.amounts.actual + 100))
    bad = replace(ingest.revenue, totals=(edited, *ingest.revenue.totals[1:]))

    with pytest.raises(ReconciliationError) as error:
        load_year(ingest.conn, SOURCE, ingest.statement, ingest.development, bad, ingest.pages, ingest.retrieved)

    assert [(m.view, m.diffs_sen) for m in error.value.mismatches] == [
        ("revenue_reconciliation", (0, 0, 100, 0)),
        ("revenue_operating_balance", (150,)),
    ]


def test_a_revenue_line_it_cannot_place_stops_the_parse() -> None:
    pages = extract_pages(ensure_pdf(SOURCE, DEFAULT_RAW_DIR), SOURCE.revenue_pages)
    # A name printed above its amounts, at the row's own indent, would otherwise be read
    # as the end of the name above.
    lines = pages[1].layout.split("\n")
    at = next(i for i, line in enumerate(lines) if line.strip().startswith("Sewaan"))
    lines.insert(at, " " * (len(lines[at]) - len(lines[at].lstrip())) + "Sewaan Tanah")
    with pytest.raises(ParseError, match=f"pdf page 90, line {at + 1}: text line that does not continue"):
        parse_revenue([pages[0], replace(pages[1], layout="\n".join(lines))], SOURCE.fiscal_year)
