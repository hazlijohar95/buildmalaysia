"""MyProcurement's published award results: tenders, quotations and direct negotiations.

MyProcurement (Bahagian Perolehan Kerajaan, Kementerian Kewangan) lists every published result as cards rendered
server-side and served through `/procurements/fetch` as HTML fragments, 100 to a page. `fetch_snapshot` saves every
page of every listing under one dated folder; `parse_page` reads a page's cards; `load_snapshot` replaces the
procurement tables from a snapshot in one transaction, and only after every listing's card count matches the total
the site reported for it and every card's two printings of its winners agree.
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

    def fetch_page(self, listing: Listing, page: int) -> dict:
        query = urllib.parse.urlencode(
            {"type": listing.type, "category": listing.category, "itemsPerPage": PER_PAGE, "page": page}
        )
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
    interrupted fetch resumes where it stopped."""
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
                body = _with_retries(
                    lambda listing=listing, page=page: session.fetch_page(listing, page),
                    lambda listing=listing: session.open_listing(listing),
                )
                body["retrieved_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
                partial = path.with_suffix(f".{os.getpid()}.part")  # two fetches may share a folder
                partial.write_text(json.dumps(body, ensure_ascii=False))
                partial.rename(path)
                last = body["lastPage"]
                time.sleep(PAUSE_SECONDS)
            if page == 1 or page % 50 == 0 or page == last:
                log(f"{listing.slug}: page {page} of {last}")
            page += 1
    return folder


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
    duplicates: int


def read_snapshot(folder: Path) -> tuple[list[tuple[Notice, str]], datetime, datetime, int]:
    """Every notice in a snapshot with its page's retrieval time. Refuses a snapshot with a missing page, or a
    listing whose cards don't add up to the total MyProcurement reported for it."""
    read: list[tuple[Notice, str]] = []
    times: list[str] = []
    for listing in LISTINGS:
        pages = sorted((folder / listing.slug).glob("*.json"))
        if not pages:
            raise ProcurementError(f"{folder.name}: {listing.slug} has no pages; the fetch did not finish")
        first = json.loads(pages[0].read_text())
        total, last = first["total"], first["lastPage"]
        if [int(p.stem) for p in pages] != list(range(1, last + 1)):
            raise ProcurementError(f"{folder.name}: {listing.slug} has {len(pages)} of {last} pages")
        count = 0
        for path in pages:
            body = json.loads(path.read_text())
            if body["total"] != total:
                raise ProcurementError(
                    f"{listing.slug} page {path.stem} reports {body['total']} results, page 1 {total}: the listing "
                    "changed during the fetch; fetch it again"
                )
            notices = parse_page(body["html"], listing)
            count += len(notices)
            read.extend((n, body["retrieved_at"]) for n in notices)
            times.append(body["retrieved_at"])
        if count != total:
            raise ProcurementError(f"{listing.slug}: read {count} notices, MyProcurement reports {total}")
    stamps = sorted(datetime.fromisoformat(t) for t in times)
    return read, stamps[0], stamps[-1], len(read)


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
    read, first_at, last_at, _ = read_snapshot(folder)
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
    return LoadResult(len(notices), awards, duplicates)
