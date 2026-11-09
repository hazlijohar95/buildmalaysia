"""Bills before Parliament (parlimen.gov.my) and the Acts they became (Laws of Malaysia, lom.agc.gov.my).

Parliament lists each house's bills twice: the current ones as an HTML table, and every earlier year (from 1990) as
an XML tree its archive page loads. Bills keep their Dewan Rakyat number (D.R. n/yyyy) in the Dewan Negara, so the
two houses join on it. The Attorney General's Chambers lists principal, amending and repealed Acts on LOM, through
endpoints that return each listing whole but encrypted with AES-256-GCM, under a key every listing page carries for
the browser to decrypt it with. No bill names its Act nor any Act its bill, so `link_acts` matches them by title,
and `data/bills/act_links.csv` holds the reviewed decisions where a title alone cannot decide.

`fetch_snapshot` saves every listing under one dated folder; `read_snapshot` parses it; `load_snapshot` replaces the
four tables in one transaction.
"""

import base64
import csv
import json
import os
import re
import ssl
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from html import unescape
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Literal

import certifi
import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from pipeline.sources import DEFAULT_RAW_DIR, REPO_ROOT

PARLIMEN = "https://www.parlimen.gov.my"
LOM = "https://lom.agc.gov.my"
USER_AGENT = "buildmalaysia-pipeline (+https://buildmalaysia.com/about)"
PAUSE_SECONDS = 0.5  # between requests
DEFAULT_LINKS_FILE = REPO_ROOT / "data" / "bills" / "act_links.csv"
# parlimen.gov.my sends its certificate without the intermediate that signed it, so no client can verify it alone.
# This is that intermediate, from the address the certificate itself names (http://crt.sectigo.com/...); it is
# trusted only as a link to a root certifi already trusts.
PARLIMEN_INTERMEDIATE = Path(__file__).parent / "certs" / "sectigo-public-server-authentication-ca-dv-r36.pem"

House = Literal["dewan_rakyat", "dewan_negara"]
ActKind = Literal["principal", "amendment", "repealed"]


class BillsError(Exception):
    pass


@dataclass(frozen=True)
class HouseListing:
    house: House
    uweb: str  # parlimen.gov.my's code for the house
    page: str

    @property
    def url(self) -> str:
        return f"{PARLIMEN}/{self.page}?uweb={self.uweb}&"

    @property
    def archive_url(self) -> str:
        return f"{PARLIMEN}/{self.page}?uweb={self.uweb}&arkib=yes"


HOUSES: tuple[HouseListing, ...] = (
    HouseListing("dewan_rakyat", "dr", "bills-dewan-rakyat.html"),
    HouseListing("dewan_negara", "dn", "bills-dewan-negara.html"),
)


@dataclass(frozen=True)
class ActListing:
    kind: ActKind
    page: str  # the listing page, which carries the key
    endpoint: str

    @property
    def url(self) -> str:
        return f"{LOM}/{self.page}"


ACT_LISTINGS: tuple[ActListing, ...] = (
    ActListing("principal", "principal.php?type=original", "json-principal-2024.php"),
    ActListing("amendment", "principal.php?type=amendment", "json-amendment-2024.php"),
    ActListing("repealed", "principal.php?type=repealed", "json-repealed-2024.php"),
)


@dataclass(frozen=True)
class HouseEntry:
    """One house's record of a bill, as one listing prints it."""

    house: House
    year: int
    number: int
    title: str
    title_truncated: bool
    status: str
    first_reading: date | None
    second_reading: date | None
    passed: date | None
    committee: date | None
    failed: date | None
    tabled_by: str | None
    passed_by: str | None
    pdf_url: str | None
    listing: Literal["current", "archive"]
    source_url: str
    retrieved_at: str


@dataclass(frozen=True)
class Act:
    act_no: str
    kind: ActKind
    title_ms: str
    title_en: str | None
    royal_assent: date | None
    published: date | None
    in_force: date | None
    in_force_note: str | None
    repealed_by: str | None
    pdf_ms_url: str | None
    pdf_en_url: str | None
    source_url: str
    retrieved_at: str


@dataclass(frozen=True)
class Link:
    act_no: str | None
    how: Literal["title", "file"]
    note: str | None = None


# --- Fetching -------------------------------------------------------------------------------------------------


def _context() -> ssl.SSLContext:
    context = ssl.create_default_context(cafile=certifi.where())
    context.load_verify_locations(cafile=PARLIMEN_INTERMEDIATE)
    return context


