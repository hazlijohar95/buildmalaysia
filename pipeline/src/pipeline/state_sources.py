"""State financial statements: where each comes from, its pinned hash, and how its tables are laid out.

The states publish their audited Penyata Kewangan Kerajaan Negeri on their treasury sites
(Perbendaharaan Negeri, Pejabat Kewangan Negeri). The survey of all 13 states, with the years
each publishes and why the others are not loaded, is in specs/state-finances.md; the gaps the
site shows are `STATE_GAPS` below.
"""

from dataclasses import dataclass

from pipeline.state import RowName, TableSpec


@dataclass(frozen=True)
class State:
    slug: str
    name_ms: str
    name_en: str


STATES: tuple[State, ...] = (
    State("johor", "Johor", "Johor"),
    State("kedah", "Kedah", "Kedah"),
    State("kelantan", "Kelantan", "Kelantan"),
    State("melaka", "Melaka", "Malacca"),
    State("negeri-sembilan", "Negeri Sembilan", "Negeri Sembilan"),
    State("pahang", "Pahang", "Pahang"),
    State("perak", "Perak", "Perak"),
    State("perlis", "Perlis", "Perlis"),
    State("pulau-pinang", "Pulau Pinang", "Penang"),
    State("sabah", "Sabah", "Sabah"),
    State("sarawak", "Sarawak", "Sarawak"),
    State("selangor", "Selangor", "Selangor"),
    State("terengganu", "Terengganu", "Terengganu"),
)


@dataclass(frozen=True)
class StateMisprint:
    """A printed total that disagrees with the rows under it in the statement itself.

    The load accepts exactly this difference (printed minus the rows' sum, sen per column) and
    fails if it is absent, so a parser fix or a corrected PDF cannot leave it stale. The
    mismatch stays visible in state_reconciliation."""

    section: str
    label: str  # the total as printed
    diffs_sen: dict[str, int]
    evidence: str


@dataclass(frozen=True)
class StateSource:
    id: str
    state: str  # State.slug
    fiscal_year: int
    publisher: str
    title: str
    url: str
    sha256: str
    page_count: int
    raw_path: str  # relative to the raw data directory
    revenue: TableSpec
    operating: TableSpec
    known_misprints: tuple[StateMisprint, ...] = ()
    # The site sends its certificate without its intermediate, kept in pipeline/certs/.
    intermediate: str | None = None


@dataclass(frozen=True)
class StateGap:
    """A state, or one year of it, that is not loaded, and why."""

    state: str
    fiscal_year: int | None  # None: no year of this state is loaded
    reason: str
    source_url: str | None = None


# The two notes print the same headings and totals in every state; only the spellings differ.
REVENUE_HEADINGS = {
    "hasil cukai": "hasil_cukai",
    "hasil bukan cukai": "hasil_bukan_cukai",
    "terimaan bukan hasil": "terimaan_bukan_hasil",
}
REVENUE_TOTALS: dict[str, tuple[str, str | None]] = {
    "jumlah hasil cukai": ("category", "hasil_cukai"),
    "jumlah hasil bukan cukai": ("category", "hasil_bukan_cukai"),
    "jumlah terimaan bukan hasil": ("category", "terimaan_bukan_hasil"),
    "jumlah hasil": ("statement", None),
}
OPERATING_HEADINGS = {
    "perbelanjaan tanggungan": "tanggungan",
    "perbelanjaan bekalan": "bekalan",
    "perbelanjaan bekalan (samb.)": "bekalan",
    "perbelanjaan perbekalan": "bekalan",
}
OPERATING_TOTALS: dict[str, tuple[str, str | None]] = {
    "jumlah perbelanjaan tanggungan": ("category", "tanggungan"),
    "jumlah perbelanjaan bekalan": ("category", "bekalan"),
    "jumlah perbelanjaan perbekalan": ("category", "bekalan"),
}
REVENUE_COLUMNS = ("original", "revised", "actual", None, "prior_actual", None)
OPERATING_COLUMNS = ("original", "revised", "actual", None)

