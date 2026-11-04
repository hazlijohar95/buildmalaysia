"""Parse the MOF budget book's development estimates per vote (P votes).

Each P vote prints one table of projects (Butiran, a five-digit code) with five amounts:
total project cost (Jumlah Anggaran Harga Projek), actual spending in the year before the
current one (Perbelanjaan Sebenar), the current year's revised estimate (Anggaran Dipinda)
and the budget year's estimate split into direct (Cara Langsung) and loan-funded
(Pinjaman). Projects may sit under group headings in title case, each closed by a
"Jumlah" line; the table closes with "JUMLAH ANGGARAN PERBELANJAAN PEMBANGUNAN".

A line of text after a project continues its name ("BHEUU", "(MPOB)", "Strategik"); a line
of text at the start of the table or straight after a group's Jumlah opens a group. The
reconciliation views check every Jumlah against its projects, so a wrong reading of a
heading fails the load.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass, field, replace

from pipeline.budget_detail import trailing_values
from pipeline.model import Citation
from pipeline.parse import PageText, ParseError, Value

_BOOK_PAGE = re.compile(r"^(\d+) \| ANGGARAN|ANGGARAN PERBELANJAAN PERSEKUTUAN \d{4} \| (\d+)$")
_FOOTER = re.compile(r"(?:\d+ \| )?ANGGARAN PERBELANJAAN PERSEKUTUAN \d{4}(?: \| \d+)?")
_TITLE = re.compile(r"Maksud Pembangunan (?P<num>\d+) [–-] (?P<name>.+?)(?:\s+P\.\d+)?$")
_VOTE = re.compile(r"(?<![\w./])P\.(?P<num>\d{1,2})(?![\w.])")
_PROJECT = re.compile(r"(?P<code>\d{5})(?:\s+(?P<name>.*))?")


@dataclass(frozen=True)
class ProjectAmounts:
    total_cost: int
    actual_prior: int  # actual spending two years before the budget year (2025 in Budget 2027)
    revised: int  # the current year's revised estimate (Anggaran Dipinda 2026)
    estimate_direct: int
    estimate_loan: int

    def __add__(self, other: "ProjectAmounts") -> "ProjectAmounts":
        return ProjectAmounts(
            self.total_cost + other.total_cost,
            self.actual_prior + other.actual_prior,
            self.revised + other.revised,
            self.estimate_direct + other.estimate_direct,
            self.estimate_loan + other.estimate_loan,
        )


ZERO = ProjectAmounts(0, 0, 0, 0, 0)


@dataclass
class Project:
    code: str
    parts: list[str]
    citation: Citation
    group: int | None
    amounts: ProjectAmounts | None = None

    @property
    def name(self) -> str:
        return " ".join(" ".join(self.parts).split())


@dataclass
class Group:
    ordinal: int
    name: str
    citation: Citation
    total: tuple[ProjectAmounts, Citation] | None = None


@dataclass
class DevelopmentVoteEstimate:
    code: str
    name: str
    projects: list[Project] = field(default_factory=list)
    groups: list[Group] = field(default_factory=list)
    total: tuple[ProjectAmounts, Citation] | None = None


@dataclass(frozen=True)
class DevelopmentEstimates:
    budget_year: int
    votes: tuple[DevelopmentVoteEstimate, ...]
    contingency: int  # P.70 Simpanan Luar Jangka for the budget year, sen (Lampiran D)
    appendix_checks: int  # Lampiran D rows checked against the vote tables


def _amounts(values: list[Value]) -> ProjectAmounts:
    if len(values) != 5 or any(v.marks or v.has_decimals for v in values):
        raise ValueError("expected five whole-ringgit amounts")
    a = [v.hundredths for v in values]
    return ProjectAmounts(a[0], a[1], a[2], a[3], a[4])


class _Parser:
    def __init__(self) -> None:
        self.votes: dict[str, DevelopmentVoteEstimate] = {}
        self.vote: DevelopmentVoteEstimate | None = None
        self.last: Project | None = None  # the project a text line would continue
        self.awaiting_total = False  # "JUMLAH ANGGARAN" printed, amounts on a later line
        self.pending_jumlah: str | None = None  # "Jumlah <name>" printed, amounts on the next line
        self.named_group: Group | None = None  # the group the last "Jumlah <name>" closed; its label may wrap
        self.named_group_is_headless = False
        self.jumlah_label = ""
        # Lampiran D, "Ringkasan Anggaran Perbelanjaan Pembangunan": per vote, total project
        # cost and the budget year's direct, loan and total; and the grand total.
        self.appendix: dict[str, tuple[tuple[int, int, int, int], Citation]] = {}
        self.where = Citation(0, 0, 0, "")
        self.page_offset: int | None = None
        self.known: dict[str, tuple[int, ...]] = {}  # "Lampiran D P.nn" -> appendix minus table, sen
        self.misprints_seen: list[str] = []

    def book_page(self, page: PageText, texts: list[str]) -> int | None:
        """The printed page number; Budget 2025 omits it on a few pages, which then take it
        from the PDF-to-book offset of the pages that print one."""
        printed = next((int(m[1] or m[2]) for t in texts if (m := _BOOK_PAGE.search(t))), None)
        if printed is not None:
            self.page_offset = page.pdf_page - printed
            return printed
        return page.pdf_page - self.page_offset if self.page_offset is not None else None

    def fail(self, message: str) -> ParseError:
        return ParseError(self.where.pdf_page, self.where.line_no, self.where.text, message)

    def feed_page(self, page: PageText) -> None:
        lines = page.layout.split("\n")
        texts = [" ".join(line.split()) for line in lines]
        if any(t.startswith("RINGKASAN ANGGARAN PERBELANJAAN PEMBANGUNAN TAHUN") for t in texts):
            self.appendix_page(page, texts)
            return
        if not any("Harga Projek" in t for t in texts) or any(t.startswith("LAMPIRAN ") for t in texts[:3]):
            return
        book_page = self.book_page(page, texts)
        head = next((i for i, t in enumerate(texts) if _TITLE.search(t)), None)
        if book_page is None or head is None:
            raise ParseError(page.pdf_page, 1, texts[0], "development table page without title or page number")
        title = _TITLE.search(texts[head])
        assert title is not None
        code = f"P.{int(title['num']):02d}"
        labels = {f"P.{int(m['num']):02d}" for t in texts[: head + 1] for m in _VOTE.finditer(t)}
        if labels - {code}:
            raise ParseError(page.pdf_page, head + 1, texts[head], f"title {code} beside {sorted(labels)}")
        self.enter_vote(code, title["name"])
        units = next((i for i, t in enumerate(texts) if re.fullmatch(r"RM(?: RM){4}", t)), None)
        if units is None:
            raise ParseError(page.pdf_page, 1, "", "no units line with five RM columns")
        for i in range(units + 1, len(lines)):
            text = texts[i]
            self.where = Citation(page.pdf_page, book_page, i + 1, text)
            if not text or _FOOTER.fullmatch(text):
                continue
            self.line(lines[i].strip())

    def appendix_page(self, page: PageText, texts: list[str]) -> None:
        book_page = next((int(m[1] or m[2]) for t in texts if (m := _BOOK_PAGE.search(t))), 0)
        total_label = False  # Budget 2025 prints "JUMLAH ANGGARAN PERBELANJAAN" above its amounts
        for i, text in enumerate(texts):
            self.where = Citation(page.pdf_page, book_page, i + 1, text)
            label, values, _ = trailing_values(text, 4)
            if len(values) != 4:
                total_label = total_label or text.startswith("JUMLAH ANGGARAN PERBELANJAAN")
                continue
            if not label and total_label:
                label = "JUMLAH ANGGARAN PERBELANJAAN PEMBANGUNAN"
            a = tuple(v.hundredths for v in values)
            amounts = (a[0], a[1], a[2], a[3])
            if amounts[1] + amounts[2] != amounts[3] and not label.startswith(("P.70", "JUMLAH")):
                raise self.fail("Lampiran D row: direct + loan != total")
            if (m := re.match(r"P\.(\d{1,2})\s", label)) is not None:
                self.appendix[f"P.{int(m[1]):02d}"] = (amounts, self.where)
            elif label.startswith("JUMLAH ANGGARAN PERBELANJAAN PEMBANGUNAN"):
                self.appendix["total"] = (amounts, self.where)
            else:
                raise self.fail("unknown Lampiran D row")

    def check_appendix(self) -> int:
        """Every vote table against its Lampiran D row, and the appendix's grand total."""
        if "total" not in self.appendix or "P.70" not in self.appendix:
            raise ParseError(0, 0, "", "Lampiran D not found or incomplete")
        checks = 0
        for code, vote in self.votes.items():
            if code not in self.appendix:
                raise ParseError(0, 0, "", f"{code} has no Lampiran D row")
            (cost, direct, loan, total), at = self.appendix[code]
            assert vote.total is not None
            t = vote.total[0]
            printed = (t.total_cost, t.estimate_direct, t.estimate_loan, t.estimate_direct + t.estimate_loan)
            if code == "P.70":
                # The contingency reserve's own table prints it as Cara Langsung; Lampiran D and
                # the summary pages keep it outside direct and loan. Only the totals compare.
                printed, expected = (printed[0], printed[3]), (cost, total)
            else:
                expected = (cost, direct, loan, total)
            if printed != expected:
                diffs = tuple(e - p for e, p in zip(expected, printed, strict=True))
                if self.known.get(f"Lampiran D {code}") == diffs:
                    self.misprints_seen.append(f"Lampiran D {code}")
                else:
                    raise ParseError(
                        at.pdf_page,
                        at.line_no,
                        at.text,
                        f"Lampiran D disagrees with the {code} table: appendix minus table {diffs} sen",
                    )
            checks += 1
        extra = set(self.appendix) - set(self.votes) - {"total", "P.70"}
        if extra:
            raise ParseError(0, 0, "", f"Lampiran D lists votes with no table: {sorted(extra)}")
        rows = [a for code, (a, _) in self.appendix.items() if code != "total"]
        summed = tuple(sum(r[i] for r in rows) for i in range(4))
        total, at = self.appendix["total"]
        if summed != total:
            diffs = tuple(t - r for t, r in zip(total, summed, strict=True))
            if self.known.get("Lampiran D total") != diffs:
                raise ParseError(
                    at.pdf_page, at.line_no, at.text, f"Lampiran D total {total}, its rows sum to {summed}"
                )
            self.misprints_seen.append("Lampiran D total")
        return checks + 1

    def enter_vote(self, code: str, name: str) -> None:
        if self.vote is not None and self.vote.code == code:
            return
        if self.vote is not None:
            self.finish_vote()
        if code in self.votes:
            raise self.fail(f"{code} appears again after another vote")
        self.vote = DevelopmentVoteEstimate(code, " ".join(name.split()))
        self.votes[code] = self.vote
        self.last, self.awaiting_total = None, False

    def line(self, line: str) -> None:
        vote = self.vote
        assert vote is not None
        if vote.total is not None:
            return  # notes under the table
        label, values, _ = trailing_values(line, 5)
        if len(values) < 5:
            label, values = line, []  # a name ending in a number ("Kecemasan Negara 999")
        label = " ".join(label.split())
        try:
            amounts = _amounts(values) if values else None
        except ValueError as error:
            raise self.fail(str(error)) from error
        if label.startswith("JUMLAH ANGGARAN") or (self.awaiting_total and amounts and not label):
            if amounts is None:
                self.awaiting_total = True
                return
            vote.total = (amounts, self.where)
            return
        if label.startswith("Jumlah") and amounts is None:
            self.pending_jumlah = label  # Budget 2025: "Jumlah <name>", amounts on the next line
            self.last = None
            return
        if amounts is not None and self.pending_jumlah:
            # The amounts sit on the label's next line, bare or beside more of the label.
            label, self.pending_jumlah = f"{self.pending_jumlah} {label}".strip(), None
        if label == "Jumlah" or label.startswith("Jumlah "):
            if amounts is None:
                raise self.fail("group Jumlah without amounts")
            self.close_group(vote, label.removeprefix("Jumlah").strip(), amounts)
            self.last = None
            return
        if self.named_group is not None and self.continues_jumlah(label):
            self.jumlah_label += " " + label  # the wrapped end of "Jumlah <name>"
            if self.named_group_is_headless:
                self.named_group.name = self.jumlah_label
            return
        self.named_group = None
        if (m := _PROJECT.fullmatch(label)) is not None:
            # After a group's Jumlah, projects with no new heading belong to the vote only.
            group = vote.groups[-1].ordinal if vote.groups and vote.groups[-1].total is None else None
            self.last = Project(m["code"], [m["name"] or ""], self.where, group, amounts)
            vote.projects.append(self.last)
            return
        if amounts is not None:
            if self.last is None or self.last.amounts is not None:
                raise self.fail("amounts with no project waiting for them")
            self.last.parts.append(label)
            self.last.amounts = amounts
            return
        if label.startswith("PERBELANJAAN PEMBANGUNAN"):
            return  # the second line of the closing "JUMLAH ANGGARAN PERBELANJAAN PEMBANGUNAN"
        if self.last is not None:
            self.last.parts.append(label)
            return
        vote.groups.append(Group(len(vote.groups) + 1, label, self.where))

    def continues_jumlah(self, text: str) -> bool:
        """Whether a text line after a "Jumlah <name>" finishes that name rather than opening a
        heading: for a group with a heading, while the label stays a prefix of the heading
        ("Jumlah Dasar, Pembangunan dan" + "Pengurusan"); for a headless group, while the label
        ends in a joining word or the line starts in lower case ("... Perladangan" + "dan Komoditi")."""
        assert self.named_group is not None
        joined = f"{self.jumlah_label} {text}"
        if not self.named_group_is_headless:
            heading = " ".join(self.named_group.name.split()).casefold()
            return heading != self.jumlah_label.casefold() and heading.startswith(joined.casefold())
        last = self.jumlah_label.split()[-1].casefold()
        return text[:1].islower() or last in {"dan", "-", "&", "serta", "bagi", "di", "ke"} or last.endswith(",")

    def close_group(self, vote: DevelopmentVoteEstimate, name: str, amounts: ProjectAmounts) -> None:
        """A group total closes the open group. With no group open, "Jumlah <name>" closes the
        run of projects just above it that have no heading (Budget 2025: a ministry's own
        projects), which becomes a group of that name."""
        group = vote.groups[-1] if vote.groups and vote.groups[-1].total is None else None
        headless = group is None
        if group is None:
            run: list[Project] = []
            for project in reversed(vote.projects):
                if project.group is not None:
                    break
                run.insert(0, project)
            if not name or not run:
                raise self.fail("group Jumlah with no open group and no unheaded projects above it")
            group = Group(len(vote.groups) + 1, name, run[0].citation)
            vote.groups.append(group)
            for project in run:
                project.group = group.ordinal
        group.total = (amounts, self.where)
        self.named_group = group if name else None
        self.named_group_is_headless = headless
        self.jumlah_label = name

    def finish_vote(self) -> None:
        vote = self.vote
        assert vote is not None
        if vote.total is None:
            raise self.fail(f"{vote.code} development table has no JUMLAH")
        for project in vote.projects:
            if project.amounts is None:
                c = project.citation
                raise ParseError(c.pdf_page, c.line_no, c.text, f"project {project.code} has no amounts")
        for group in vote.groups:
            if group.total is None:
                c = group.citation
                raise ParseError(c.pdf_page, c.line_no, c.text, f"group {group.name!r} has no Jumlah")
        codes = [p.code for p in vote.projects]
        if len(codes) != len(set(codes)):
            raise self.fail(f"{vote.code} repeats a project code")


