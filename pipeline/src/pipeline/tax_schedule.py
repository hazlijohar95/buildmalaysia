"""Personal income tax schedule for one year of assessment, read from saved LHDN and KWSP pages.

The calculator on the web reads the JSON this writes; no rate is typed by hand. Every value carries the
text it was read from, and the rate table is checked against the cumulative tax LHDN prints beside it.
"""

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path


class ScheduleError(Exception):
    """A saved page no longer reads as expected, or its printed figures disagree."""


@dataclass(frozen=True)
class Page:
    id: str
    title: str
    url: str
    file: str  # relative to the raw data directory


PAGES = {
    "rates": Page(
        "lhdn-kadar-cukai",
        "LHDN, Kadar Cukai (individu)",
        "https://www.hasil.gov.my/individu/kadar-cukai/",
        "lhdn/kadar-cukai.html",
    ),
    "reliefs": Page(
        "lhdn-pelepasan-cukai",
        "LHDN, Pelepasan Cukai (individu)",
        "https://www.hasil.gov.my/individu/pelepasan-cukai/",
        "lhdn/pelepasan-cukai.html",
    ),
    "rebate": Page(
        "lhdn-rebat", "LHDN, Rebat (individu)", "https://www.hasil.gov.my/individu/rebat/", "lhdn/rebat.html"
    ),
    "epf": Page(
        "kwsp-mandatory-contribution",
        "KWSP, Employer Mandatory Contribution",
        "https://www.kwsp.gov.my/en/employer/responsibilities/mandatory-contribution",
        "kwsp/mandatory-contribution.html",
    ),
}


class _Text(HTMLParser):
    """Visible text as a list of cells: one entry per run of text between tags."""

    def __init__(self) -> None:
        super().__init__()
        self.cells: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self._skip += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data: str) -> None:
        text = " ".join(unescape(data).split())
        if text and not self._skip:
            self.cells.append(text)


def cells(html: str) -> list[str]:
    parser = _Text()
    parser.feed(html)
    return parser.cells


def _section(tokens: list[str], start: str, end: str, page: str) -> list[str]:
    try:
        i = tokens.index(start)
        j = tokens.index(end, i + 1)
    except ValueError as error:
        raise ScheduleError(f"{page}: section {start!r} .. {end!r} not found") from error
    return tokens[i + 1 : j]


def _ringgit(text: str) -> int:
    if not re.fullmatch(r"\d{1,3}(,\d{3})*", text):
        raise ScheduleError(f"not a whole ringgit amount: {text!r}")
    return int(text.replace(",", ""))


def parse_rates(html: str, heading: str) -> list[dict[str, object]]:
    """The banded rate table under `heading`, checked against the tax LHDN prints for each band."""
    rows = _section(cells(html), heading, "Tahun Taksiran 2022", "kadar-cukai")
    letters = [i for i, t in enumerate(rows) if re.fullmatch(r"[A-L]", t)]
    bands: list[dict[str, object]] = []
    for n, i in enumerate(letters):
        row = rows[i : letters[n + 1] if n + 1 < len(letters) else len(rows)]
        span = row[1]
        if m := re.fullmatch(r"([\d,]+) – ([\d,]+)", span):
            lower, upper = _ringgit(m[1]), _ringgit(m[2])
        elif m := re.fullmatch(r"Melebihi ([\d,]+)", span):
            lower, upper = _ringgit(m[1]) + 1, None  # "more than" the amount
        else:
            raise ScheduleError(f"kadar-cukai band {row[0]}: unreadable range {span!r}")
        if n == 0:
            rate, tax_below = int(row[3]), _ringgit(row[4])
            if (lower, rate, tax_below) != (0, 0, 0):
                raise ScheduleError(f"kadar-cukai band A: expected 0% from RM0, read {row}")
        else:
            rate_text, tax_below = row[5], _ringgit(row[6])
            rate = float(rate_text) if "." in rate_text else int(rate_text)
            prev = bands[-1]
            if lower != prev["upper"] + 1:  # type: ignore[operator]
                raise ScheduleError(f"kadar-cukai band {row[0]} starts at {lower}, previous ends at {prev['upper']}")
            expected = prev["tax_below"] + prev["width_tax"]  # type: ignore[operator]
            if tax_below != expected:
                raise ScheduleError(
                    f"kadar-cukai band {row[0]}: printed tax on first {lower - 1} is {tax_below}, bands give {expected}"
                )
        width_tax = 0
        if upper is not None and n > 0:
            width_tax = _ringgit(row[7])
            computed = (upper - (lower - 1)) * rate / 100
            if computed != width_tax:
                raise ScheduleError(
                    f"kadar-cukai band {row[0]}: printed {width_tax} on the band, {rate}% gives {computed}"
                )
        bands.append(
            {
                "band": row[0],
                "lower": lower - 1 if n else 0,
                "upper": upper,
                "rate_pct": rate,
                "tax_below": tax_below,
                "width_tax": width_tax,
                "source_text": " | ".join(row),
            }
        )
    for b in bands:
        del b["width_tax"]
    return bands