class _Session:
    def __init__(self) -> None:
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(CookieJar()), urllib.request.HTTPSHandler(context=_context())
        )

    def get(self, url: str, data: dict | None = None, headers: dict[str, str] | None = None) -> bytes:
        body = urllib.parse.urlencode(data).encode() if data is not None else None
        request = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT, **(headers or {})})
        for attempt in range(5):
            try:
                with self.opener.open(request, timeout=120) as response:
                    content = response.read()
                time.sleep(PAUSE_SECONDS)
                return content
            except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
                if attempt == 4:
                    raise BillsError(f"{url}: gave up after 5 attempts: {error}") from error
                time.sleep(5 * 2**attempt)
        raise AssertionError("unreachable")


def snapshot_dir(raw_dir: Path, day: date) -> Path:
    return raw_dir / "bills" / day.isoformat()


def _save(path: Path, url: str, body) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"url": url, "retrieved_at": datetime.now().astimezone().isoformat(timespec="seconds"), "body": body}
    partial = path.with_suffix(f".{os.getpid()}.part")
    partial.write_text(json.dumps(record, ensure_ascii=False))
    partial.rename(path)


def fetch_snapshot(raw_dir: Path = DEFAULT_RAW_DIR, day: date | None = None, log=print) -> Path:
    """Save both houses' current and archived bill listings and LOM's three Act listings under
    data/raw/bills/<day>/. Files already saved are kept, so an interrupted fetch resumes."""
    folder = snapshot_dir(raw_dir, day or date.today())
    session = _Session()
    for h in HOUSES:
        out = folder / "parlimen" / h.uweb
        if not (out / "current.json").exists():
            _save(out / "current.json", h.url, session.get(h.url).decode("utf-8"))
        root_path = out / "archive.json"
        if not root_path.exists():
            url = f"{h.archive_url}&ajx=0"
            _save(root_path, url, session.get(url).decode("utf-8"))
        for node in archive_years(json.loads(root_path.read_text())["body"]):
            path = out / f"archive-{node}.json"
            if not path.exists():
                url = f"{h.archive_url}&ajx=1&id={node}"
                _save(path, url, session.get(url).decode("utf-8"))
        log(f"{h.house}: current listing and {len(list(out.glob('archive-*.json')))} archive years saved")
    for listing in ACT_LISTINGS:
        path = folder / "lom" / f"{listing.kind}.json"
        if path.exists():
            continue
        body = fetch_act_listing(session, listing)
        _save(path, f"{LOM}/{listing.endpoint}", body)
        log(f"LOM {listing.kind}: {len(body['records'])} Acts")
    return folder


def fetch_act_listing(session: _Session, listing: ActListing) -> dict:
    page = session.get(listing.url).decode("utf-8", errors="replace")
    found = re.search(r"SEARCH_RESPONSE_KEY\s*=\s*'([0-9a-fA-F]{64})'", page)
    if not found or listing.endpoint not in page:
        raise BillsError(f"{listing.url} no longer carries its key or names {listing.endpoint}; the page has changed")
    # DataTables' own request, asking for every row at once.
    form = {"draw": 1, "start": 0, "length": 10_000, "search[value]": "", "searchValue": "", "language": ""}
    reply = json.loads(
        session.get(f"{LOM}/{listing.endpoint}", form, {"X-Requested-With": "XMLHttpRequest", "Referer": listing.url})
    )
    body = decrypt(reply, found.group(1))
    if int(body["recordsTotal"]) != len(body["records"]):
        raise BillsError(f"LOM {listing.kind}: {len(body['records'])} of {body['recordsTotal']} Acts returned")
    return body


def decrypt(reply: dict, key_hex: str) -> dict:
    """LOM's encrypted reply: base64 of a 12-byte IV, the 16-byte GCM tag, then the ciphertext (js/responseCrypto.js)."""
    if not reply.get("encrypted"):
        return reply
    raw = base64.b64decode(reply["data"])
    iv, tag, ciphertext = raw[:12], raw[12:28], raw[28:]
    return json.loads(AESGCM(bytes.fromhex(key_hex)).decrypt(iv, ciphertext + tag, None))


def archive_years(xml: str) -> list[str]:
    """The archive tree's top level: one node per year, 'O_2024'."""
    return [item.get("id") for item in ET.fromstring(xml).findall("item")]


# --- Parsing --------------------------------------------------------------------------------------------------

