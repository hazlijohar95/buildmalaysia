import json
from dataclasses import replace
from datetime import date
from pathlib import Path

import pytest

from pipeline.bills import (
    ACT_LISTINGS,
    HOUSES,
    Bill,
    BillsError,
    LinkDecision,
    _lom_pdf,
    _text,
    join_houses,
    link_acts,
    merge_acts,
    merge_house,
    parse_acts,
    parse_archive_year,
    parse_code,
    parse_current,
    parse_date,
    read_house_decisions,
    read_link_decisions,
    title_key,
)

FIXTURES = Path(__file__).parent / "fixtures" / "bills"
DR = HOUSES[0]
AT = "2026-11-09T19:00:00+08:00"


def current():
    return parse_current((FIXTURES / "current-dr.html").read_text(), DR, AT)


def archive(year: int):
    return parse_archive_year((FIXTURES / f"archive-dr-{year}.xml").read_text(), DR, AT)


def acts():
    lom = json.loads((FIXTURES / "lom.json").read_text())
    return merge_acts([a for listing in ACT_LISTINGS for a in parse_acts(lom[listing.kind], listing, AT)])


@pytest.mark.parametrize(
    ("printed", "key"),
    [
        ("D.R.27/2026", (2026, 27)),
        ("D.R. 1/2023", (2023, 1)),
        ("D.R 9/2015", (2015, 9)),
        ("D.R.  09/2015", (2015, 9)),
        ("D.R.16//2017", (2017, 16)),
        ("D.R.40/2017 ARKIB", (2017, 40)),
    ],
)
def test_bill_numbers_as_printed(printed: str, key: tuple[int, int]) -> None:
    assert parse_code(printed) == key


def test_a_bill_number_must_be_one() -> None:
    with pytest.raises(BillsError):
        parse_code("RUU Kewangan 2017")


def test_empty_dates() -> None:
    assert parse_date("21/10/2026") == date(2026, 10, 21)
    assert parse_date("") is None and parse_date("-") is None
    assert parse_date("30/11/-0001") is None  # PHP's empty date
    with pytest.raises(BillsError):
        parse_date("2026-10-21")


def test_the_current_listing_reads_every_field() -> None:
    by_code = {f"D.R.{e.number}/{e.year}": e for e in current()}
    first = by_code["D.R.27/2026"]
    assert first.status == "Bacaan Kali Pertama"
    assert first.title == "RUU Pendaftaran Penjenayah dan Orang Yang Tidak Diingini (Pindaan) 2026"
    assert (first.first_reading, first.second_reading, first.passed) == (date(2026, 10, 21), None, None)
    assert first.tabled_by and first.tabled_by.startswith("YB Datuk Seri Dr. Shamsul Anuar")
    assert first.passed_by is None
    assert first.pdf_url == (
        "https://www.parlimen.gov.my/files/billindex/pdf/2026/DR/"
        "RUU%20Pendaftaran%20Penjenayah%20dan%20Orang%20Yang%20Tidak%20Diingini%20(Pindaan)%202026.pdf"
    )
    passed = by_code["D.R.24/2026"]
    assert passed.status == "Lulus" and passed.passed == date(2026, 10, 6)
    assert passed.passed_by == "YB Dr. Mohammed Taufiq Johari (Menteri Belia dan Sukan)"
    committee = next(e for e in by_code.values() if e.status == "Dirujuk ke JKPK")
    assert committee.committee is not None
    failed = next(e for e in by_code.values() if e.status.startswith("Tidak Mendapat Undi"))
    assert failed.failed is not None


def test_the_archive_decodes_titles_escaped_several_times() -> None:
    entry = next(e for e in archive(2017) if e.number == 45)
    assert entry.tabled_by and "Dato' Sri Azalina" in entry.tabled_by and "&" not in entry.tabled_by


def test_a_bill_listed_twice_in_agreement_is_kept_once() -> None:
    merged = merge_house(archive(2017))
    assert sorted(merged) == [(2017, 16), (2017, 32), (2017, 40), (2017, 45)]


def test_a_bill_listed_twice_must_agree() -> None:
    xml = (
        (FIXTURES / "archive-dr-2017.xml")
        .read_text()
        .replace("Diluluskan Pada:24/10/2017", "Diluluskan Pada:25/10/2017", 1)
    )
    with pytest.raises(BillsError, match="listed twice"):
        merge_house(parse_archive_year(xml, DR, AT))


def test_a_title_cut_at_the_limit_is_marked() -> None:
    cut = next(e for e in archive(2020) if e.number == 18)
    assert cut.title_truncated and cut.title.endswith("(Pinda")
    whole = next(e for e in archive(2020) if e.number == 15)
    assert not whole.title_truncated


def test_title_keys_ignore_how_each_side_prints_a_title() -> None:
    assert title_key("RUU Kanun Keseksaan (Pindaan) (No.2) 2024") == title_key(
        "AKTA KANUN KESEKSAAN (PINDAAN) (NO. 2) 2024"
    )
    assert title_key("Rang Undang-undangArkitek (Pindaan) 2014") == "ARKITEK(PINDAAN)2014"
    assert title_key("Rang Undang-Undang Akta Perkhidmatan Perniagaan Wang 2011") == "PERKHIDMATAN PERNIAGAAN WANG 2011"


