"""data.gov.my indicators: reading saved replies, and loading them (the load test needs PIPELINE_DATABASE_URL)."""

import json
import os
from datetime import date
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest

from pipeline.indicators import (
    Dataset,
    IndicatorError,
    latest_snapshot,
    load_snapshot,
    parse_page,
    read_snapshot,
)

DATABASE_URL = os.environ.get("PIPELINE_DATABASE_URL", "postgresql:///buildmalaysia_pipeline")

GDP = Dataset("gdp_gni_annual_nominal", ("series",))
LFS = Dataset("lfs_year", ())

GDP_FIELDS = [
    {"name": "series", "title": "Series Type", "description": "[String] 'abs' or 'growth_yoy'"},
    {"name": "date", "title": "Date", "description": "[Date] YYYY-MM-DD"},
    {"name": "gdp", "title": "GDP", "description": "[Float, RM mil] at current prices"},
    {"name": "gdp_capita", "title": "GDP per capita", "description": "[Float, RM] at current prices"},
]
LFS_FIELDS = [
    {"name": "date", "title": "Date", "description": "[Date] YYYY-MM-DD"},
    {"name": "u_rate", "title": "Unemployment Rate", "description": "[Float] Ratio of unemployed to labour force"},
]
# As the API prints them, decimals and all.
GDP_ROWS = (
    '[{"gdp": 4.7, "date": "2025-01-01", "series": "growth_yoy", "gdp_capita": 4.1},'
    ' {"gdp": 2023075.573, "date": "2025-01-01", "series": "abs", "gdp_capita": 59099.51863891292},'
    ' {"gdp": null, "date": "1954-01-01", "series": "abs", "gdp_capita": null}]'
)
LFS_ROWS = '[{"date": "2024-01-01", "u_rate": 3.2}, {"date": "2025-01-01", "u_rate": 3.0}]'


def page_html(dataset_id: str, fields: list[dict], title: str = "A title") -> str:
    props = {
        "params": {"id": dataset_id},
        "title": title,
        "description": "What it is.",
        "fields": fields,
        "data_source": ["DOSM"],
        "frequency": "YEARLY",
        "link_csv": f"https://storage.dosm.gov.my/{dataset_id}.csv",
    }
    data = json.dumps({"props": {"pageProps": props}})
    return f'<html><body><script id="__NEXT_DATA__" type="application/json">{data}</script></body></html>'


def api_body(dataset_id: str, rows: str, total: int | None = None) -> str:
    count = len(json.loads(rows)) if total is None else total
    meta = {"catalogue_id": dataset_id, "data_as_of": "2025", "last_updated": "2026-02-13 12:00", "total": count}
    return f'{{"meta": {json.dumps(meta)}, "data": {rows}}}'


def save(folder: Path, kind: str, dataset: Dataset, body: str) -> None:
    path = folder / kind / f"{dataset.id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    url = dataset.api_url if kind == "api" else dataset.page_url
    path.write_text(json.dumps({"url": url, "retrieved_at": "2026-11-10T02:09:21+08:00", "body": body}))


def snapshot(tmp_path: Path, gdp_rows: str = GDP_ROWS, gdp_total: int | None = None, gdp_fields=GDP_FIELDS) -> Path:
    folder = tmp_path / "datagovmy" / "2026-11-10"
    save(folder, "api", GDP, api_body(GDP.id, gdp_rows, gdp_total))
    save(folder, "page", GDP, page_html(GDP.id, gdp_fields, "Annual Nominal GDP & GNI: 1947 to Present"))
    save(folder, "api", LFS, api_body(LFS.id, LFS_ROWS))
    save(folder, "page", LFS, page_html(LFS.id, LFS_FIELDS))
    return folder


def test_figures_keep_the_decimal_the_api_printed(tmp_path: Path) -> None:
    snap = read_snapshot(snapshot(tmp_path), (GDP, LFS))
    gdp = snap.datasets[0]
    assert gdp.title == "Annual Nominal GDP & GNI: 1947 to Present"
    assert gdp.publisher == ("DOSM",)
    assert gdp.rows == 3
    assert gdp.page_url == "https://data.gov.my/data-catalogue/gdp_gni_annual_nominal"
    assert gdp.api_url == "https://api.data.gov.my/data-catalogue/?id=gdp_gni_annual_nominal&meta=true"
    by = {(v.date, v.dims["series"], v.measure): v.value for v in gdp.values}
    assert by[(date(2025, 1, 1), "abs", "gdp")] == Decimal("2023075.573")
    assert by[(date(2025, 1, 1), "abs", "gdp_capita")] == Decimal("59099.51863891292")
    assert by[(date(2025, 1, 1), "growth_yoy", "gdp")] == Decimal("4.7")
    assert by[(date(1954, 1, 1), "abs", "gdp")] is None  # printed as null, kept as null
    lfs = snap.datasets[1]
    assert [(v.date.year, v.dims, v.measure, v.value) for v in lfs.values] == [
        (2024, {}, "u_rate", Decimal("3.2")),
        (2025, {}, "u_rate", Decimal("3.0")),
    ]