_SPACE = re.compile(r"\s+")
_CODE = re.compile(r"D\.?\s*[RN]\.?\s*0*(\d+)\s*/+\s*(\d{4})(?:\s+ARKIB)?", re.IGNORECASE)
_LOAD_RESULT = re.compile(r"loadResult\('([^']+)'")
TITLE_LIMIT = 100  # the archive tree cuts a title at this many characters

# The labels the listings print for a bill's dates, and the field each fills.
DATE_LABELS = {
    "Bacaan Pertama Pada": "first_reading",
    "Bacaan Kedua Pada": "second_reading",
    "Diluluskan Pada": "passed",
    "Dirujuk JKPK Pada": "committee",
    "Tidak Mendapat Undi 2/3 Pada": "failed",
}
PRESENTER_LABEL = "Dibentang Oleh"


def _text(fragment: str) -> str:
    """Tags removed and entities decoded, as often as the listing escaped them (the archive escapes up to three
    times: '&amp;amp;amp;ndash;')."""
    text = re.sub(r"<[^>]+>", " ", fragment)
    for _ in range(4):
        decoded = unescape(text)
        if decoded == text:
            break
        text = decoded
    return _SPACE.sub(" ", text).strip()


def parse_code(text: str) -> tuple[int, int]:
    """'D.R.27/2026', 'D.R 9/2015', 'D.R.16//2017', 'D.R.40/2017 ARKIB' to (year, number)."""
    found = _CODE.fullmatch(text.strip())
    if not found:
        raise BillsError(f"not a bill number: {text!r}")
    return int(found.group(2)), int(found.group(1))


def parse_date(value: str) -> date | None:
    """'21/10/2026' to a date. The listings print an empty date as '', '-' or '30/11/-0001' (PHP's year zero)."""
    value = value.strip()
    if value in ("", "-") or value.startswith("30/11/-"):
        return None
    try:
        return datetime.strptime(value, "%d/%m/%Y").date()
    except ValueError as error:
        raise BillsError(f"not a date: {value!r}") from error


def _pdf_url(path: str | None) -> str | None:
    if not path:
        return None
    return PARLIMEN + urllib.parse.quote(path if path.startswith("/") else f"/{path}", safe="/()',-._~")


def _fields(pairs: list[tuple[str, str]], where: str) -> dict:
    """The dates and presenters a bill's label: value pairs give. The first Dibentang Oleh moved the bill; a second,
    printed after Diluluskan Pada, moved it at its passing."""
    fields: dict = {f: None for f in DATE_LABELS.values()} | {"tabled_by": None, "passed_by": None}
    presenters = []
    for label, value in pairs:
        label = label.strip()
        if label == PRESENTER_LABEL:
            presenters.append(_text(value) or None)
        elif label in DATE_LABELS:
            fields[DATE_LABELS[label]] = parse_date(_text(value))
        else:
            raise BillsError(f"{where}: unknown field {label!r}")
    if len(presenters) > 2:
        raise BillsError(f"{where}: {len(presenters)} presenters")
    fields["tabled_by"] = presenters[0] if presenters else None
    fields["passed_by"] = presenters[1] if len(presenters) > 1 else None
    return fields


def parse_current(html: str, house: HouseListing, retrieved_at: str) -> list[HouseEntry]:
    """A house's current bills: one table row each, the dates in a box beside the status."""
    rows = html.split('<tr class="maintable">')[1:]
    entries = []
    for row in rows:
        link = re.search(r"<a [^>]*onclick=\"([^\"]*)\"[^>]*>(.*?)</a>", row, re.DOTALL)
        cells = re.findall(r"<td[^>]*class=\"maintd\"[^>]*>(.*?)</td>", row, re.DOTALL)
        status = re.search(r'class="parent ruustatus\d*"[^>]*>(.*?)</div>', row, re.DOTALL)
        if not link or len(cells) < 3 or not status:
            raise BillsError(f"{house.house} current listing: a row has no number, title or status")
        code = _text(link.group(2))
        year, number = parse_code(code)
        pairs = re.findall(
            r"vertical-align: top;\">([^<]+)</td>\s*<td[^>]*>:</td>\s*<td[^>]*>(.*?)</td>", row, re.DOTALL
        )
        pdf = _LOAD_RESULT.search(link.group(1))
        entries.append(
            HouseEntry(
                house=house.house,
                year=year,
                number=number,
                title=_text(cells[2]),
                title_truncated=False,
                status=_text(status.group(1)),
                **_fields(pairs, f"{house.house} {code}"),
                pdf_url=_pdf_url(pdf.group(1) if pdf else None),
                listing="current",
                source_url=house.url,
                retrieved_at=retrieved_at,
            )
        )
    if not entries:
        raise BillsError(f"{house.house} current listing: no bills; the page has changed")
    return entries