_START = r"seperti berikut:?-?$"  # the sentence that introduces each table

STATE_SOURCES: dict[tuple[str, int], StateSource] = {
    ("melaka", 2023): StateSource(
        id="melaka-penyata-kewangan-2023",
        state="melaka",
        fiscal_year=2023,
        publisher="Jabatan Kewangan dan Perbendaharaan Negeri Melaka",
        title="Penyata Kewangan Kerajaan Negeri Melaka 2023",
        url="https://jkpnm.melaka.gov.my/xs/dl.php?filename=af794788866044244f56925fe4c7b502.pdf",
        sha256="4c85d009d655a616f623ad968803eabe2308206b6122c39b063f8a2fc0b798d7",
        page_count=108,
        raw_path="states/melaka/2023.pdf",
        revenue=TableSpec(
            section="revenue",
            pages=(46, 46),
            start=_START,
            end=r"^JUMLAH HASIL \d",
            columns=REVENUE_COLUMNS,
            amount_x=170,
            wrap="middle",
            headings=REVENUE_HEADINGS,
            totals=REVENUE_TOTALS,
        ),
        operating=TableSpec(
            section="operating",
            pages=(47, 48),
            start=_START,
            resume=r"^NOTA KEPADA PENYATA KEWANGAN$",
            end=r"^PERBELANJAAN MENGURUS \(SELEPAS PINDAHAN\)",
            columns=OPERATING_COLUMNS,
            amount_x=290,
            wrap="middle",
            code=r"[TB]\d{2}",
            headings=OPERATING_HEADINGS,
            totals={
                **OPERATING_TOTALS,
                # Note 5(b) prints B09's actual without the transfer to the Development Fund.
                "perbelanjaan mengurus (sebelum pindahan)": ("statement", None),
                "perbelanjaan mengurus (selepas pindahan)": ("statement_plus_transfer", None),
            },
            transfers=(
                (
                    "pindahan akaun hasil disatukan ke kumpulan wang pembangunan (dari b09 - sumbangan kepada"
                    " kumpulan wang berkanun)"
                ),
            ),
            skip=(r"PENYATA KEWANGAN 2023 \|", r"\| PENYATA KEWANGAN 2023"),
        ),
    ),
    ("terengganu", 2024): StateSource(
        id="terengganu-penyata-kewangan-2024",
        state="terengganu",
        fiscal_year=2024,
        publisher="Pejabat Perbendaharaan Negeri Terengganu",
        title="Penyata Kewangan Kerajaan Negeri Terengganu 2024",
        url="https://perbendaharaan.terengganu.gov.my/images/2025/muat_turun/penyatakew2024new1.pdf",
        sha256="4324d5463a31ec041c73f4fb0322391b44057f1422b0af00e222b5f1275aa170",
        page_count=97,
        raw_path="states/terengganu/2024.pdf",
        revenue=TableSpec(
            section="revenue",
            pages=(38, 38),
            start=_START,
            end=r"^JUMLAH HASIL \d",
            columns=REVENUE_COLUMNS,
            amount_x=140,
            wrap="middle",
            headings=REVENUE_HEADINGS,
            totals=REVENUE_TOTALS,
        ),
        operating=TableSpec(
            section="operating",
            pages=(39, 40),
            start=_START,
            end=r"^\(selepas caruman\)$",
            columns=OPERATING_COLUMNS,
            amount_x=270,
            wrap="middle",
            code=r"[TB]\d{2}",
            headings=OPERATING_HEADINGS,
            totals={
                **OPERATING_TOTALS,
                "perbelanjaan mengurus (sebelum caruman)": ("statement_less_transfer", None),
                "perbelanjaan mengurus (selepas caruman)": ("statement", None),
            },
            transfers=("caruman ke kumpulan wang pembangunan",),
            skip=(r"^\d{1,2}/\d{1,2}/\d{4}",),  # the print date on p40
        ),
    ),
    ("perak", 2024): StateSource(
        id="perak-penyata-kewangan-2024",
        state="perak",
        fiscal_year=2024,
        publisher="Pejabat Kewangan Negeri Perak",
        title="Penyata Kewangan Kerajaan Negeri Perak Darul Ridzuan 2024",
        url="https://kewangan.perak.gov.my/images/PenyataKewangan/BUKU_PENYATA_KEWANGAN_2024.pdf",
        sha256="60146e3867f3e925115b41c5670d325e08a409a869f43293b75c54b6bea27c69",
        page_count=106,
        raw_path="states/perak/2024.pdf",
        intermediate="sectigo-public-server-authentication-ca-dv-r36.pem",
        revenue=TableSpec(
            section="revenue",
            pages=(32, 32),
            start=_START,
            end=r"^JUMLAH HASIL \d",
            columns=REVENUE_COLUMNS,
            amount_x=170,
            wrap="bottom",
            headings=REVENUE_HEADINGS,
            totals=REVENUE_TOTALS,
            row_names=(
                # The page prints "Pulangan Balik" level with Pemberian Pelancongan's amounts and
                # "Perbelanjaan" level with its own; the two rows are 6,993.00 and 381,340.00.
                RowName(
                    32,
                    "Pemberian Pelancongan Pulangan Balik",
                    "Pemberian Pelancongan",
                    "p32: the 'Pulangan Balik' words sit on the 6,993.00 row's line, one line above 'Perbelanjaan'",
                ),
                RowName(
                    32,
                    "Perbelanjaan",
                    "Pulangan Balik Perbelanjaan",
                    "p32: the second half of 'Pulangan Balik Perbelanjaan', the item every state prints",
                ),
            ),
        ),
        operating=TableSpec(
            section="operating",
            pages=(33, 34),
            start=_START,
            resume=r"^\(sambungan\)$",
            end=r"^\(selepas caruman\)",
            columns=OPERATING_COLUMNS,
            amount_x=230,
            wrap="coded_top",
            code=r"[TB]\. \d{2}",
            headings=OPERATING_HEADINGS,
            totals={
                **OPERATING_TOTALS,
                "perbelanjaan mengurus (sebelum caruman)": ("statement_less_transfer", None),
                "perbelanjaan mengurus (selepas caruman)": ("statement", None),
            },
            transfers=("caruman ke kumpulan wang pembangunan",),
            skip=(r"^\(disambung\)$", r"PENYATA KEWANGAN 2024 • KERAJAAN NEGERI PERAK"),
        ),
    ),
    ("sabah", 2024): StateSource(
        id="sabah-penyata-kewangan-2024",
        state="sabah",
        fiscal_year=2024,
        publisher="Jabatan Bendahari Negeri Sabah",
        title="Penyata Kewangan Negeri Sabah 2024",
        # Linked from https://jbns.sabah.gov.my/page.php?page=textnopic&menu=info-perakaunan&sub=penyata-kewangan-negeri-sabah
        url="https://drive.google.com/uc?export=download&id=1FIe3ZhiY0E13kTjmddK5TFy5FuW8UP08",
        sha256="77de22c9a6bbf7b1162a86a104ffc844c410d5e9b65e9106df619ba0e8bc8960",
        page_count=169,
        raw_path="states/sabah/2024.pdf",
        revenue=TableSpec(
            section="revenue",
            pages=(60, 60),
            start=r"^bagi tahun berakhir 31 Disember 2024$",
            end=r"^JUMLAH HASIL \d",
            columns=REVENUE_COLUMNS,
            amount_x=230,
            wrap="middle",
            code=r"\d{5}",
            headings=REVENUE_HEADINGS,
            totals=REVENUE_TOTALS,
        ),
        operating=TableSpec(
            section="operating",
            pages=(42, 43),
            start=r"mengikut undang-undang Negeri\.$",
            resume=r"dibaca bersama dengannya\)$",
            end=r"^PERBEKALAN$",
            columns=OPERATING_COLUMNS,
            amount_x=280,
            wrap="middle",
            code=r"[CS]\d{2}(?:-S\d{2})?",
            headings=OPERATING_HEADINGS,
            totals={**OPERATING_TOTALS, "jumlah perbelanjaan tanggungan dan perbekalan": ("statement", None)},
        ),
        known_misprints=(
            StateMisprint(
                "operating",
                "JUMLAH PERBELANJAAN PERBEKALAN",
                {"revised": -1_000},
                "Note 10 (pdf p43) prints Perbekalan's Anggaran Disemak as 6,467,330,663.00; its votes sum to"
                " 6,467,330,673.00. The total for Tanggungan and Perbekalan below it, 6,732,654,860.07, is the"
                " votes' sum plus Tanggungan's 265,324,187.07, as is Penyata C2's JUMLAH KESELURUHAN (pdf p73).",
            ),
        ),
    ),
}