def parse_development_estimates(
    pages: Sequence[PageText],
    budget_year: int,
    known_misprints: Sequence[tuple[str, tuple[int, ...]]] = (),
) -> DevelopmentEstimates:
    parser = _Parser()
    parser.known = dict(known_misprints)
    for page in pages:
        parser.feed_page(page)
    if parser.vote is not None:
        parser.finish_vote()
    checks = parser.check_appendix()
    missing = {k for k, _ in known_misprints if k.startswith("Lampiran D")} - set(parser.misprints_seen)
    if missing:
        raise ParseError(0, 0, "", f"known misprints no longer occur: {sorted(missing)}")
    contingency = parser.appendix["P.70"][0][3]
    return DevelopmentEstimates(budget_year, tuple(parser.votes.values()), contingency, checks)


# --- Lampiran F: projects of the current year dropped from the budget -------------------


@dataclass(frozen=True)
class DroppedProject:
    vote_code: str
    code: str
    name: str
    total_cost: int
    actual_prior: int  # as printed; MOF's project-level actuals are not the statement's
    allocation: int  # the current year's allocation (Peruntukan 2026 in Budget 2027)
    citation: Citation
    printed_times: int = 1  # Budget 2026 prints P.24 00200 twice and counts it twice in its JUMLAH


@dataclass(frozen=True)
class DroppedProjects:
    projects: tuple[DroppedProject, ...]
    total: tuple[int, int, int]
    total_citation: Citation