_ARCHIVE_ITEM = re.compile(r"(?P<code>.*?)\s+-\s+(?P<title>.*?)\s*\((?P<status>[^()]*)\)\s*", re.DOTALL)


def parse_archive_year(xml: str, house: HouseListing, retrieved_at: str) -> list[HouseEntry]:
    """One year of a house's archive tree: an item per bill, 'D.R. 1/2023 - RUU … 2023 (Lulus)', whose children are
    the bill's number (carrying the PDF link) and 'Label:value' leaves."""
    entries = []
    for item in ET.fromstring(xml).findall("item"):
        heading = item.get("text") or ""
        found = _ARCHIVE_ITEM.fullmatch(heading.strip())
        if not found:
            raise BillsError(f"{house.house} archive: cannot read {heading!r}")
        year, number = parse_code(found.group("code"))
        title = _text(found.group("title"))
        pairs, pdf = [], None
        for child in item.findall("item"):
            text = child.get("text") or ""
            data = child.find("userdata")
            if data is not None and data.text and (path := _LOAD_RESULT.search(data.text)):
                pdf = path.group(1)
            if ":" in text:
                label, value = text.split(":", 1)
                pairs.append((label, value))
        entries.append(
            HouseEntry(
                house=house.house,
                year=year,
                number=number,
                title=title,
                # A cut title ends wherever the limit fell, not with the bill's year.
                title_truncated=len(found.group("title").strip()) >= TITLE_LIMIT - 1
                and not re.search(r"\d{4}\)?$", title),
                status=_text(found.group("status")),
                **_fields(pairs, f"{house.house} {found.group('code')}"),
                pdf_url=_pdf_url(pdf),
                listing="archive",
                source_url=house.archive_url,
                retrieved_at=retrieved_at,
            )
        )
    return entries


def title_key(title: str) -> str:
    """A bill's or Act's title reduced to what both print alike: 'RUU Kanun Keseksaan (Pindaan) (No.2) 2024' and
    'AKTA KANUN KESEKSAAN (PINDAAN) (NO. 2) 2024' both give 'KANUN KESEKSAAN(PINDAAN)(NO. 2)2024'."""
    t = unicodedata.normalize("NFKC", _text(title)).upper()
    t = re.sub(r"^(RANG\s*UNDANG\s*-\s*UNDANG|RUU(?=\s))\s*", "", t)
    t = re.sub(r"^AKTA\s+", "", t)  # LOM's titles, and bills printed 'Rang Undang-Undang Akta …'
    t = re.sub(r"\(\s*NO\s*\.?\s*(\d+)\s*\)", r"(NO. \1)", t)
    t = t.replace("’", "'").replace("`", "'")
    t = _SPACE.sub(" ", t)
    return re.sub(r"\s*([()])\s*", r"\1", t).strip()


def _same_entry(a: HouseEntry, b: HouseEntry) -> bool:
    """Two printings of one bill agree when what the site shows from them does: the title as read, the status and
    every date. Spacing, the presenter's spelling and the PDF's file name may differ."""
    keep = ("status", "first_reading", "second_reading", "passed", "committee", "failed")
    return title_key(a.title) == title_key(b.title) and all(getattr(a, f) == getattr(b, f) for f in keep)


def merge_house(entries: list[HouseEntry]) -> dict[tuple[int, int], HouseEntry]:
    """One entry per bill for a house. A bill in both the current listing and the archive is taken from the current
    one, which is newer. A bill the archive lists twice must read the same both times."""
    kept: dict[tuple[int, int], HouseEntry] = {}
    for entry in sorted(entries, key=lambda e: e.listing != "current"):
        key = (entry.year, entry.number)
        other = kept.get(key)
        if other is None:
            kept[key] = entry
        elif other.listing == entry.listing and not _same_entry(other, entry):
            raise BillsError(f"{entry.house} D.R.{entry.number}/{entry.year} is listed twice and the two differ")
    return kept


def _act_date(value: str | None) -> date | None:
    """LOM prints dates as '08/10/2026', and on a few Acts as '27-04-2018', '8-5-2018' or '2018-04-27'."""
    value = (value or "").strip()
    if not value:
        return None
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise BillsError(f"LOM: not a date: {value!r}")


