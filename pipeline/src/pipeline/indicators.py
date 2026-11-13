"""Economic indicators from data.gov.my's open API (CC BY 4.0): GDP, CPI inflation, unemployment and federal debt.

Each dataset is read twice: its rows from the API (`https://api.data.gov.my/data-catalogue/?id=<id>&meta=true`),
and its title, publisher and field definitions from its catalogue page (`https://data.gov.my/data-catalogue/<id>`),
which carries them in the page's Next.js data. Both replies are saved whole under one dated folder, with the URL and
the time each was retrieved. The rows are loaded as published: every string column listed in `Dataset.dims` names the
row, every other column is a published figure, stored in `indicator_value` with its own name and the exact decimal the
API printed. Nothing is converted, rounded or typed in; ratios the site shows are worked out from these rows when a
page is rendered.

`fetch_snapshot` saves the replies; `read_snapshot` parses and checks them; `load_snapshot` replaces the three tables
in one transaction.
"""

import json
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import certifi
import psycopg
from psycopg.types.json import Jsonb

from pipeline.sources import DEFAULT_RAW_DIR

API = "https://api.data.gov.my/data-catalogue/"
CATALOGUE = "https://data.gov.my/data-catalogue/"
USER_AGENT = "buildmalaysia-pipeline (+https://buildmalaysia.com/about)"
PAUSE_SECONDS = 1.0  # between requests; the open API limits requests per minute
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.DOTALL)


class IndicatorError(Exception):
    pass


@dataclass(frozen=True)
class Dataset:
    id: str
    dims: tuple[str, ...]  # the string columns that, with the date, name a row

    @property
    def api_url(self) -> str:
        return f"{API}?{urllib.parse.urlencode({'id': self.id, 'meta': 'true'})}"

    @property
    def page_url(self) -> str:
        return f"{CATALOGUE}{self.id}"


DATASETS: tuple[Dataset, ...] = (
    Dataset("gdp_gni_annual_nominal", ("series",)),
    Dataset("gdp_gni_annual_real", ("series",)),
    Dataset("cpi_annual_inflation", ("division",)),
    Dataset("lfs_year", ()),
    Dataset("federal_finance_year", ("category", "variable")),
    Dataset("federal_finance_year_debt_mat", ("type", "sector", "maturity")),
)


# --- Fetching -------------------------------------------------------------------------------------------------


def _get(url: str) -> bytes:
    context = ssl.create_default_context(cafile=certifi.where())
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=120, context=context) as response:
                content = response.read()
            time.sleep(PAUSE_SECONDS)
            return content
        except urllib.error.HTTPError as error:
            # A 404 is a dataset that has gone; only a rate limit or a server error is worth retrying.
            if error.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise IndicatorError(f"{url}: HTTP {error.code}") from error
            wait = error.headers.get("Retry-After")
            time.sleep(int(wait) if wait and wait.isdigit() else 5 * 2**attempt)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            if attempt == 4:
                raise IndicatorError(f"{url}: gave up after 5 attempts: {error}") from error
            time.sleep(5 * 2**attempt)
    raise AssertionError("unreachable")


def snapshot_dir(raw_dir: Path, day: date) -> Path:
    return raw_dir / "datagovmy" / day.isoformat()


def _save(path: Path, url: str, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"url": url, "retrieved_at": datetime.now().astimezone().isoformat(timespec="seconds"), "body": body}
    partial = path.with_suffix(f".{os.getpid()}.part")
    partial.write_text(json.dumps(record, ensure_ascii=False))
    partial.rename(path)


def fetch_snapshot(
    raw_dir: Path = DEFAULT_RAW_DIR, day: date | None = None, datasets: tuple[Dataset, ...] = DATASETS, log=print
) -> Path:
    """Save each dataset's API reply and catalogue page under data/raw/datagovmy/<day>/. Files already saved are kept,
    so an interrupted fetch resumes."""
    folder = snapshot_dir(raw_dir, day or date.today())
    for d in datasets:
        for path, url in ((folder / "api" / f"{d.id}.json", d.api_url), (folder / "page" / f"{d.id}.json", d.page_url)):
            if not path.exists():
                _save(path, url, _get(url).decode("utf-8"))
        log(f"{d.id}: saved")
    return folder