_LKAN = (
    "The Auditor-General's report on the state (Laporan Ketua Audit Negara 3/2025, tabled in Parliament) reprints"
    " the audited statements and notes as page images with no text layer (checked for Kedah), and"
    " lkan.audit.gov.my refused connections during the survey."
)

STATE_GAPS: tuple[StateGap, ...] = (
    StateGap(
        "johor",
        None,
        "Perbendaharaan Negeri Johor does not publish its financial statements: its site lists only the circulars"
        " on preparing them. " + _LKAN,
        "https://pnj.johor.gov.my/",
    ),
    StateGap(
        "kedah",
        None,
        "No financial statement was found on the Kedah treasury's site (pkpk.kedah.gov.my returned server errors"
        " during the survey). " + _LKAN,
        "https://pkpk.kedah.gov.my/",
    ),
    StateGap(
        "kelantan",
        None,
        "Perbendaharaan Negeri Kelantan publishes its annual reports only up to 2018 and no financial statements. "
        + _LKAN,
        "https://pkn.kelantan.gov.my/",
    ),
    StateGap(
        "melaka",
        2024,
        "Melaka's treasury has published its statements for 2018 to 2023; 2024 was not yet online.",
        "https://jkpnm.melaka.gov.my/penyata-kewangan",
    ),
    StateGap(
        "negeri-sembilan",
        2024,
        "The 2024 statement draws each note twice, overlapping at two sizes, so its text cannot be read row by"
        " row without guessing which copy a word belongs to.",
        "https://pkwns.ns.gov.my/penyata-kewangan",
    ),
    StateGap(
        "pahang",
        None,
        "Pejabat Kewangan dan Perbendaharaan Negeri Pahang publishes its budget books but not its financial"
        " statements. " + _LKAN,
        "https://pkn.pahang.gov.my/index.php/sumber/penerbitan",
    ),
    StateGap(
        "perlis",
        None,
        "Perbendaharaan Negeri Perlis lists its statements for 2006 to 2016 only.",
        "https://perbendaharaan.perlis.gov.my/index.php/sumber/penyata-kewangan-negeri",
    ),
    StateGap(
        "pulau-pinang",
        2024,
        "Penang's 2024 and 2023 statements are scanned pages with no text layer; reading them needs OCR checked"
        " against every printed total, which is not yet done.",
        "https://jkn.penang.gov.my/index.php/ms/sumber/muat-turun/category/32-penyata-kewangan-kerajaan-negeri-pulau-pinang",
    ),
    StateGap(
        "sarawak",
        None,
        "Sarawak's statement is tabled in the state assembly but was not found published online. " + _LKAN,
    ),
    StateGap(
        "selangor",
        None,
        "Perbendaharaan Negeri Selangor publishes its 2024 statement (114 pages; the revenue and operating notes,"
        " pdf pages 50 to 53, have a text layer), but its table layout is not yet registered for reading.",
        "https://pwn.selangor.gov.my/wp-content/uploads/PENYATA-KEWANGAN-KERAJAAN-NEGERI-SELANGOR-2024.pdf",
    ),
)