def _commencement(date_text: str | None, remark: str | None) -> tuple[date | None, str | None]:
    """An Act's commencement: a date, perhaps with the order that set it ('8-5-2018 [P.U. (B) 265/2018]'), or a
    remark in its place ('NOT YET IN FORCE')."""
    text = _text(date_text or "")
    order = re.fullmatch(r"(.*?)\s*\[(.*)\]", text)
    note = _text(remark or "") or (order.group(2) if order else None)
    return _act_date(order.group(1) if order else text), note


def _lom_pdf(link_html: str | None) -> str | None:
    """LOM links a PDF through processFile.php?token=base64('<url>|<signature>'); the URL inside opens directly."""
    found = re.search(r"token=([^\"&]+)", link_html or "")
    if not found:
        return None
    token = urllib.parse.unquote(found.group(1))
    url = base64.b64decode(token + "=" * (-len(token) % 4)).decode("utf-8").split("|", 1)[0]
    if not url.startswith(f"{LOM}/"):
        raise BillsError(f"LOM: a PDF token points outside LOM: {url!r}")
    return urllib.parse.quote(url, safe=":/()',-._~")


def parse_acts(records: list[dict], listing: ActListing, retrieved_at: str) -> list[Act]:
    acts = []
    for r in records:
        if listing.kind == "repealed":
            acts.append(
                Act(
                    act_no=_text(r["ILA_ACT_NO"]),
                    kind="repealed",
                    title_ms=_text(r["TITLEBM"]),
                    title_en=_text(r.get("TITLEBI") or "") or None,
                    royal_assent=None,
                    published=None,
                    in_force=None,
                    in_force_note=None,
                    repealed_by=_text(r.get("REPEALEDBY") or "") or None,
                    pdf_ms_url=None,
                    pdf_en_url=None,
                    source_url=listing.url,
                    retrieved_at=retrieved_at,
                )
            )
            continue
        in_force, in_force_note = _commencement(r.get("COMMENCEMENTDATEBI"), r.get("COMMENCEMENTREMARKBI"))
        acts.append(
            Act(
                act_no=_text(r["ACTNO_LEGISLATION"]),
                kind=listing.kind,
                title_ms=_text(r["LEGISLATIONTITLEBM"]),
                title_en=_text(r.get("LEGISLATIONTITLEBI") or "") or None,
                royal_assent=_act_date(r.get("ROYALASSENTDATE")),
                published=_act_date(r.get("PUBLICATIONDATE")),
                in_force=in_force,
                in_force_note=in_force_note,
                repealed_by=None,
                pdf_ms_url=_lom_pdf(r.get("DOC2DOWNLOADBM")),
                pdf_en_url=_lom_pdf(r.get("DOC2DOWNLOADBI")),
                source_url=listing.url,
                retrieved_at=retrieved_at,
            )
        )
    return acts


def _same_act(a: Act, b: Act) -> bool:
    keep = ("kind", "title_ms", "royal_assent", "published", "in_force", "in_force_note")
    return all(getattr(a, f) == getattr(b, f) for f in keep)


# Acts LOM lists twice in one listing with different dates. All four were enacted before 1975, so no bill in
# Parliament's listings (from 1990) can be theirs; the record with the earlier Royal Assent is kept.
KNOWN_DOUBLE_ACTS = {"104", "105", "120", "262"}


def merge_acts(acts: list[Act]) -> dict[str, Act]:
    """One Act per number. LOM repeats some Acts within a listing, and lists a repealed Act among the repealed as well
    as, often, among those in force; the in-force record is kept, with the repeal noted."""
    kept: dict[str, Act] = {}
    for act in sorted(acts, key=lambda a: a.kind == "repealed"):
        other = kept.get(act.act_no)
        if other is None:
            kept[act.act_no] = act
        elif act.kind == "repealed" and other.kind != "repealed":
            kept[act.act_no] = replace(other, repealed_by=act.repealed_by)
        elif _same_act(act, other):
            continue
        elif act.act_no in KNOWN_DOUBLE_ACTS and act.kind == other.kind:
            earlier = min((act, other), key=lambda a: a.royal_assent or date.max)
            kept[act.act_no] = earlier
        else:
            raise BillsError(f"LOM lists Act {act.act_no} twice, and the two differ")
    return kept


# --- Linking bills to Acts ------------------------------------------------------------------------------------

