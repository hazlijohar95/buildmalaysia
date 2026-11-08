import json
import math
import re
from datetime import date
from pathlib import Path

import pytest

from pipeline import procurement
from pipeline.procurement import (
    CARD_START,
    LISTINGS,
    Award,
    ProcurementError,
    day_dir,
    dedupe,
    fetch_day,
    parse_page,
    parse_ringgit,
    read_day,
    read_snapshot,
    straddling_days,
)

FIXTURES = Path(__file__).parent / "fixtures" / "myprocurement"
BY_SLUG = {listing.slug: listing for listing in LISTINGS}


def page(slug: str):
    return parse_page((FIXTURES / f"{slug}.html").read_text(), BY_SLUG[slug])


def test_parse_ringgit() -> None:
    assert parse_ringgit("1,396,812.00") == 139_681_200
    assert parse_ringgit("RM 3,791,097.00") == 379_109_700
    assert parse_ringgit(" 324,720.5 ") == 32_472_050
    assert parse_ringgit("Tiada Maklumat") is None
    with pytest.raises(ProcurementError):
        parse_ringgit("RM satu juta")


def test_an_archived_tender_reads_every_field() -> None:
    notices = page("archive-results-tender")
    assert len(notices) == 10
    first = notices[0]
    assert (first.kind, first.id, first.reference) == ("tender", 1009344, "JKR(PP)/IP/CKE/5/2019(P)")
    assert first.ministry == "KEMENTERIAN KERJA RAYA"
    assert first.agency == "JABATAN KERJA RAYA MALAYSIA (JKR)"
    assert first.category == "Perkhidmatan Perunding"
    assert (first.result_date, first.shown_date) == (date(2020, 5, 12), date(2026, 11, 6))
    assert first.awards == (Award(1, "MINCONSULT SDN. BHD.", 139_681_200),)
    assert first.source_url.startswith("https://myprocurement.treasury.gov.my/archive/results-tender/")


def test_a_notice_with_two_winners_keeps_both_in_order() -> None:
    two = [n for n in page("archive-results-tender") if len(n.awards) == 2]
    solar = next(n for n in two if n.awards[0].supplier == "SOLAR ALERT SDN. BHD.")
    assert solar.awards == (
        Award(1, "SOLAR ALERT SDN. BHD.", 6_890_018_863),
        Award(2, "KA ASSOCIATES", 566_169_000),
    )


def test_a_quotation_without_a_decision_date() -> None:
    first = page("results-quotation")[0]
    assert first.kind == "quotation" and first.reference == "QT260000000021483"
    assert first.result_date is None


def test_the_epoch_placeholder_is_no_date() -> None:
    html = (FIXTURES / "archive-results-tender.html").read_text().replace("12/05/2020", "01/01/1970", 1)
    assert parse_page(html, BY_SLUG["archive-results-tender"])[0].result_date is None


def test_a_direct_negotiation() -> None:
    first = page("archive-direct-negotiations")[0]
    assert (first.kind, first.id, first.reference) == ("direct", 8, None)
    assert first.ministry == "JABATAN PERDANA MENTERI"
    assert first.criterion == "KESEGERAAN ATAS KEPENTINGAN AWAM"
    assert first.shown_date == date(2017, 2, 7)
    assert first.awards == (Award(1, "DESA CARGILL SDN. BHD", 379_109_700),)


def test_the_two_printings_of_the_winners_must_agree() -> None:
    html = (FIXTURES / "archive-results-tender.html").read_text().replace("1,396,812.00", "1,396,813.00", 1)
    with pytest.raises(ProcurementError, match="differ"):
        parse_page(html, BY_SLUG["archive-results-tender"])


def _snapshot(tmp_path: Path, total: int | None = None, drop: str | None = None) -> Path:
    folder = tmp_path / "2026-11-09"
    for listing in LISTINGS:
        html = (FIXTURES / f"{listing.slug}.html").read_text() if (FIXTURES / f"{listing.slug}.html").exists() else ""
        count = len(parse_page(html, listing))
        (folder / listing.slug).mkdir(parents=True)
        if listing.slug == drop:
            continue
        body = {
            "html": html,
            "total": total or count,
            "page": 1,
            "lastPage": 1,
            "retrieved_at": "2026-11-09T01:00:00+08:00",
        }
        (folder / listing.slug / "00001.json").write_text(json.dumps(body))
    return folder