def test_a_reply_short_of_its_reported_total_is_refused(tmp_path: Path) -> None:
    with pytest.raises(IndicatorError, match="3 rows returned, the API reports 4"):
        read_snapshot(snapshot(tmp_path, gdp_total=4), (GDP, LFS))


def test_a_column_the_catalogue_does_not_define_is_refused(tmp_path: Path) -> None:
    rows = '[{"gdp": 1.0, "date": "2025-01-01", "series": "abs", "gdp_real": 2.0}]'
    with pytest.raises(IndicatorError, match=r"columns \['gdp_real'\] are not in the catalogue's fields"):
        read_snapshot(snapshot(tmp_path, gdp_rows=rows), (GDP, LFS))


def test_a_text_figure_is_refused(tmp_path: Path) -> None:
    rows = '[{"gdp": "1,234", "date": "2025-01-01", "series": "abs"}]'
    with pytest.raises(IndicatorError, match="gdp is '1,234'"):
        read_snapshot(snapshot(tmp_path, gdp_rows=rows), (GDP, LFS))


def test_a_figure_published_twice_is_refused(tmp_path: Path) -> None:
    rows = '[{"gdp": 1.0, "date": "2025-01-01", "series": "abs"}, {"gdp": 1.0, "date": "2025-01-01", "series": "abs"}]'
    with pytest.raises(IndicatorError, match="published twice"):
        read_snapshot(snapshot(tmp_path, gdp_rows=rows), (GDP, LFS))


def test_a_row_missing_its_dimension_is_refused(tmp_path: Path) -> None:
    rows = '[{"gdp": 1.0, "date": "2025-01-01"}]'
    with pytest.raises(IndicatorError, match="series is None, expected a string"):
        read_snapshot(snapshot(tmp_path, gdp_rows=rows), (GDP, LFS))


def test_a_catalogue_page_without_its_data_is_refused() -> None:
    with pytest.raises(IndicatorError, match="carries no __NEXT_DATA__"):
        parse_page("<html></html>", "lfs_year")
    with pytest.raises(IndicatorError, match="describes gdp_gni_annual_real"):
        parse_page(page_html("gdp_gni_annual_real", LFS_FIELDS), "lfs_year")


def test_a_missing_reply_names_the_file(tmp_path: Path) -> None:
    folder = snapshot(tmp_path)
    (folder / "page" / "lfs_year.json").unlink()
    with pytest.raises(IndicatorError, match="lfs_year.json is missing"):
        read_snapshot(folder, (GDP, LFS))


def test_the_newest_snapshot_is_loaded(tmp_path: Path) -> None:
    for day in ("2026-10-01", "2026-11-10", "2026-09-30"):
        (tmp_path / "datagovmy" / day).mkdir(parents=True)
    assert latest_snapshot(tmp_path).name == "2026-11-10"
    with pytest.raises(IndicatorError, match="run fetch-indicators first"):
        latest_snapshot(tmp_path / "empty")


@pytest.mark.integration
def test_load_replaces_the_tables_with_the_figures_as_published(tmp_path: Path) -> None:
    with psycopg.connect(DATABASE_URL) as conn:
        result = load_snapshot(conn, snapshot(tmp_path), (GDP, LFS))
        assert (result.datasets, result.values) == (2, 8)
        rows = conn.execute(
            "select dataset_id, date, dims, measure, value::text from indicator_value"
            " order by dataset_id, measure, dims::text, date"
        ).fetchall()
        assert ("gdp_gni_annual_nominal", date(2025, 1, 1), {"series": "abs"}, "gdp", "2023075.573") in rows
        assert ("gdp_gni_annual_nominal", date(1954, 1, 1), {"series": "abs"}, "gdp", None) in rows
        assert ("lfs_year", date(2025, 1, 1), {}, "u_rate", "3.0") in rows
        (fields,) = conn.execute("select fields from indicator_dataset where id = 'lfs_year'").fetchone()
        assert fields == LFS_FIELDS
        # A second load replaces the first rather than adding to it.
        load_snapshot(conn, snapshot(tmp_path), (GDP, LFS))
        assert conn.execute("select count(*) from indicator_value").fetchone() == (8,)
        assert conn.execute("select id, datasets, figures from indicator_snapshot").fetchall() == [("2026-11-10", 2, 8)]