# How long after its final passage a bill's Act may receive the Royal Assent. The Constitution gives the King 30
# days before a bill becomes law without it (Art. 66(4A)), but presenting it can take months.
ASSENT_WITHIN = timedelta(days=365)
# How many years after a bill's own an Act may carry: a bill passed in a later year is enacted with that year.
ACT_YEAR_LATER = 2


def _year_split(key: str) -> tuple[str, int | None]:
    found = re.fullmatch(r"(.*?)\s*(\d{4})", key)
    return (found.group(1), int(found.group(2))) if found else (key, None)


@dataclass(frozen=True)
class Bill:
    year: int
    number: int
    houses: dict[House, HouseEntry]

    @property
    def code(self) -> str:
        return f"D.R.{self.number}/{self.year}"

    @property
    def title(self) -> HouseEntry:
        """The entry whose title the bill takes: the Dewan Rakyat's, unless only the Dewan Negara lists it or its title
        is cut short where the other's is not."""
        dr, dn = self.houses.get("dewan_rakyat"), self.houses.get("dewan_negara")
        if dr and (not dr.title_truncated or not dn or dn.title_truncated):
            return dr
        return dn or dr  # type: ignore[return-value]

    @property
    def passed(self) -> bool:
        return any(e.status == "Lulus" or e.passed for e in self.houses.values())

    @property
    def final_passage(self) -> date | None:
        dates = [e.passed for e in self.houses.values() if e.passed]
        return max(dates) if dates else None


def candidates(bill: Bill, by_stem: dict[str, list[tuple[int, Act]]], acts: dict[str, Act]) -> list[tuple[Act, bool]]:
    """The Acts a passed bill's title can be, each with whether its title matches exactly, year included.

    Same title but for the year, which may be the bill's own or up to ACT_YEAR_LATER later; when the bill's passage
    is dated, assented after it and within ASSENT_WITHIN, else of exactly the title's year. A title naming a year
    before the bill's number does is the Act it changes, not its own, and matches nothing. A title the archive cut
    short is matched as the start of the Act's, taking the bill's year as its own. Where several remain, exact titles
    beat later years, and then the first assented after the passage is the bill's; a later one is the next."""
    entry = bill.title
    key = title_key(entry.title)
    if entry.title_truncated:
        pool = [
            (y, a) for a in acts.values() if (k := title_key(a.title_ms)).startswith(key) and (y := _year_split(k)[1])
        ]
        year: int | None = bill.year
    else:
        stem, year = _year_split(key)
        if year is None or year < bill.year:
            return []
        pool = by_stem.get(stem, [])
    passed = bill.final_passage
    found: list[tuple[Act, bool]] = []
    for act_year, act in pool:
        if act.royal_assent and act.royal_assent.year < bill.year:
            continue
        if passed is None:
            fits = act_year == year
        else:
            fits = year <= act_year <= year + ACT_YEAR_LATER and (
                act.royal_assent is None or passed <= act.royal_assent <= passed + ASSENT_WITHIN
            )
        if fits:
            found.append((act, act_year == year))
    if len(found) > 1 and any(exact for _, exact in found):
        found = [f for f in found if f[1]]
    if len(found) > 1 and passed is not None:
        dated = sorted((f for f in found if f[0].royal_assent), key=lambda f: f[0].royal_assent)
        found = dated[:1] or found
    return found


@dataclass(frozen=True)
class LinkDecision:
    bill: tuple[int, int]
    act_no: str | None
    evidence: str


def read_link_decisions(path: Path = DEFAULT_LINKS_FILE) -> dict[tuple[int, int], LinkDecision]:
    """data/bills/act_links.csv: `bill` (D.R. n/yyyy), `act` (LOM's number, or empty for none) and `evidence`."""
    decisions: dict[tuple[int, int], LinkDecision] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for line, row in enumerate(csv.DictReader(f), start=2):
            key = parse_code(row["bill"])
            evidence = (row.get("evidence") or "").strip()
            if not evidence:
                raise BillsError(f"{path.name} line {line}: {row['bill']} gives no evidence")
            if key in decisions:
                raise BillsError(f"{path.name} line {line}: {row['bill']} is decided twice")
            decisions[key] = LinkDecision(key, (row.get("act") or "").strip() or None, evidence)
    return decisions