def test_a_snapshot_must_match_the_reported_totals(tmp_path: Path) -> None:
    read, *_ = read_snapshot(_snapshot(tmp_path))
    assert len(read) == 40
    with pytest.raises(ProcurementError, match="reports 999"):
        read_snapshot(_snapshot(tmp_path / "a", total=999))
    with pytest.raises(ProcurementError, match="did not finish"):
        read_snapshot(_snapshot(tmp_path / "b", drop="results-tender"))


def test_dedupe_keeps_the_current_listing_and_refuses_disagreement() -> None:
    archived = page("archive-results-tender")[0]
    current = archived.__class__(**{**archived.__dict__, "listing": "results-tender"})
    kept, duplicates = dedupe([(archived, "a"), (current, "b")])
    assert duplicates == 1 and kept == [(current, "b")]
    changed = archived.__class__(**{**archived.__dict__, "title": "SOMETHING ELSE"})
    with pytest.raises(ProcurementError, match="differs"):
        dedupe([(archived, "a"), (changed, "b")])


def _page(path: Path, html: str, total: int, page: int, last: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = {"html": html, "total": total, "page": page, "lastPage": last, "retrieved_at": "2026-11-09T01:00:00+08:00"}
    path.write_text(json.dumps(body))


def _two_page_tender_listing(tmp_path: Path) -> tuple[Path, list[str]]:
    """Every listing empty except the archived tenders: the fixture's ten cards split over two pages, so that the
    day of cards 6 and 7 (shown 26 Oct 2026) runs across the boundary."""
    folder = tmp_path / "2026-11-09"
    for listing in LISTINGS:
        _page(folder / listing.slug / "00001.json", "", 0, 1, 1)
    cards = (FIXTURES / "archive-results-tender.html").read_text().split(CARD_START)
    return folder, cards


def test_a_day_across_pages_must_be_read_whole(tmp_path: Path) -> None:
    folder, cards = _two_page_tender_listing(tmp_path)
    out = folder / "archive-results-tender"
    head, rest = CARD_START.join(cards[:7]), CARD_START.join([cards[0], *cards[7:]])
    _page(out / "00001.json", head, 10, 1, 2)
    _page(out / "00002.json", rest, 10, 2, 2)
    straddling = straddling_days(out, BY_SLUG["archive-results-tender"])
    assert straddling == [date(2026, 10, 26)]
    with pytest.raises(ProcurementError, match="not read whole"):
        read_snapshot(folder)
    same_day = [c for c in cards[1:] if "Tarikh Paparan Keputusan: 26/10/2026" in c]
    _page(day_dir(out, straddling[0]) / "all-001.json", CARD_START.join(["", *same_day]), len(same_day), 1, 1)
    read, _, _, _ = read_snapshot(folder)
    assert len(read) == 10


def test_a_day_read_whole_must_cover_its_total(tmp_path: Path) -> None:
    folder = tmp_path / "day"
    cards = (FIXTURES / "archive-results-tender.html").read_text().split(CARD_START)
    _page(folder / "all-001.json", CARD_START.join(["", cards[1]]), 2, 1, 1)
    assert read_day(folder, BY_SLUG["archive-results-tender"]) is None
    _page(folder / "slice-001.json", CARD_START.join(["", cards[2]]), 1, 1, 1)
    sliced = json.loads((folder / "slice-001.json").read_text()) | {"filters": [["procurement_category", "x"]]}
    (folder / "slice-001.json").write_text(json.dumps(sliced))
    assert len(read_day(folder, BY_SLUG["archive-results-tender"]) or []) == 2


LOST = 1006682  # a JKR consultancy result


class _LossySite:
    """Every fixture card shown on one day, served like MyProcurement: a query with more results than fit on a page
    is paged in an order that never reaches result LOST (repeating the first instead), and one that fits on a page
    comes back whole."""

    DAY = date(2026, 10, 26)

    def __init__(
        self, ministries: dict[int, str] | None = None, agencies: dict[int, str] | None = None, lost_number_shared=False
    ) -> None:
        """`ministries` and `agencies` refile results under other names; `lost_number_shared` prints LOST's number
        on another JKR result too, so no number prefix can single it out."""
        html = (FIXTURES / "archive-results-tender.html").read_text()
        html = re.sub(r"Tarikh Paparan Keputusan:\s*[0-9/]+", f"Tarikh Paparan Keputusan: {self.DAY:%d/%m/%Y}", html)
        if lost_number_shared:
            html = html.replace("JKR/CKUB/21624/2021", "JKR/PJR/05/2010")
        self.listing = BY_SLUG["archive-results-tender"]
        self.notices = {}
        for card in (CARD_START + c for c in html.split(CARD_START)[1:]):
            [notice] = parse_page(card, self.listing)
            if notice.id in (ministries or {}):
                card = card.replace(f">{notice.ministry}<", f">{ministries[notice.id]}<", 1)
            if notice.id in (agencies or {}):
                card = card.replace(f">{notice.agency}<", f">{agencies[notice.id]}<", 1)
            self.notices[notice.id] = (parse_page(card, self.listing)[0], card)
        self.requests: list[tuple] = []

    def open_listing(self, listing) -> None:
        pass

    def fetch_page(self, listing, page, day, filters=()) -> dict:
        self.requests.append(tuple(filters))
        matching = [(n, c) for n, c in self.notices.values() if all(self._matches(n, f, v) for f, v in filters)]
        size = procurement.PER_PAGE
        if len(matching) > size:
            matching = [*((n, c) for n, c in matching if n.id != LOST), matching[0]]
        chunk = matching[(page - 1) * size : page * size]
        return {
            "html": "".join(c for _, c in chunk),
            "total": sum(1 for n, _ in self.notices.values() if all(self._matches(n, f, v) for f, v in filters)),
            "page": page,
            "lastPage": max(1, math.ceil(len(matching) / size)),
        }

    @staticmethod
    def _matches(notice, field: str, value: str) -> bool:
        # Like MyProcurement, every filter matches the start of the field, ignoring case.
        printed = (
            notice.reference if field == "procurement_number" else getattr(notice, procurement.NAME_FILTERS[field])
        )
        return printed.upper().startswith(value.upper())


@pytest.fixture
def per_page(monkeypatch):
    """Set the page size, and fetch without pausing."""
    monkeypatch.setattr(procurement, "PAUSE_SECONDS", 0)
    return lambda size: monkeypatch.setattr(procurement, "PER_PAGE", size)


def _read_whole(site: _LossySite, out: Path) -> set[int]:
    fetch_day(site, site.listing, out, site.DAY, log=lambda _: None)
    return {n.id for n, _ in read_day(day_dir(out, site.DAY), site.listing) or []}


def test_a_day_too_big_for_a_page_is_split_until_each_slice_fits(tmp_path: Path, per_page) -> None:
    per_page(6)
    site = _LossySite()
    assert _read_whole(site, tmp_path) == set(site.notices)
    # 8 of the 10 are consultancy: split again by ministry, where Kementerian Kerja Raya's 6 fit on a page.
    by_ministry = (
        ("procurement_category", "Perkhidmatan Perunding"),
        ("procurement_ministry", "KEMENTERIAN KERJA RAYA"),
    )
    assert by_ministry in site.requests
    assert not any(field == "procurement_agency" for r in site.requests for field, _ in r)


def test_a_slice_still_too_big_is_split_by_number_prefix(tmp_path: Path, per_page) -> None:
    per_page(5)  # JKR's 6 results don't fit on a page
    site = _LossySite()
    assert _read_whole(site, tmp_path) == set(site.notices)
    numbers = [v for r in site.requests for f, v in r if f == "procurement_number"]
    assert list(dict.fromkeys(numbers)) == ["JKR", "JKR(", "JKR/"]


def test_a_result_whose_agency_never_shows_is_reached_by_number(tmp_path: Path, per_page) -> None:
    per_page(5)
    site = _LossySite(agencies={LOST: "JABATAN KERJA RAYA SABAH"})
    assert _read_whole(site, tmp_path) == set(site.notices)


def test_slices_that_overlap_are_counted_once(tmp_path: Path, per_page) -> None:
    """The site matches a ministry's name as a prefix, so "KEMENTERIAN KERJA RAYA" also returns the result filed under
    "KEMENTERIAN KERJA RAYA SARAWAK", and the ministries' totals add up to their category's while the result filed
    under a ministry no read has shown is still missing."""
    per_page(6)
    site = _LossySite(ministries={LOST: "KEMENTERIAN SABAH", 1006196: "KEMENTERIAN KERJA RAYA SARAWAK"})
    assert _read_whole(site, tmp_path) == set(site.notices)


def test_a_day_that_cannot_be_split_small_enough_stops_the_fetch(tmp_path: Path, per_page) -> None:
    per_page(1)
    site = _LossySite(lost_number_shared=True)
    with pytest.raises(ProcurementError, match="9 of 10 results"):
        fetch_day(site, site.listing, tmp_path, site.DAY, log=lambda _: None)
    assert read_day(day_dir(tmp_path, site.DAY), site.listing) is None