# --- Reading --------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Field:
    name: str
    title: str
    description: str


@dataclass(frozen=True)
class Value:
    date: date
    dims: dict[str, str]
    measure: str
    value: Decimal | None


@dataclass(frozen=True)
class Catalogued:
    """One dataset as saved: what the catalogue says about it, and its rows."""

    id: str
    title: str
    description: str
    publisher: tuple[str, ...]
    frequency: str
    data_as_of: str
    last_updated: str
    page_url: str
    api_url: str
    csv_url: str | None
    fields: tuple[Field, ...]
    retrieved_at: str
    page_retrieved_at: str
    rows: int
    values: tuple[Value, ...]


@dataclass(frozen=True)
class Snapshot:
    id: str
    datasets: tuple[Catalogued, ...]
    first_at: datetime
    last_at: datetime


def _record(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as error:
        raise IndicatorError(f"{path} is missing; the fetch did not finish") from error


def parse_page(html: str, dataset_id: str) -> dict:
    """The catalogue page's own description of a dataset, from the data its Next.js page is rendered with."""
    found = NEXT_DATA.search(html)
    if not found:
        raise IndicatorError(f"{dataset_id}: the catalogue page carries no __NEXT_DATA__; the page has changed")
    props = json.loads(found.group(1)).get("props", {}).get("pageProps", {})
    missing = [k for k in ("title", "description", "fields", "data_source", "frequency") if not props.get(k)]
    if missing:
        raise IndicatorError(f"{dataset_id}: the catalogue page gives no {', '.join(missing)}")
    if (props.get("params") or {}).get("id", dataset_id) != dataset_id:
        raise IndicatorError(f"{dataset_id}: the catalogue page describes {props['params']['id']}")
    return props


def parse_rows(body: str, dataset: Dataset, field_names: set[str]) -> tuple[dict, list[Value]]:
    """The API reply's metadata and its rows, one Value per published figure. Numbers keep the exact decimal printed."""
    reply = json.loads(body, parse_float=Decimal, parse_int=Decimal)
    if not isinstance(reply, dict) or "meta" not in reply or "data" not in reply:
        raise IndicatorError(f"{dataset.id}: the API reply has no meta and data; asked without meta=true?")
    meta, rows = reply["meta"], reply["data"]
    if meta.get("catalogue_id") != dataset.id:
        raise IndicatorError(f"{dataset.id}: the API replied for {meta.get('catalogue_id')!r}")
    if int(meta.get("total", -1)) != len(rows):
        raise IndicatorError(f"{dataset.id}: {len(rows)} rows returned, the API reports {meta.get('total')}")
    if not rows:
        raise IndicatorError(f"{dataset.id}: no rows")
    values: list[Value] = []
    seen: set[tuple] = set()
    for n, row in enumerate(rows):
        unknown = set(row) - field_names
        if unknown:
            raise IndicatorError(f"{dataset.id} row {n}: columns {sorted(unknown)} are not in the catalogue's fields")
        text = row.get("date")
        if not isinstance(text, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            raise IndicatorError(f"{dataset.id} row {n}: date {text!r} is not YYYY-MM-DD")
        dims: dict[str, str] = {}
        for name in dataset.dims:
            if not isinstance(row.get(name), str):
                raise IndicatorError(f"{dataset.id} row {n}: {name} is {row.get(name)!r}, expected a string")
            dims[name] = row[name]
        for name, value in row.items():
            if name == "date" or name in dataset.dims:
                continue
            if value is not None and not isinstance(value, Decimal):
                raise IndicatorError(f"{dataset.id} row {n}: {name} is {value!r}; a new kind of column?")
            key = (text, tuple(sorted(dims.items())), name)
            if key in seen:
                raise IndicatorError(f"{dataset.id}: {name} on {text} {dims} is published twice")
            seen.add(key)
            values.append(Value(date.fromisoformat(text), dims, name, value))
    return meta, values


def read_dataset(folder: Path, dataset: Dataset) -> Catalogued:
    api = _record(folder / "api" / f"{dataset.id}.json")
    page = _record(folder / "page" / f"{dataset.id}.json")
    props = parse_page(page["body"], dataset.id)
    fields = tuple(Field(f["name"], f.get("title") or f["name"], f.get("description") or "") for f in props["fields"])
    names = {f.name for f in fields}
    missing = (set(dataset.dims) | {"date"}) - names
    if missing:
        raise IndicatorError(f"{dataset.id}: the catalogue lists no field {sorted(missing)}")
    meta, values = parse_rows(api["body"], dataset, names)
    return Catalogued(
        id=dataset.id,
        title=props["title"],
        description=props["description"],
        publisher=tuple(props["data_source"]),
        frequency=props["frequency"],
        data_as_of=str(meta.get("data_as_of") or props.get("data_as_of") or ""),
        last_updated=str(meta.get("last_updated") or props.get("last_updated") or ""),
        page_url=page["url"],
        api_url=api["url"],
        csv_url=props.get("link_csv") or None,
        fields=fields,
        retrieved_at=api["retrieved_at"],
        page_retrieved_at=page["retrieved_at"],
        rows=int(meta["total"]),
        values=tuple(values),
    )


def read_snapshot(folder: Path, datasets: tuple[Dataset, ...] = DATASETS) -> Snapshot:
    read = tuple(read_dataset(folder, d) for d in datasets)
    stamps = sorted(datetime.fromisoformat(t) for c in read for t in (c.retrieved_at, c.page_retrieved_at))
    return Snapshot(folder.name, read, stamps[0], stamps[-1])


def latest_snapshot(raw_dir: Path = DEFAULT_RAW_DIR) -> Path:
    folders = sorted(p for p in (raw_dir / "datagovmy").glob("????-??-??") if p.is_dir())
    if not folders:
        raise IndicatorError(f"no snapshot under {raw_dir / 'datagovmy'}; run fetch-indicators first")
    return folders[-1]


# --- Loading --------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class LoadResult:
    datasets: int
    values: int
    by_dataset: dict[str, tuple[int, int, date, date]]  # id: (published rows, figures, first date, last date)


def load_snapshot(conn: psycopg.Connection, folder: Path, datasets: tuple[Dataset, ...] = DATASETS) -> LoadResult:
    snap = read_snapshot(folder, datasets)
    total = sum(len(c.values) for c in snap.datasets)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("truncate indicator_value, indicator_dataset, indicator_snapshot")
        cur.execute(
            "insert into indicator_snapshot (id, first_at, last_at, datasets, figures) values (%s, %s, %s, %s, %s)",
            (snap.id, snap.first_at, snap.last_at, len(snap.datasets), total),
        )
        for c in snap.datasets:
            cur.execute(
                "insert into indicator_dataset (id, title, description, publisher, frequency, data_as_of,"
                " last_updated, page_url, api_url, csv_url, fields, retrieved_at, page_retrieved_at, published_rows,"
                " snapshot_id) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    c.id, c.title, c.description, list(c.publisher), c.frequency, c.data_as_of, c.last_updated,
                    c.page_url, c.api_url, c.csv_url,
                    Jsonb([{"name": f.name, "title": f.title, "description": f.description} for f in c.fields]),
                    c.retrieved_at, c.page_retrieved_at, c.rows, snap.id,
                ),
            )  # fmt: skip
        with cur.copy("copy indicator_value (dataset_id, date, dims, measure, value) from stdin") as copy:
            for c in snap.datasets:
                for v in c.values:
                    copy.write_row((c.id, v.date, json.dumps(v.dims, sort_keys=True), v.measure, v.value))
        cur.execute("select count(*) from indicator_value")
        (loaded,) = cur.fetchone()
        if loaded != total:
            raise IndicatorError(f"loaded {loaded} figures into indicator_value, expected {total}")
    by = {
        c.id: (c.rows, len(c.values), min(v.date for v in c.values), max(v.date for v in c.values))
        for c in snap.datasets
    }
    return LoadResult(len(snap.datasets), total, by)
