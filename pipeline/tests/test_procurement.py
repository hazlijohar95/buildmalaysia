import json
from datetime import date
from pathlib import Path

import pytest

from pipeline.procurement import (
    LISTINGS,
    Award,
    ProcurementError,
    dedupe,
    parse_page,
    parse_ringgit,
    read_snapshot,
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
