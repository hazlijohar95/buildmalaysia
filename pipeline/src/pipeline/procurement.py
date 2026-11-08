"""MyProcurement's published award results: tenders, quotations and direct negotiations.

MyProcurement (Bahagian Perolehan Kerajaan, Kementerian Kewangan) lists every published result as cards rendered
server-side and served through `/procurements/fetch` as HTML fragments, 100 to a page. `fetch_snapshot` saves every
page of every listing under one dated folder; `parse_page` reads a page's cards; `load_snapshot` replaces the
procurement tables from a snapshot in one transaction, and only after every listing's card count matches the total
the site reported for it and every card's two printings of its winners agree.
"""

import hashlib
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
from html import unescape
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Literal

import certifi
import psycopg

from pipeline.sources import DEFAULT_RAW_DIR

BASE = "https://myprocurement.treasury.gov.my"
PER_PAGE = 100  # the most the endpoint returns, whatever is asked for
USER_AGENT = "buildmalaysia-pipeline (+https://buildmalaysia.com/about)"
PAUSE_SECONDS = 0.5  # between requests, so a full fetch never loads the site

Kind = Literal["tender", "quotation", "direct"]
Filters = tuple[tuple[str, str], ...]  # the endpoint's own filters, as (parameter, value) pairs


class ProcurementError(Exception):
    pass


@dataclass(frozen=True)
class Listing:
    kind: Kind
    type: str  # the endpoint's `type`
    category: str  # the endpoint's `category`
    path: str  # the listing's page, which issues the session and its CSRF token

    @property
    def slug(self) -> str:
        return f"{self.type}-{self.category}"

    @property
    def url(self) -> str:
        return BASE + self.path


LISTINGS: tuple[Listing, ...] = (
    Listing("tender", "results", "tender", "/results/tender"),
    Listing("tender", "archive", "results-tender", "/archive/results-tender"),
    Listing("quotation", "results", "quotation", "/results/quotation"),
    Listing("quotation", "archive", "results-quotation", "/archive/results-quotation"),
    Listing("direct", "archive", "direct-negotiations", "/archive/direct-negotiations"),
)


@dataclass(frozen=True)
class Award:
    ordinal: int
    supplier: str
    amount_sen: int | None


@dataclass(frozen=True)
class Notice:
    kind: Kind
    id: int  # MyProcurement's own id, unique within a kind
    listing: str  # the Listing.slug it was read from
    reference: str | None  # No. Tender / No. Sebut Harga; direct negotiations print none
    title: str
    ministry: str
    agency: str
    category: str
    result_date: date | None  # Tarikh Keputusan; None where the site prints "Tiada Maklumat"
    shown_date: date  # Tarikh Paparan Keputusan, or Tarikh Permohonan for a direct negotiation
    source_url: str  # the notice's own page, or for a direct negotiation (which has none) its listing
    criterion: str | None  # Kriteria Rundingan Terus, direct negotiations only
    awards: tuple[Award, ...]


# --- Fetching -------------------------------------------------------------------------------------------------


class _Session:
    def __init__(self) -> None:
        context = ssl.create_default_context(cafile=certifi.where())
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(CookieJar()), urllib.request.HTTPSHandler(context=context)
        )
        self.token: str | None = None

    def _get(self, url: str, headers: dict[str, str]) -> bytes:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **headers})
        with self.opener.open(request, timeout=90) as response:
            return response.read()

    def open_listing(self, listing: Listing) -> None:
        page = self._get(listing.url, {}).decode("utf-8")
        found = re.search(r'name="csrf-token" content="([^"]+)"', page)
        if not found:
            raise ProcurementError(f"{listing.url} carries no CSRF token; the page has changed")
        self.token = found.group(1)

    def fetch_page(self, listing: Listing, page: int, day: date | None = None, filters: Filters = ()) -> dict:
        params = {"type": listing.type, "category": listing.category, "itemsPerPage": PER_PAGE, "page": page}
        if day:
            # Filters on the date the listing sorts by: Tarikh Paparan Keputusan, or Tarikh Permohonan.
            params |= {"date_start": day.isoformat(), "date_end": day.isoformat()}
        params |= dict(filters)
        query = urllib.parse.urlencode(params)
        headers = {"Accept": "application/json", "X-CSRF-TOKEN": self.token or ""}
        body = json.loads(self._get(f"{BASE}/procurements/fetch?{query}", headers))
        for field in ("html", "total", "page", "lastPage"):
            if field not in body:
                raise ProcurementError(f"{listing.slug} page {page}: the response has no {field!r}")
        return body


