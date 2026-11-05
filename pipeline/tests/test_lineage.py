import csv
import shutil
from datetime import date
from pathlib import Path

import pytest

from pipeline.lineage import DEFAULT_LINEAGE_DIR, LineageError, VoteHolder, read_lineage, slugify


def test_the_repository_files_read_and_cross_check() -> None:
    lineage = read_lineage()
    bodies = {b.id for b in lineage.bodies}
    assert {"kasa", "petra", "mea", "ekonomi", "kpt"} <= bodies
    assert {h.vote_code: h for h in lineage.holders if h.body_id == "petra"} == {
        "B.33": VoteHolder("B.33", "petra", 2024, None),
        "P.33": VoteHolder("P.33", "petra", 2024, None),
    }
    kasa = [h for h in lineage.holders if h.body_id == "kasa"]
    assert {(h.vote_code, h.from_year, h.to_year) for h in kasa} == {("B.33", 2020, 2023), ("P.33", 2020, 2023)}
    kpt_years = sorted((h.from_year, h.to_year) for h in lineage.holders if h.vote_code == "B.64")
    assert kpt_years == [(2016, 2018), (2020, None)]


def test_every_edge_and_alias_cites_a_source() -> None:
    lineage = read_lineage()
    citations = {c.id for c in lineage.citations}
    assert all(e.citation_id in citations for e in lineage.edges)
    assert all(a.citation_id in citations for a in lineage.aliases)
    assert all(c.url.startswith("https://") for c in lineage.citations)


def test_slugify_matches_the_web() -> None:
    assert slugify("KEMENTERIAN PENDIDIKAN TINGGI") == "kementerian-pendidikan-tinggi"
    assert slugify("KEMENTERIAN SAINS, TEKNOLOGI DAN INOVASI") == "kementerian-sains-teknologi-dan-inovasi"
    assert slugify("YANG DI - PERTUA DEWAN RAKYAT") == "yang-di-pertua-dewan-rakyat"


def _copy(tmp_path: Path) -> Path:
    for name in ("citations", "bodies", "aliases", "vote_holders", "edges"):
        shutil.copy(DEFAULT_LINEAGE_DIR / f"{name}.csv", tmp_path / f"{name}.csv")
    return tmp_path


def _append(path: Path, row: dict[str, str]) -> None:
    with path.open(newline="", encoding="utf-8") as f:
        fields = next(csv.reader(f))
    with path.open("a", newline="", encoding="utf-8") as f:
        csv.DictWriter(f, fields).writerow(row)


def test_an_alias_of_an_unknown_body_is_refused(tmp_path: Path) -> None:
    files = _copy(tmp_path)
    _append(
        files / "aliases.csv",
        {"body_id": "nobody", "name_ms": "X", "origin": "printed", "confidence": "high", "citation_id": "J16"},
    )
    with pytest.raises(LineageError, match="aliases.csv nobody X: unknown body"):
        read_lineage(files)


def test_an_uncited_edge_is_refused(tmp_path: Path) -> None:
    files = _copy(tmp_path)
    _append(
        files / "edges.csv",
        {
            "id": "X",
            "predecessor": "jpm",
            "successor": "mof",
            "effective": "2025-01-01",
            "whole": "false",
            "functions": "x",
            "confidence": "high",
            "citation_id": "nope",
        },
    )
    with pytest.raises(LineageError, match="edges.csv X: unknown citation 'nope'"):
        read_lineage(files)


def test_a_whole_edge_names_no_functions(tmp_path: Path) -> None:
    files = _copy(tmp_path)
    _append(
        files / "edges.csv",
        {
            "id": "X",
            "predecessor": "jpm",
            "successor": "mof",
            "effective": "2025-01-01",
            "whole": "true",
            "functions": "x",
            "confidence": "high",
            "citation_id": "J16",
        },
    )
    with pytest.raises(LineageError, match="edges.csv X: name the functions that moved, or mark the edge whole"):
        read_lineage(files)


def test_two_holders_of_one_vote_in_one_year_are_refused(tmp_path: Path) -> None:
    files = _copy(tmp_path)
    _append(files / "vote_holders.csv", {"vote": "B/P.33", "body_id": "kasa", "from_year": "2024"})
    with pytest.raises(LineageError, match="B.33 has two holders in 2024"):
        read_lineage(files)


def test_supply_and_development_votes_of_one_number_share_a_body(tmp_path: Path) -> None:
    files = _copy(tmp_path)
    _append(files / "vote_holders.csv", {"vote": "B.70", "body_id": "mosti", "from_year": "2020"})
    with pytest.raises(LineageError, match="B.70 and P.70 have different holders in 2020"):
        read_lineage(files)


def test_a_slug_resolves_to_one_body(tmp_path: Path) -> None:
    files = _copy(tmp_path)
    _append(
        files / "aliases.csv",
        {
            "body_id": "petra",
            "name_ms": "Kementerian Alam Sekitar dan Air",
            "origin": "gazetted",
            "confidence": "high",
            "citation_id": "J16",
        },
    )
    with pytest.raises(LineageError, match="would give kasa and petra the same slug"):
        read_lineage(files)


def test_the_display_name_is_an_alias(tmp_path: Path) -> None:
    files = _copy(tmp_path)
    _append(files / "bodies.csv", {"id": "x", "name_ms": "NOT AN ALIAS"})
    with pytest.raises(LineageError, match="bodies.csv x: name_ms 'NOT AN ALIAS' is not one of its aliases"):
        read_lineage(files)


def test_a_bad_date_names_the_row(tmp_path: Path) -> None:
    files = _copy(tmp_path)
    _append(files / "bodies.csv", {"id": "x", "name_ms": "X", "established": "May 2018"})
    with pytest.raises(LineageError, match="bodies.csv x: bad date 'May 2018'"):
        read_lineage(files)


def test_dates_are_parsed() -> None:
    lineage = read_lineage()
    petra = next(b for b in lineage.bodies if b.id == "petra")
    assert petra.established == date(2023, 12, 12)
    assert petra.dissolved is None