def test_lom_records() -> None:
    by_no = acts()
    statistics = by_no["887"]
    assert statistics.title_ms == "AKTA STATISTIK 2026" and statistics.title_en == "STATISTICS ACT 2026"
    assert (statistics.royal_assent, statistics.published) == (date(2026, 10, 8), date(2026, 10, 23))
    assert statistics.in_force is None and statistics.in_force_note == "NOT YET IN FORCE"
    assert statistics.pdf_ms_url and statistics.pdf_ms_url.startswith("https://lom.agc.gov.my/ilims/upload/")
    assert " " not in statistics.pdf_ms_url
    # A commencement printed with the order that set it, and an Act LOM lists four times over.
    assert by_no["A1569"].in_force == date(2018, 5, 8)
    assert by_no["A1569"].in_force_note and "P.U.(B) 265/2018" in by_no["A1569"].in_force_note
    assert by_no["A1585"].royal_assent == date(2019, 1, 14)
    assert by_no["762"].kind == "repealed" and by_no["762"].repealed_by == "805"


def _bill(entries) -> dict:
    merged = merge_house(entries)
    return {k: Bill(k[0], k[1], {"dewan_rakyat": e}) for k, e in merged.items()}


def test_a_cut_title_links_to_the_act_of_its_own_year() -> None:
    links = link_acts(_bill(archive(2020)), acts(), {})
    assert links[(2020, 18)].act_no == "A1627"  # not A1635, the next year's amendment of the same Act


def test_a_decision_in_the_file_stands(tmp_path: Path) -> None:
    path = tmp_path / "act_links.csv"
    path.write_text("bill,act,evidence\nD.R.18/2020,A1635,a test\n")
    links = link_acts(_bill(archive(2020)), acts(), read_link_decisions(path))
    assert (links[(2020, 18)].act_no, links[(2020, 18)].how) == ("A1635", "file")
    path.write_text("bill,act,evidence\nD.R.18/2020,A9999,a test\n")
    with pytest.raises(BillsError, match="does not list"):
        link_acts(_bill(archive(2020)), acts(), read_link_decisions(path))
    path.write_text("bill,act,evidence\nD.R.18/2020,A1635,\n")
    with pytest.raises(BillsError, match="no evidence"):
        read_link_decisions(path)


def test_an_act_two_titles_reach_needs_a_decision() -> None:
    bills = _bill(archive(2020))
    entry = bills[(2020, 18)].houses["dewan_rakyat"]
    bills[(2020, 99)] = Bill(2020, 99, {"dewan_rakyat": replace(entry, number=99)})
    with pytest.raises(BillsError, match="A1627 is matched to"):
        link_acts(bills, acts(), {})
    decided = {(2020, 99): LinkDecision((2020, 99), None, "a duplicate made up for this test")}
    assert link_acts(bills, acts(), decided)[(2020, 99)].act_no is None


def _houses(dn_title: str, *, dn_cut: bool = False) -> dict:
    dr = next(e for e in archive(2020) if e.number == 15)
    dn = replace(dr, house="dewan_negara", title=dn_title, title_truncated=dn_cut)
    return {"dewan_rakyat": {(2020, 15): dr}, "dewan_negara": {(2020, 15): dn}}


def test_the_houses_join_when_they_print_one_title() -> None:
    dr = next(e for e in archive(2020) if e.number == 15)
    bills = join_houses(_houses(dr.title.replace("'", "") + "-DR"), {})
    assert set(bills[(2020, 15)].houses) == {"dewan_rakyat", "dewan_negara"}
    assert (
        join_houses(_houses(dr.title[:40], dn_cut=True), {})[(2020, 15)].houses.keys()
        == bills[(2020, 15)].houses.keys()
    )


def test_two_houses_printing_different_bills_under_one_number_need_a_decision(tmp_path: Path) -> None:
    houses = _houses("RUU Pencegahan Jenayah (Pindaan dan Pemerluasan) 2020")
    with pytest.raises(BillsError, match="house_links.csv"):
        join_houses(houses, {})
    path = tmp_path / "house_links.csv"
    path.write_text("bill,dewan_negara,evidence\nD.R.15/2020,drop,a test\n")
    assert set(join_houses(houses, read_house_decisions(path))[(2020, 15)].houses) == {"dewan_rakyat"}
    path.write_text("bill,dewan_negara,evidence\nD.R.15/2020,keep,a test\n")
    assert len(join_houses(houses, read_house_decisions(path))[(2020, 15)].houses) == 2
    path.write_text("bill,dewan_negara,evidence\nD.R.15/2020,maybe,a test\n")
    with pytest.raises(BillsError, match="keep or drop"):
        read_house_decisions(path)
    path.write_text("bill,dewan_negara,evidence\nD.R.99/2020,drop,a test\n")
    with pytest.raises(BillsError, match="do not both print"):
        join_houses(houses, read_house_decisions(path))


def test_the_repository_decisions_read() -> None:
    assert read_house_decisions()[(2013, 11)].dewan_negara == "drop"
    read_link_decisions()


def test_an_escaped_apostrophe_is_read_as_one() -> None:
    assert _text("Pencetakan Teks Al-Qur\\'an") == "Pencetakan Teks Al-Qur'an"


def test_a_malformed_pdf_token_is_a_load_error() -> None:
    with pytest.raises(BillsError, match="PDF token"):
        _lom_pdf('<a href="processFile.php?token=%FF%FE">')