def link_acts(
    bills: dict[tuple[int, int], Bill], acts: dict[str, Act], decisions: dict[tuple[int, int], LinkDecision]
) -> dict[tuple[int, int], Link]:
    """Each passed bill's Act. A decision in act_links.csv stands; otherwise the title must give exactly one Act, and
    no Act may be claimed by two bills. Anything else stops the load with the bills that need a decision."""
    by_stem: dict[str, list[tuple[int, Act]]] = {}
    for act in acts.values():
        stem, year = _year_split(title_key(act.title_ms))
        if year is not None:
            by_stem.setdefault(stem, []).append((year, act))
    links: dict[tuple[int, int], Link] = {}
    exact: dict[tuple[int, int], bool] = {}
    problems: list[str] = []
    for key, d in decisions.items():
        if key not in bills:
            problems.append(f"act_links.csv names D.R.{key[1]}/{key[0]}, which no listing prints")
        elif d.act_no is not None and d.act_no not in acts:
            problems.append(f"act_links.csv links D.R.{key[1]}/{key[0]} to Act {d.act_no}, which LOM does not list")
        else:
            links[key] = Link(d.act_no, "file", d.evidence)
    for key, bill in sorted(bills.items()):
        if key in decisions or not bill.passed:
            continue
        found = candidates(bill, by_stem, acts)
        if len(found) == 1:
            links[key] = Link(found[0][0].act_no, "title")
            exact[key] = found[0][1]
        elif found:
            numbers = ", ".join(a.act_no for a, _ in found)
            problems.append(f"{bill.code} {bill.title.title!r}: could be Act {numbers}")
    # An Act two bills' titles both reach goes to the one whose title matches it exactly, year included; the others
    # are left without one. Two exact claims, or a file decision and a title, need a decision.
    claimed: dict[str, list[tuple[int, int]]] = {}
    for key, link in links.items():
        if link.act_no:
            claimed.setdefault(link.act_no, []).append(key)
    for act_no, keys in sorted(claimed.items()):
        if len(keys) < 2:
            continue
        by_exact = [k for k in keys if exact.get(k)]
        if len(by_exact) == 1 and all(links[k].how == "title" for k in keys):
            for k in keys:
                if k != by_exact[0]:
                    del links[k]
        else:
            problems.append(f"Act {act_no} is matched to {', '.join(sorted(bills[k].code for k in keys))}")
    if problems:
        raise BillsError(
            "these bills need a decision in data/bills/act_links.csv:\n  " + "\n  ".join(sorted(set(problems)))
        )
    return links


# --- Reading a snapshot ---------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Snapshot:
    id: str
    bills: dict[tuple[int, int], Bill]
    acts: dict[str, Act]
    first_at: datetime
    last_at: datetime


def _record(path: Path) -> dict:
    if not path.exists():
        raise BillsError(f"{path} is missing; the fetch did not finish")
    return json.loads(path.read_text())


def read_snapshot(folder: Path) -> Snapshot:
    times: list[str] = []
    by_house: dict[House, dict[tuple[int, int], HouseEntry]] = {}
    for h in HOUSES:
        out = folder / "parlimen" / h.uweb
        current = _record(out / "current.json")
        entries = parse_current(current["body"], h, current["retrieved_at"])
        root = _record(out / "archive.json")
        times += [current["retrieved_at"], root["retrieved_at"]]
        years = archive_years(root["body"])
        if not years:
            raise BillsError(f"{h.house}: the archive lists no years; the page has changed")
        for node in years:
            record = _record(out / f"archive-{node}.json")
            entries += parse_archive_year(record["body"], h, record["retrieved_at"])
            times.append(record["retrieved_at"])
        by_house[h.house] = merge_house(entries)
    keys = sorted(set().union(*(set(m) for m in by_house.values())))
    bills = {k: Bill(k[0], k[1], {h: m[k] for h, m in by_house.items() if k in m}) for k in keys}
    acts: list[Act] = []
    for listing in ACT_LISTINGS:
        record = _record(folder / "lom" / f"{listing.kind}.json")
        records = record["body"]["records"]
        if int(record["body"]["recordsTotal"]) != len(records):
            raise BillsError(f"LOM {listing.kind}: {len(records)} of {record['body']['recordsTotal']} Acts saved")
        acts += parse_acts(records, listing, record["retrieved_at"])
        times.append(record["retrieved_at"])
    stamps = sorted(datetime.fromisoformat(t) for t in times)
    return Snapshot(folder.name, bills, merge_acts(acts), stamps[0], stamps[-1])


