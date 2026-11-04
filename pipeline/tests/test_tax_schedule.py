from pathlib import Path

import pytest

from pipeline.sources import DEFAULT_RAW_DIR
from pipeline.tax_schedule import PAGES, ScheduleError, build_schedule, parse_rates


def test_ya2025_schedule_reads_lhdn_and_kwsp_pages() -> None:
    s = build_schedule(DEFAULT_RAW_DIR, 2025)
    assert s["rate_table"] == "Tahun Taksiran 2023, 2024 & 2025"
    assert [(b["lower"], b["upper"], b["rate_pct"], b["tax_below"]) for b in s["bands"]] == [
        (0, 5_000, 0, 0),
        (5_000, 20_000, 1, 0),
        (20_000, 35_000, 3, 150),
        (35_000, 50_000, 6, 600),
        (50_000, 70_000, 11, 1_500),
        (70_000, 100_000, 19, 3_700),
        (100_000, 400_000, 25, 9_400),
        (400_000, 600_000, 26, 84_400),
        (600_000, 2_000_000, 28, 136_400),
        (2_000_000, None, 30, 528_400),
    ]
    assert {k: v["amount"] for k, v in s["reliefs"].items()} == {"individual": 9_000, "epf": 4_000, "perkeso": 350}
    assert (s["rebate"]["amount"], s["rebate"]["chargeable_income_below"]) == (400, 35_000)
    assert s["epf"]["employee_rate_pct"] == 11
    assert {src["id"] for src in s["sources"]} == {p.id for p in PAGES.values()}


def test_a_band_that_disagrees_with_its_printed_tax_is_refused() -> None:
    html = (DEFAULT_RAW_DIR / PAGES["rates"].file).read_text(encoding="utf-8")
    # Band E's printed tax on its full width, 2,200, edited to 2,300.
    edited = html.replace("2,200", "2,300", 1)
    assert edited != html
    with pytest.raises(ScheduleError, match="band E"):
        parse_rates(edited, "Tahun Taksiran 2023, 2024 & 2025")


def test_missing_year_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ScheduleError, match="no rate table covers year of assessment 2031"):
        build_schedule(DEFAULT_RAW_DIR, 2031)
