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
    # Tambahan/(Kurangan) and Viremen; None where the statement prints only Asal and the
    # revised estimate (Dipinda), as FY2016-2019 do.
    supplementary: int | None
    virement: int | None
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
    name: str | None  # None when the statement prints no heading for it (FY2022 B.24 020000)
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


# --- Lampiran 2 (Penyata Perbelanjaan Pembangunan) ----------------------------------


class DevelopmentScope(StrEnum):
    GROUP = "group"
    VOTE = "vote"
    STATEMENT = "statement"


@dataclass(frozen=True)
class DevelopmentAmounts:
    total_cost: int  # Kos Keseluruhan
    plan_actual_prior: int  # Perbelanjaan Sebenar RMKe-12 to the end of the prior year
    estimate_direct: int  # Anggaran: Cara Langsung
    estimate_loan: int  # Anggaran: Pinjaman
    estimate: int  # Anggaran: Jumlah
    actual_direct: int  # Perbelanjaan Sebenar: Cara Langsung
    actual_loan: int  # Perbelanjaan Sebenar: Pinjaman
    actual: int  # Perbelanjaan Sebenar: Jumlah
    plan_actual_to_date: int  # Perbelanjaan Sebenar RMKe-12 to the end of the year


@dataclass(frozen=True)
class SpreadCitation:
    """A row printed across a two-page spread: label and plan totals left, the year's figures right."""

    left: Citation
    right: Citation


@dataclass(frozen=True)
class DevelopmentVote:
    code: str
    name: str
    citation: Citation


@dataclass(frozen=True)
class DevelopmentGroup:
    vote_code: str
    ordinal: int  # 1-based position within the vote
    name: str
    parent_ordinal: int | None
    citation: Citation


@dataclass(frozen=True)
class DevelopmentProject:
    vote_code: str
    code: str
    group_ordinal: int | None
    name: str
    amounts: DevelopmentAmounts
    footnote: str | None
    citation: SpreadCitation


@dataclass(frozen=True)
class DevelopmentTotal:
    scope: DevelopmentScope
    vote_code: str | None
    group_ordinal: int | None
    amounts: DevelopmentAmounts
    footnote: str | None
    citation: SpreadCitation


@dataclass(frozen=True)
class DevelopmentStatement:
    fiscal_year: int
    prior_plan: str  # Malaysia Plan of the left page's spending-to-prior-year column, e.g. "RMKe-11"
    plan: str  # Malaysia Plan of the right page's spending-to-date column, e.g. "RMKe-12"
    votes: tuple[DevelopmentVote, ...]
    groups: tuple[DevelopmentGroup, ...]
    projects: tuple[DevelopmentProject, ...]
    totals: tuple[DevelopmentTotal, ...]
    corrections: tuple[Correction, ...]


# --- Lampiran 3 (Penyata Perbelanjaan Kumpulan Wang COVID-19) ---------------------------


@dataclass(frozen=True)
class CovidAmounts:
    ceiling: int  # Siling Keseluruhan
    spent_prior: int  # spent to the end of the prior year
    allocation: int  # Peruntukan
    supplementary: int  # Tambahan; zero where the statement has no such column
    virement: int  # Viremen
    revised: int  # Peruntukan Dipinda
    actual: int  # Perbelanjaan Sebenar
    spent_to_date: int  # Perbelanjaan Terkumpul


@dataclass(frozen=True)
class CovidFundLine:
    code: str
    name: str
    amounts: CovidAmounts
    citation: SpreadCitation


@dataclass(frozen=True)
class CovidFundStatement:
    fiscal_year: int
    lines: tuple[CovidFundLine, ...]
    total: CovidAmounts
    total_citation: SpreadCitation


# --- Note 5(a): Hasil mengikut penjenisan (revenue by type) ---------------------------


class RevenueCategory(StrEnum):
    REVENUE = "revenue"  # HASIL
    TAX = "tax"  # HASIL CUKAI
    DIRECT_TAX = "direct_tax"  # Cukai Langsung
    INDIRECT_TAX = "indirect_tax"  # Cukai Tidak Langsung
    NON_TAX = "non_tax"  # HASIL BUKAN CUKAI
    NON_REVENUE_RECEIPTS = "non_revenue_receipts"  # TERIMAAN BUKAN HASIL
    FEDERAL_TERRITORY = "federal_territory"  # HASIL WILAYAH PERSEKUTUAN


@dataclass(frozen=True)
class RevenueAmounts:
    original_estimate: int  # Anggaran Asal
    revised_estimate: int  # Anggaran Disemak
    actual: int  # Sebenar, the statement's year
    prior_year_actual: int  # Sebenar, the year before


@dataclass(frozen=True)
class RevenueItem:
    ordinal: int  # 1-based position among the note's items
    category: RevenueCategory  # the innermost category printed above it
    name: str
    amounts: RevenueAmounts
    citation: Citation


@dataclass(frozen=True)
class RevenueTotal:
    category: RevenueCategory
    parent: RevenueCategory | None
    name: str  # as printed
    amounts: RevenueAmounts | None  # None: printed as a heading with no amounts (FY2017 Cukai Langsung)
    citation: Citation


@dataclass(frozen=True)
class RevenueStatement:
    fiscal_year: int
    items: tuple[RevenueItem, ...]
    totals: tuple[RevenueTotal, ...]  # in printed order, each after its parent
    corrections: tuple[Correction, ...] = ()