def latest_snapshot(raw_dir: Path = DEFAULT_RAW_DIR) -> Path:
    folders = sorted(p for p in (raw_dir / "bills").glob("????-??-??") if p.is_dir())
    if not folders:
        raise BillsError(f"no snapshot under {raw_dir / 'bills'}; run fetch-bills first")
    return folders[-1]


def out_of_order(bill: Bill) -> list[str]:
    """Dates a listing prints in an order no bill can take. They are loaded as printed; the load reports them."""
    notes = []
    for house, e in bill.houses.items():
        if e.first_reading and e.second_reading and e.second_reading < e.first_reading:
            notes.append(f"{house} second reading {e.second_reading} before first {e.first_reading}")
        if e.second_reading and e.passed and e.passed < e.second_reading:
            notes.append(f"{house} passed {e.passed} before second reading {e.second_reading}")
    dr, dn = bill.houses.get("dewan_rakyat"), bill.houses.get("dewan_negara")
    if dr and dn and dr.passed and dn.first_reading and dn.first_reading < dr.passed:
        notes.append(f"Dewan Negara first reading {dn.first_reading} before the Dewan Rakyat passed it {dr.passed}")
    return notes


# --- Loading --------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class LoadResult:
    bills: int
    houses: int
    acts: int
    by_title: int
    by_file: int
    passed_without_act: list[str]
    out_of_order: list[str]


def load_snapshot(conn: psycopg.Connection, folder: Path, links_file: Path = DEFAULT_LINKS_FILE) -> LoadResult:
    snap = read_snapshot(folder)
    links = link_acts(snap.bills, snap.acts, read_link_decisions(links_file))
    houses = sum(len(b.houses) for b in snap.bills.values())
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("truncate bill_house, bill, act, bill_snapshot")
        cur.execute(
            "insert into bill_snapshot (id, first_at, last_at, bills, acts) values (%s, %s, %s, %s, %s)",
            (snap.id, snap.first_at, snap.last_at, len(snap.bills), len(snap.acts)),
        )
        with cur.copy(
            "copy act (act_no, kind, title_ms, title_en, royal_assent, published, in_force, in_force_note,"
            " repealed_by, pdf_ms_url, pdf_en_url, source_url, retrieved_at) from stdin"
        ) as copy:
            for a in snap.acts.values():
                copy.write_row(
                    (
                        a.act_no, a.kind, a.title_ms, a.title_en, a.royal_assent, a.published, a.in_force,
                        a.in_force_note, a.repealed_by, a.pdf_ms_url, a.pdf_en_url, a.source_url, a.retrieved_at,
                    )
                )  # fmt: skip
        with cur.copy(
            "copy bill (year, number, title, title_truncated, act_no, act_link, act_link_note, snapshot_id) from stdin"
        ) as copy:
            for key, b in snap.bills.items():
                link = links.get(key)
                copy.write_row(
                    (
                        b.year, b.number, b.title.title, b.title.title_truncated,
                        link.act_no if link else None, link.how if link else None, link.note if link else None,
                        snap.id,
                    )
                )  # fmt: skip
        with cur.copy(
            "copy bill_house (year, number, house, title, status, first_reading, second_reading, passed, committee,"
            " failed, tabled_by, passed_by, pdf_url, listing, source_url, retrieved_at) from stdin"
        ) as copy:
            for b in snap.bills.values():
                for e in b.houses.values():
                    copy.write_row(
                        (
                            e.year, e.number, e.house, e.title, e.status, e.first_reading, e.second_reading,
                            e.passed, e.committee, e.failed, e.tabled_by, e.passed_by, e.pdf_url, e.listing,
                            e.source_url, e.retrieved_at,
                        )
                    )  # fmt: skip
        for table, expected in (("bill", len(snap.bills)), ("bill_house", houses), ("act", len(snap.acts))):
            cur.execute(f"select count(*) from {table}")
            (loaded,) = cur.fetchone()
            if loaded != expected:
                raise BillsError(f"loaded {loaded} rows into {table}, expected {expected}")
    passed_without = [
        f"{b.code} {b.title.title}"
        for key, b in snap.bills.items()
        if b.passed and not (links.get(key) and links[key].act_no) and b.year >= 2011
    ]
    flags = [f"{b.code}: {note}" for b in snap.bills.values() for note in out_of_order(b)]
    return LoadResult(
        len(snap.bills),
        houses,
        len(snap.acts),
        sum(1 for link in links.values() if link.how == "title"),
        sum(1 for link in links.values() if link.how == "file"),
        passed_without,
        flags,
    )