def snapshot_dir(raw_dir: Path, day: date) -> Path:
    return raw_dir / "myprocurement" / day.isoformat()


def fetch_snapshot(
    raw_dir: Path = DEFAULT_RAW_DIR, day: date | None = None, log=print, only: tuple[str, ...] = ()
) -> Path:
    """Save every page of every listing under data/raw/myprocurement/<day>/. Pages already saved are kept, so an
    interrupted fetch resumes where it stopped.

    MyProcurement sorts a listing by date alone, so results published the same day come back in a different order
    on each request, and a day that crosses a page boundary loses some results to the next page's repeats. After
    the pages, each such day is read again on its own through the listing's date filter, split further where it
    needs more than one page, until every one of its results has been seen (see `straddling_days` and
    `fetch_day`)."""
    folder = snapshot_dir(raw_dir, day or date.today())
    session = _Session()
    for listing in LISTINGS:
        if only and listing.slug not in only:
            continue
        out = folder / listing.slug
        out.mkdir(parents=True, exist_ok=True)
        session.open_listing(listing)
        page, last = 1, None
        while last is None or page <= last:
            path = out / f"{page:05d}.json"
            if path.exists():
                last = json.loads(path.read_text())["lastPage"]
            else:
                body = _fetch(session, listing, page)
                _save(path, body)
                last = body["lastPage"]
            if page == 1 or page % 50 == 0 or page == last:
                log(f"{listing.slug}: page {page} of {last}")
            page += 1
        for straddling in straddling_days(out, listing):
            fetch_day(session, listing, out, straddling, log)
    return folder