_DROPPED_VOTE = re.compile(r"Maksud\s+P\.(?P<num>\d{1,2})\s+.+")


def parse_dropped_projects(pages: Sequence[PageText]) -> DroppedProjects | None:
    """Lampiran F, "Jadual Butiran Tahun ... yang Dimansuhkan": per vote, each project of the
    current year that the budget drops, or TIADA (none), and a grand JUMLAH that must equal
    the rows. Returns None when the book has no such appendix."""
    rows: list[DroppedProject] = []
    vote: str | None = None
    parts: list[str] = []
    pending: tuple[str, list[int], Citation] | None = None
    total: tuple[tuple[int, int, int], Citation] | None = None
    found = False

    def flush() -> None:
        nonlocal pending, parts
        if pending is not None and vote is not None:
            code, a, c = pending
            name = " ".join(" ".join(parts).split())
            rows.append(DroppedProject(vote, code, name, a[0], a[1], a[2], c))
        pending, parts = None, []

    for page in pages:
        texts = [" ".join(line.split()) for line in page.layout.split("\n")]
        has_vote = any(_DROPPED_VOTE.fullmatch(t) for t in texts)
        starts_section = any("YANG DIMANSUHKAN" in t for t in texts) and has_vote
        if not starts_section and not (found and has_vote):
            continue
        found = True
        book_page = next((int(m[1] or m[2]) for t in texts if (m := _BOOK_PAGE.search(t))), 0)
        for i, text in enumerate(texts):
            at = Citation(page.pdf_page, book_page, i + 1, text)
            if (m := _DROPPED_VOTE.fullmatch(text)) is not None:
                flush()
                vote = f"P.{int(m['num']):02d}"
                continue
            if vote is None or not text or _FOOTER.fullmatch(text) or text == "TIADA":
                continue
            label, values, _ = trailing_values(text, 3)
            if len(values) == 3:
                a = [v.hundredths for v in values]
                if label == "JUMLAH":
                    flush()
                    total = ((a[0], a[1], a[2]), at)
                    continue
                if (m := _PROJECT.fullmatch(label)) is None:
                    raise ParseError(at.pdf_page, at.line_no, text, "Lampiran F row without a project code")
                flush()
                pending, parts = (m["code"], a, at), [m["name"] or ""]
            elif pending is not None:
                parts.append(text)
    flush()
    if not found:
        return None
    if total is None:
        raise ParseError(pages[-1].pdf_page, 0, "", "Lampiran F has no JUMLAH")
    summed = (sum(r.total_cost for r in rows), sum(r.actual_prior for r in rows), sum(r.allocation for r in rows))
    diffs = [t - s for t, s in zip(total[0], summed, strict=True)]
    # The actual column restates spending rounded to the ringgit per project, so its total
    # may differ from the rows by rounding (50 sen x (rows + 1)); cost and allocation are exact.
    if diffs[0] or diffs[2] or abs(diffs[1]) > 50 * (len(rows) + 1):
        c = total[1]
        raise ParseError(c.pdf_page, c.line_no, c.text, f"Lampiran F JUMLAH {total[0]}, rows sum to {summed}")
    # Named rule DUPLICATE_ROW: a project printed more than once with identical figures (and
    # counted each time in the JUMLAH, as checked above) is kept once with its count.
    distinct: dict[tuple[str, str], DroppedProject] = {}
    for row in rows:
        key = (row.vote_code, row.code)
        seen = distinct.get(key)
        if seen is None:
            distinct[key] = row
        elif (seen.name, seen.total_cost, seen.actual_prior, seen.allocation) == (
            row.name,
            row.total_cost,
            row.actual_prior,
            row.allocation,
        ):
            distinct[key] = replace(seen, printed_times=seen.printed_times + 1)
        else:
            c = row.citation
            raise ParseError(c.pdf_page, c.line_no, c.text, f"{key} printed twice with different figures")
    return DroppedProjects(tuple(distinct.values()), total[0], total[1])