def _find(text: str, pattern: str, page: str) -> re.Match[str]:
    m = re.search(pattern, text)
    if m is None:
        raise ScheduleError(f"{page}: expected text matching {pattern!r}")
    return m


def parse_reliefs(html: str, year: int) -> dict[str, dict[str, object]]:
    text = " | ".join(_section(cells(html), f"Tahun Taksiran {year}", f"Tahun Taksiran {year - 1}", "pelepasan-cukai"))
    individual = _find(text, r"\| 1 \| Individu dan saudara tanggungan \| ([\d,]+) \|", "pelepasan-cukai")
    epf = _find(text, r"Caruman wajib kepada skim yang diluluskan[^|]*\| Terhad RM([\d,]+) \|", "pelepasan-cukai")
    perkeso = _find(
        text, r"Caruman kepada Pertubuhan Keselamatan Sosial \(PERKESO\)[^|]*\| ([\d,]+) \(Terhad\)", "pelepasan-cukai"
    )
    return {
        "individual": {"amount": _ringgit(individual[1]), "source_text": individual[0].strip(" |")},
        "epf": {"amount": _ringgit(epf[1]), "source_text": epf[0].strip(" |")},
        "perkeso": {"amount": _ringgit(perkeso[1]), "source_text": perkeso[0].strip(" |")},
    }


def parse_rebate(html: str) -> dict[str, object]:
    text = " | ".join(cells(html))
    heading = _find(
        text,
        r"Rebat Cukai Pendapatan Bagi Individu Yang Mempunyai Pendapatan Bercukai Kurang Daripada RM([\d,]+)",
        "rebat",
    )
    amount = _find(
        text,
        r"Tahun Taksiran \| 2009 & Seterusnya\(RM\) \| a \| Taksiran Berasingan \| Isteri \| Suami \| – \| 350 \| 350 \| – \| (\d+) \| (\d+)",
        "rebat",
    )
    if amount[1] != amount[2]:
        raise ScheduleError(f"rebat: wife and husband rebates differ: {amount[0]}")
    return {
        "amount": int(amount[1]),
        "chargeable_income_below": _ringgit(heading[1]),
        "source_text": f"{heading[0]} … {amount[0]}",
    }


def parse_epf_rate(html: str) -> dict[str, object]:
    text = " | ".join(cells(html))
    m = _find(
        text,
        r"RM5,000 and below \| Employees share: (\d+)% \| Employer’s share: \d+% \| \( \| Ref Third Schedule – Part A",
        "kwsp",
    )
    above = _find(
        text,
        r"More than RM5,000 \| Employees share: (\d+)% \| Employer’s share: \d+% \| \( \| Ref Third Schedule – Part A",
        "kwsp",
    )
    if m[1] != above[1]:
        raise ScheduleError(f"kwsp: employee share differs across wage bands: {m[0]} / {above[0]}")
    return {"employee_rate_pct": int(m[1]), "source_text": f"{m[0]} … {above[0]}"}


def build_schedule(raw_dir: Path, year: int) -> dict[str, object]:
    html = {k: (raw_dir / p.file).read_text(encoding="utf-8") for k, p in PAGES.items()}
    heading = next((t for t in cells(html["rates"]) if t.startswith("Tahun Taksiran") and str(year) in t), None)
    if heading is None:
        raise ScheduleError(f"kadar-cukai: no rate table covers year of assessment {year}")
    sources = []
    for p in PAGES.values():
        path = raw_dir / p.file
        sources.append(
            {
                "id": p.id,
                "title": p.title,
                "url": p.url,
                "file": p.file,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "retrieved": datetime.fromtimestamp(path.stat().st_mtime, UTC).date().isoformat(),
            }
        )
    return {
        "year_of_assessment": year,
        "rate_table": heading,
        "bands": parse_rates(html["rates"], heading),
        "reliefs": parse_reliefs(html["reliefs"], year),
        "rebate": parse_rebate(html["rebate"]),
        "epf": parse_epf_rate(html["epf"]),
        "sources": sources,
    }


def write_schedule(raw_dir: Path, year: int, out: Path) -> dict[str, object]:
    schedule = build_schedule(raw_dir, year)
    out.write_text(json.dumps(schedule, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return schedule