def _fetch(session: _Session, listing: Listing, page: int, day: date | None = None, filters: Filters = ()) -> dict:
    body = _with_retries(
        lambda: session.fetch_page(listing, page, day, filters),
        lambda: session.open_listing(listing),
    )
    body["retrieved_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    time.sleep(PAUSE_SECONDS)
    return body


def _save(path: Path, body: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(f".{os.getpid()}.part")  # two fetches may share a folder
    partial.write_text(json.dumps(body, ensure_ascii=False))
    partial.rename(path)


def _sort_date(notice: Notice) -> date:
    return notice.shown_date


def straddling_days(out: Path, listing: Listing) -> list[date]:
    """The days whose results run across a page boundary: the only place a listing sorted by date can lose one."""
    days: set[date] = set()
    previous: date | None = None
    for path in sorted(out.glob("*.json")):
        notices = parse_page(json.loads(path.read_text())["html"], listing)
        if notices and previous is not None and _sort_date(notices[0]) == previous:
            days.add(previous)
        previous = _sort_date(notices[-1]) if notices else previous
    return sorted(days)


def day_dir(out: Path, day: date) -> Path:
    return out / "days" / day.isoformat()


# The endpoint's filters that match one of a result's printed fields exactly, and that field. Direct negotiations
# have no category filter and no procurement number.
NAME_FILTERS = {"procurement_category": "category", "procurement_ministry": "ministry", "procurement_agency": "agency"}
CATEGORIES = ("Bekalan", "Kerja", "Perkhidmatan Bukan Perunding", "Perkhidmatan Perunding")
# Every character procurement numbers use. The site matches a number filter as a case-insensitive prefix, and
# treats `%` and `_` as wildcards, so neither can be part of one.
NUMBER_CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ&()*,-./:;?["
MAX_PREFIX = 40


def fetch_day(session: _Session, listing: Listing, out: Path, day: date, log=print) -> None:
    """Read one day's results through the date filter until the distinct results seen number the total the site
    reports for that day.

    Results that need more than one page come back in an order that misses some of them on every read, while one
    page comes back whole. So a day too big for a page is split until each slice fits: by category, then ministry,
    then agency, then by the leading characters of the procurement number. Ministries and agencies are taken from
    the results already read, as old ones keep their old names, and the site matches them loosely (a ministry's name
    also matches a longer one it begins), so slices can overlap. A slice counts as read once the distinct results
    its own pages and its narrower slices returned number its total; where the slices by name fall short, the slice
    is split by number, which reaches every result. Every page is saved with its filters, so the load can check the
    same."""
    folder = day_dir(out, day)
    if read_day(folder, listing) is not None:
        return
    seen: dict[int, Notice] = {}

    def read(filters: Filters) -> tuple[int, set[int]]:
        """Read every page of one slice: the total the site reports for it, and the results its pages returned."""
        page, last, total, ids = 1, 1, 0, set()
        while page <= last:
            body = _fetch(session, listing, page, day, filters)
            body["filters"] = [list(f) for f in filters]
            _save(folder / f"{_slice_name(filters)}-{page:03d}.json", body)
            notices = parse_page(body["html"], listing)
            seen.update((n.id, n) for n in notices)
            ids |= {n.id for n in notices}
            last, total = body["lastPage"], body["total"]
            page += 1
        return total, ids

    # Each split returns the results its slice's reads reached. A narrower slice adds a filter to its wider one, so
    # what it reaches belongs to the wider slice too, and a slice is whole once it has reached its total.
    def by_name(filters: Filters, total: int, reached: set[int], fields: tuple[str, ...]) -> set[int]:
        if fields and len(reached) < total:
            field, rest = fields[0], fields[1:]
            for value in CATEGORIES if field == "procurement_category" else _names(seen, reached, field):
                narrower = (*filters, (field, value))
                reached = reached | by_name(narrower, *read(narrower), rest)
        if len(reached) < total and listing.kind != "direct":
            reached = by_number(filters, "", total, reached)
        return reached

    def by_number(filters: Filters, prefix: str, total: int, reached: set[int]) -> set[int]:
        if len(reached) >= total or len(prefix) >= MAX_PREFIX:
            return reached
        numbers = [r for r in _numbers(seen, reached) if r.startswith(prefix)]
        # Most slices share a long prefix (QT190000000…): try it in one step before going a character at a time.
        common = os.path.commonprefix(numbers)
        if len(common) > len(prefix) and _is_number_prefix(common):
            found, ids = read(_with_number(filters, common))
            reached = reached | ids
            if found == total:
                return by_number(filters, common, total, reached)
        known = sorted({r[len(prefix)] for r in numbers if len(r) > len(prefix)} & set(NUMBER_CHARACTERS))
        for character in [*known, *(c for c in NUMBER_CHARACTERS if c not in known)]:
            if len(reached) >= total:
                break
            found, ids = read(_with_number(filters, prefix + character))
            if found:
                reached = reached | by_number(filters, prefix + character, found, ids)
        return reached

    total, ids = read(())
    reached = by_name(
        (), total, ids, tuple(f for f in NAME_FILTERS if listing.kind != "direct" or f != "procurement_category")
    )
    if len(reached) < total:
        raise ProcurementError(f"{listing.slug}: {day} gave {len(reached)} of {total} results, split as far as it goes")
    log(f"{listing.slug}: {day} read whole ({total} results)")


def _names(seen: dict[int, Notice], reached: set[int], field: str) -> list[str]:
    return sorted({getattr(seen[i], NAME_FILTERS[field]) for i in reached})


def _numbers(seen: dict[int, Notice], reached: set[int]) -> list[str]:
    return [seen[i].reference.upper() for i in reached if seen[i].reference]


def _is_number_prefix(prefix: str) -> bool:
    return all(c in NUMBER_CHARACTERS for c in prefix)


def _with_number(filters: Filters, prefix: str) -> Filters:
    return (*filters, ("procurement_number", prefix))


def _slice_name(filters: Filters) -> str:
    """A slice's file name: `all` for the whole day, else a short hash of its filters (which the page records)."""
    if not filters:
        return "all"
    return hashlib.sha1(urllib.parse.urlencode(filters).encode()).hexdigest()[:12]


def read_day(folder: Path, listing: Listing) -> list[tuple[Notice, str]] | None:
    """A day fetched whole: every distinct result on its pages, or None when they don't cover the total the site
    reported for the whole, unfiltered day (or there are none)."""
    pages = sorted(folder.glob("*.json"))
    found: dict[int, tuple[Notice, str]] = {}
    total = None
    for path in pages:
        body = json.loads(path.read_text())
        if not body.get("filters"):
            total = max(total or 0, body["total"])
        for notice in parse_page(body["html"], listing):
            found.setdefault(notice.id, (notice, body["retrieved_at"]))
    return list(found.values()) if total is not None and len(found) >= total else None


def _with_retries(call, reopen, attempts: int = 5):
    for attempt in range(attempts):
        try:
            return call()
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ConnectionError) as error:
            if attempt == attempts - 1:
                raise ProcurementError(f"gave up after {attempts} attempts: {error}") from error
            # 419 is Laravel's expired-session reply: get a fresh token before trying again.
            if isinstance(error, urllib.error.HTTPError) and error.code in (401, 403, 419):
                reopen()
            time.sleep(5 * 2**attempt)
    raise AssertionError("unreachable")


# --- Parsing --------------------------------------------------------------------------------------------------

CARD_START = 'x-data="{ selected: false, open: true }"'
_SPACE = re.compile(r"\s+")


def _text(fragment: str) -> str:
    return _SPACE.sub(" ", unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


# MyProcurement prints the Unix epoch where a result has no decision date.
NO_DATE = date(1970, 1, 1)


def _date(value: str) -> date | None:
    if value.strip().lower() == "tiada maklumat":
        return None
    parsed = datetime.strptime(value.strip(), "%d/%m/%Y").date()
    return None if parsed == NO_DATE else parsed


def parse_ringgit(value: str) -> int | None:
    """'1,396,812.00' or 'RM 3,791,097.00' to sen; None for 'Tiada Maklumat' or an empty cell."""
    cleaned = value.replace("RM", "").replace(",", "").strip()
    if not cleaned or cleaned.lower() == "tiada maklumat":
        return None
    if not re.fullmatch(r"-?\d+(\.\d{1,2})?", cleaned):
        raise ProcurementError(f"not an amount in ringgit: {value!r}")
    return int((Decimal(cleaned) * 100).to_integral_exact())


def _required(pattern: str, card: str, what: str, notice_id: str) -> str:
    found = re.search(pattern, card, re.DOTALL)
    if not found:
        raise ProcurementError(f"notice {notice_id}: no {what}")
    return found.group(1)


def _field(card: str, label: str, notice_id: str) -> str:
    # Results print "<div …>Kementerian:</div> <div …>VALUE</div>"; direct negotiations "<span …>Kementerian</span>: VALUE".
    found = re.search(rf">{re.escape(label)}:</div>\s*<div[^>]*>(.*?)</div>", card, re.DOTALL) or re.search(
        rf">{re.escape(label)}</span>:(.*?)</div>", card, re.DOTALL
    )
    if not found:
        raise ProcurementError(f"notice {notice_id}: no {label}")
    return _text(found.group(1))


def _awards(card: str, notice_id: str) -> tuple[Award, ...]:
    """A result card prints its winners twice, as phone cards and as a table; both must agree."""
    table = card[card.find("<table") :]
    rows = re.findall(
        r"<tr>\s*<td[^>]*>\s*(\d+)\.\s*</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>", table, re.DOTALL
    )
    phone = re.findall(
        r"<div>\s*(\d+)\.\s*</div>.*?Nama Petender Berjaya</h3>(.*?)</div>.*?Harga Setuju Terima \(RM\)</h3>(.*?)</div>",
        card[: card.find("<table")] if "<table" in card else card,
        re.DOTALL,
    )
    in_table = [(int(n), _text(s), parse_ringgit(_text(a))) for n, s, a in rows]
    on_phone = [(int(n), _text(s), parse_ringgit(_text(a))) for n, s, a in phone]
    if in_table != on_phone:
        raise ProcurementError(f"notice {notice_id}: the winners table and the phone cards differ")
    if not in_table:
        raise ProcurementError(f"notice {notice_id}: no winners printed")
    if [n for n, _, _ in in_table] != list(range(1, len(in_table) + 1)):
        raise ProcurementError(f"notice {notice_id}: winners are not numbered 1 to {len(in_table)}")
    return tuple(Award(n, supplier, amount) for n, supplier, amount in in_table)


def parse_page(html: str, listing: Listing) -> list[Notice]:
    notices = []
    for card in html.split(CARD_START)[1:]:
        notice_id = _required(r"select-procurement', \{ id: (\d+) \}", card, "id", "?")
        if listing.kind == "direct":
            notices.append(
                Notice(
                    kind="direct",
                    id=int(notice_id),
                    listing=listing.slug,
                    reference=None,
                    title=_text(_required(r'font-bold text-primary">\s*<span>(.*?)</span>', card, "title", notice_id)),
                    ministry=_field(card, "Kementerian", notice_id),
                    agency=_field(card, "Agensi", notice_id),
                    category=_field(card, "Kategori Perolehan", notice_id),
                    result_date=None,
                    shown_date=_date(_required(r"Tarikh Permohonan:\s*([0-9/]+)", card, "date", notice_id)),
                    source_url=listing.url,
                    criterion=_field(card, "Kriteria Rundingan Terus", notice_id),
                    awards=(
                        Award(
                            1,
                            _field(card, "Nama Syarikat", notice_id),
                            parse_ringgit(_field(card, "Nilai Perolehan", notice_id)),
                        ),
                    ),
                )
            )
            continue
        link = re.search(r'<a href="([^"]+)">(.*?)</a>', card, re.DOTALL)
        if not link:
            raise ProcurementError(f"notice {notice_id}: no title link")
        notices.append(
            Notice(
                kind=listing.kind,
                id=int(notice_id),
                listing=listing.slug,
                reference=_text(_required(r'font-bold">No\. [^<]+</span>:(.*?)</div>', card, "reference", notice_id)),
                title=_text(link.group(2)),
                ministry=_field(card, "Kementerian", notice_id),
                agency=_field(card, "Agensi", notice_id),
                category=_field(card, "Kategori Perolehan", notice_id),
                result_date=_date(_field(card, "Tarikh Keputusan", notice_id)),
                shown_date=_date(_required(r"Tarikh Paparan Keputusan:\s*([0-9/]+)", card, "display date", notice_id)),
                source_url=link.group(1),
                criterion=None,
                awards=_awards(card, notice_id),
            )
        )
    return notices


def latest_snapshot(raw_dir: Path = DEFAULT_RAW_DIR) -> Path:
    folders = sorted(p for p in (raw_dir / "myprocurement").glob("????-??-??") if p.is_dir())
    if not folders:
        raise ProcurementError(f"no snapshot under {raw_dir / 'myprocurement'}; run fetch-procurement first")
    return folders[-1]


# --- Loading --------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class LoadResult:
    notices: int
    awards: int
    duplicates: int  # results listed both as current and archived
    repeats: int  # results read twice because new ones were published during the fetch


def read_snapshot(folder: Path) -> tuple[list[tuple[Notice, str]], datetime, datetime, int]:
    """Every notice in a snapshot with its page's retrieval time, and how many were read twice.

    A listing's pages are read in order. Every day that runs across a page boundary must also have been read whole
    on its own (`fetch_day`), and its results are taken from that read. The listing is accepted when its distinct
    results number at least the total its first page reported and the total never fell; results published during
    the fetch can only add to it. Anything else (a missing page or day, a result removed) stops the load."""
    read: list[tuple[Notice, str]] = []
    times: list[str] = []
    repeats = 0
    for listing in LISTINGS:
        out = folder / listing.slug
        pages = sorted(out.glob("*.json"))
        if not pages:
            raise ProcurementError(f"{folder.name}: {listing.slug} has no pages; the fetch did not finish")
        first_total = json.loads(pages[0].read_text())["total"]
        # A listing that grew during the fetch can gain a page, so the last page saved says how many there are.
        last_body = json.loads(pages[-1].read_text())
        last = last_body["lastPage"]
        if [int(p.stem) for p in pages] != list(range(1, last + 1)):
            raise ProcurementError(f"{folder.name}: {listing.slug} has {len(pages)} of {last} pages")
        days: dict[date, list[tuple[Notice, str]]] = {}
        for day in straddling_days(out, listing):
            whole = read_day(day_dir(out, day), listing)
            if whole is None:
                raise ProcurementError(f"{listing.slug}: {day} runs across pages but was not read whole; fetch again")
            days[day] = whole
        found: dict[int, tuple[Notice, str]] = {}
        on_pages: set[int] = set()
        previous = first_total
        for path in pages:
            body = json.loads(path.read_text())
            if body["total"] < previous:
                raise ProcurementError(
                    f"{listing.slug} page {path.stem} reports {body['total']} results after {previous}: results were"
                    " removed during the fetch; fetch it again"
                )
            previous = body["total"]
            for notice in parse_page(body["html"], listing):
                if notice.id in on_pages:
                    repeats += 1
                    continue
                on_pages.add(notice.id)
                if _sort_date(notice) not in days:
                    found[notice.id] = (notice, body["retrieved_at"])
            times.append(body["retrieved_at"])
        for whole in days.values():
            for notice, at in whole:
                found.setdefault(notice.id, (notice, at))
        if len(found) < first_total:
            raise ProcurementError(
                f"{listing.slug}: read {len(found)} distinct results, MyProcurement reports {first_total}"
            )
        read.extend(found.values())
    stamps = sorted(datetime.fromisoformat(t) for t in times)
    return read, stamps[0], stamps[-1], repeats


def _same(a: Notice, b: Notice) -> bool:
    keep = ("reference", "title", "ministry", "agency", "category", "result_date", "awards", "criterion")
    return all(getattr(a, f) == getattr(b, f) for f in keep)


def dedupe(read: list[tuple[Notice, str]]) -> tuple[list[tuple[Notice, str]], int]:
    """A notice can sit in both the current and the archived listing. Keep one: the current listing's, as it is the
    one MyProcurement links to now. Two printings that disagree stop the load."""
    kept: dict[tuple[str, int], tuple[Notice, str]] = {}
    duplicates = 0
    for notice, at in read:
        key = (notice.kind, notice.id)
        if key not in kept:
            kept[key] = (notice, at)
            continue
        duplicates += 1
        other = kept[key][0]
        if not _same(notice, other):
            raise ProcurementError(f"{notice.kind} {notice.id} differs between {other.listing} and {notice.listing}")
        if notice.listing.startswith("results-"):
            kept[key] = (notice, at)
    return list(kept.values()), duplicates


def _total(notice: Notice) -> int | None:
    amounts = [a.amount_sen for a in notice.awards if a.amount_sen is not None]
    return sum(amounts) if amounts else None


def load_snapshot(conn: psycopg.Connection, folder: Path) -> LoadResult:
    read, first_at, last_at, repeats = read_snapshot(folder)
    notices, duplicates = dedupe(read)
    awards = sum(len(n.awards) for n, _ in notices)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("truncate procurement_award, procurement_notice, procurement_snapshot")
        cur.execute(
            "insert into procurement_snapshot (id, first_page_at, last_page_at, notices, awards) values (%s, %s, %s, %s, %s)",
            (folder.name, first_at, last_at, len(notices), awards),
        )
        with cur.copy(
            "copy procurement_notice (kind, id, snapshot_id, listing, reference, title, ministry, agency, category,"
            " result_date, shown_date, criterion, total_sen, source_url, retrieved_at) from stdin"
        ) as copy:
            for n, at in notices:
                copy.write_row(
                    (
                        n.kind,
                        n.id,
                        folder.name,
                        n.listing,
                        n.reference,
                        n.title,
                        n.ministry,
                        n.agency,
                        n.category,
                        n.result_date,
                        n.shown_date,
                        n.criterion,
                        _total(n),
                        n.source_url,
                        at,
                    )
                )
        with cur.copy("copy procurement_award (kind, notice_id, ordinal, supplier, amount_sen) from stdin") as copy:
            for n, _ in notices:
                for a in n.awards:
                    copy.write_row((n.kind, n.id, a.ordinal, a.supplier, a.amount_sen))
        cur.execute("select count(*) from procurement_notice")
        (loaded,) = cur.fetchone()
        if loaded != len(notices):
            raise ProcurementError(f"loaded {loaded} notices, expected {len(notices)}")
        # Each notice's stored total must equal its awards, recomputed by the database.
        cur.execute("""
            select count(*) from procurement_notice n
            where n.total_sen is distinct from (
              select sum(a.amount_sen) from procurement_award a where a.kind = n.kind and a.notice_id = n.id)
        """)
        (wrong,) = cur.fetchone()
        if wrong:
            raise ProcurementError(f"{wrong} notices' totals differ from their awards")
    return LoadResult(len(notices), awards, duplicates, repeats)
