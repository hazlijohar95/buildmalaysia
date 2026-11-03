"""Typed model of Lampiran 1 (Penyata Perbelanjaan Mengurus). All amounts are integer sen."""

from dataclasses import dataclass
from enum import StrEnum


class Section(StrEnum):
    CHARGED = "charged"  # Perbelanjaan Tanggungan, T.xx votes
    SUPPLY = "supply"  # Perbelanjaan Bekalan, B.xx votes


class Scope(StrEnum):
    ACTIVITY = "activity"
    PROGRAMME = "programme"
    VOTE = "vote"
    SECTION = "section"
    STATEMENT = "statement"


OBJECT_GROUPS: dict[str, str] = {
    "10000": "Emolumen",
    "20000": "Perkhidmatan dan Bekalan",
    "30000": "Aset",
    "40000": "Pemberian dan Kenaan Bayaran Tetap",
    "50000": "Perbelanjaan-perbelanjaan Lain",
}


@dataclass(frozen=True)
class Citation:
    pdf_page: int  # 1-based index into the PDF
    book_page: int  # page number printed in the running head
    line_no: int  # 1-based line in the page's `pdftotext -layout` output
    text: str  # the source line; a label wrapped over several lines is joined with "\n"


@dataclass(frozen=True)
class Amounts:
    original: int  # Asal
    supplementary: int  # Tambahan/(Kurangan)
    virement: int  # Viremen
    revised: int  # Jumlah
    actual: int  # Sebenar


@dataclass(frozen=True)
class Vote:
    code: str
    name: str
    section: Section
    citation: Citation


@dataclass(frozen=True)
class Programme:
    vote_code: str
    code: str
    name: str
    citation: Citation


@dataclass(frozen=True)
class Activity:
    vote_code: str
    programme_code: str
    code: str
    name: str
    citation: Citation


@dataclass(frozen=True)
class OperatingLine:
    vote_code: str
    activity_code: str
    object_code: str
    amounts: Amounts
    citation: Citation


@dataclass(frozen=True)
class PrintedTotal:
    scope: Scope
    section: Section | None  # set only for section scope
    vote_code: str | None
    programme_code: str | None
    activity_code: str | None
    object_code: str | None  # None means all object groups
    amounts: Amounts
    footnote: str | None
    citation: Citation


@dataclass(frozen=True)
class Correction:
    """A place where a named, documented rule read the source other than literally."""

    rule: str
    detail: str
    citation: Citation


@dataclass(frozen=True)
class Statement:
    fiscal_year: int
    votes: tuple[Vote, ...]
    programmes: tuple[Programme, ...]
    activities: tuple[Activity, ...]
    lines: tuple[OperatingLine, ...]
    totals: tuple[PrintedTotal, ...]
    corrections: tuple[Correction, ...]
    unreferenced_notes: tuple[str, ...]  # notes defined under "Nota:" that no line carries
