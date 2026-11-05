"""Ministry lineage: the curated files in data/lineage/ and the checks that tie them to the loaded documents.

A vote number is a funding line, not an institution. The files name each institution (a body),
every name it has carried, which body held each vote code in each fiscal year, and each
reorganisation between bodies, with a citation on every row and no amounts. `load_lineage` replaces
the five tables from the files; `lineage_problems` lists every printed vote in the statements and
budget books that the files do not cover, which the loaders use to refuse a document the next
reshuffle has changed.
"""

import csv
import re
import unicodedata
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal

import psycopg

DEFAULT_LINEAGE_DIR = Path(__file__).resolve().parents[3] / "data" / "lineage"

Origin = Literal["printed", "gazetted", "acronym"]
Confidence = Literal["high", "medium", "unverified"]
ORIGINS: tuple[Origin, ...] = ("printed", "gazetted", "acronym")
CONFIDENCES: tuple[Confidence, ...] = ("high", "medium", "unverified")
VOTE_CODE = re.compile(r"^[TBP]\.[0-9]{2}$")
SHARED_NUMBER = re.compile(r"^B/P\.([0-9]{2})$")


class LineageError(Exception):
    pass


@dataclass(frozen=True)
class Citation:
    id: str
    url: str
    title: str
    locator: str | None
    quote: str | None
    retrieved: date


@dataclass(frozen=True)
class Body:
    id: str
    name_ms: str
    established: date | None
    dissolved: date | None


@dataclass(frozen=True)
class Alias:
    body_id: str
    name_ms: str
    valid_from: date | None
    valid_to: date | None
    origin: Origin
    confidence: Confidence
    citation_id: str


@dataclass(frozen=True)
class VoteHolder:
    vote_code: str
    body_id: str
    from_year: int
    to_year: int | None


@dataclass(frozen=True)
class Edge:
    id: str
    predecessor: str
    successor: str
    effective: date
    whole: bool
    functions: str
    confidence: Confidence
    citation_id: str


@dataclass(frozen=True)
class Lineage:
    citations: tuple[Citation, ...]
    bodies: tuple[Body, ...]
    aliases: tuple[Alias, ...]
    holders: tuple[VoteHolder, ...]
    edges: tuple[Edge, ...]


def slugify(name: str) -> str:
    """The web's slug for a name: "KEMENTERIAN PENDIDIKAN TINGGI" -> "kementerian-pendidikan-tinggi"."""
    ascii_name = unicodedata.normalize("NFKD", name.lower())
    return re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")


def read_lineage(directory: Path = DEFAULT_LINEAGE_DIR) -> Lineage:
    """Read and cross-check the five files; raise LineageError naming the first bad row."""
    citations = tuple(_citation(r) for r in _rows(directory / "citations.csv"))
    bodies = tuple(_body(r) for r in _rows(directory / "bodies.csv"))
    aliases = tuple(_alias(r) for r in _rows(directory / "aliases.csv"))
    holders = tuple(h for r in _rows(directory / "vote_holders.csv") for h in _holders(r))
    edges = tuple(_edge(r) for r in _rows(directory / "edges.csv"))
    lineage = Lineage(citations, bodies, aliases, holders, edges)
    _cross_check(lineage)
    return lineage


def _rows(path: Path) -> Iterator[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as f:
        for n, row in enumerate(csv.DictReader(f), start=2):
            if None in row or None in row.values():
                raise LineageError(f"{path.name} line {n}: wrong number of columns")
            yield {k: v.strip() for k, v in row.items()}


def _date(value: str, where: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise LineageError(f"{where}: bad date {value!r}, expected YYYY-MM-DD") from None


def _optional_date(value: str, where: str) -> date | None:
    return _date(value, where) if value else None


def _year(value: str, where: str) -> int:
    if not re.fullmatch(r"[0-9]{4}", value):
        raise LineageError(f"{where}: bad year {value!r}")
    return int(value)


def _choice[T: str](value: str, choices: tuple[T, ...], where: str) -> T:
    for choice in choices:
        if value == choice:
            return choice
    raise LineageError(f"{where}: {value!r} is not one of {', '.join(choices)}")


def _required(row: dict[str, str], key: str, where: str) -> str:
    value = row.get(key, "")
    if not value:
        raise LineageError(f"{where}: {key} is required")
    return value


def _citation(r: dict[str, str]) -> Citation:
    where = f"citations.csv {r.get('id') or '?'}"
    return Citation(
        id=_required(r, "id", where),
        url=_required(r, "url", where),
        title=_required(r, "title", where),
        locator=r.get("locator") or None,
        quote=r.get("quote") or None,
        retrieved=_date(_required(r, "retrieved", where), where),
    )


def _body(r: dict[str, str]) -> Body:
    where = f"bodies.csv {r.get('id') or '?'}"
    body = Body(
        id=_required(r, "id", where),
        name_ms=_required(r, "name_ms", where),
        established=_optional_date(r.get("established", ""), where),
        dissolved=_optional_date(r.get("dissolved", ""), where),
    )
    if body.id != slugify(body.id):
        raise LineageError(f"{where}: id must be lower-case words joined by hyphens")
    if body.established and body.dissolved and body.dissolved < body.established:
        raise LineageError(f"{where}: dissolved before established")
    return body


def _alias(r: dict[str, str]) -> Alias:
    where = f"aliases.csv {r.get('body_id') or '?'} {r.get('name_ms') or '?'}"
    alias = Alias(
        body_id=_required(r, "body_id", where),
        name_ms=_required(r, "name_ms", where),
        valid_from=_optional_date(r.get("valid_from", ""), where),
        valid_to=_optional_date(r.get("valid_to", ""), where),
        origin=_choice(_required(r, "origin", where), ORIGINS, where),
        confidence=_choice(_required(r, "confidence", where), CONFIDENCES, where),
        citation_id=_required(r, "citation_id", where),
    )
    if alias.valid_from and alias.valid_to and alias.valid_to < alias.valid_from:
        raise LineageError(f"{where}: valid_to before valid_from")
    return alias


def _holders(r: dict[str, str]) -> list[VoteHolder]:
    """One row per vote; "B/P.nn" stands for the supply and development votes that share a number."""
    where = f"vote_holders.csv {r.get('vote') or '?'} {r.get('body_id') or '?'}"
    vote = _required(r, "vote", where)
    body_id = _required(r, "body_id", where)
    from_year = _year(_required(r, "from_year", where), where)
    to_year = _year(r["to_year"], where) if r.get("to_year") else None
    if to_year is not None and to_year < from_year:
        raise LineageError(f"{where}: to_year before from_year")
    if shared := SHARED_NUMBER.match(vote):
        codes = [f"B.{shared.group(1)}", f"P.{shared.group(1)}"]
    elif VOTE_CODE.match(vote):
        codes = [vote]
    else:
        raise LineageError(f"{where}: vote must look like B/P.33, B.29, P.70 or T.10")
    return [VoteHolder(code, body_id, from_year, to_year) for code in codes]


def _edge(r: dict[str, str]) -> Edge:
    where = f"edges.csv {r.get('id') or '?'}"
    whole = _choice(_required(r, "whole", where), ("true", "false"), where) == "true"
    edge = Edge(
        id=_required(r, "id", where),
        predecessor=_required(r, "predecessor", where),
        successor=_required(r, "successor", where),
        effective=_date(_required(r, "effective", where), where),
        whole=whole,
        functions=r.get("functions", ""),
        confidence=_choice(_required(r, "confidence", where), CONFIDENCES, where),
        citation_id=_required(r, "citation_id", where),
    )
    if edge.predecessor == edge.successor:
        raise LineageError(f"{where}: predecessor and successor are the same body")
    if edge.whole == bool(edge.functions):
        raise LineageError(f"{where}: name the functions that moved, or mark the edge whole, not both")
    return edge


def _cross_check(lineage: Lineage) -> None:
    for name, ids in (
        ("citations.csv", [c.id for c in lineage.citations]),
        ("bodies.csv", [b.id for b in lineage.bodies]),
        ("edges.csv", [e.id for e in lineage.edges]),
    ):
        if dupes := [i for i, n in Counter(ids).items() if n > 1]:
            raise LineageError(f"{name}: duplicate id {dupes[0]!r}")
    bodies = {b.id: b for b in lineage.bodies}
    citations = {c.id for c in lineage.citations}
    for alias in lineage.aliases:
        where = f"aliases.csv {alias.body_id} {alias.name_ms}"
        if alias.body_id not in bodies:
            raise LineageError(f"{where}: unknown body")
        if alias.citation_id not in citations:
            raise LineageError(f"{where}: unknown citation {alias.citation_id!r}")
    for holder in lineage.holders:
        if holder.body_id not in bodies:
            raise LineageError(f"vote_holders.csv {holder.vote_code} {holder.body_id}: unknown body")
    for edge in lineage.edges:
        for body_id in (edge.predecessor, edge.successor):
            if body_id not in bodies:
                raise LineageError(f"edges.csv {edge.id}: unknown body {body_id!r}")
        if edge.citation_id not in citations:
            raise LineageError(f"edges.csv {edge.id}: unknown citation {edge.citation_id!r}")

    names = {(a.body_id, a.name_ms) for a in lineage.aliases}
    for body in lineage.bodies:
        if (body.id, body.name_ms) not in names:
            raise LineageError(f"bodies.csv {body.id}: name_ms {body.name_ms!r} is not one of its aliases")

    # A slug resolves to one body, so every old address redirects to one page.
    slug_owner: dict[str, str] = {}
    for alias in lineage.aliases:
        slug = slugify(alias.name_ms)
        if slug_owner.setdefault(slug, alias.body_id) != alias.body_id:
            raise LineageError(
                f"aliases.csv: {alias.name_ms!r} would give {slug_owner[slug]} and {alias.body_id} the same slug"
            )

    # Supply and development votes with one number belong to one body in a year.
    held: dict[tuple[str, int], str] = {}
    horizon = max(h.to_year or h.from_year for h in lineage.holders)
    for holder in lineage.holders:
        for year in range(holder.from_year, (holder.to_year if holder.to_year is not None else horizon) + 1):
            if held.setdefault((holder.vote_code, year), holder.body_id) != holder.body_id:
                raise LineageError(f"vote_holders.csv: {holder.vote_code} has two holders in {year}")
    for (code, year), body_id in held.items():
        other = held.get((("P" if code[0] == "B" else "B") + code[1:], year))
        if code[0] in "BP" and other is not None and other != body_id:
            raise LineageError(f"vote_holders.csv: B{code[1:]} and P{code[1:]} have different holders in {year}")


@dataclass(frozen=True)
class LineageLoadResult:
    bodies: int
    aliases: int
    holders: int
    edges: int
    checked: int  # printed vote names in the loaded documents, all covered


def load_lineage(conn: psycopg.Connection, lineage: Lineage) -> LineageLoadResult:
    """Replace the lineage tables from the files in one transaction, then check every loaded document against them.

    The connection must be in autocommit mode, so that the transaction below is the whole transaction.
    """
    if not conn.autocommit:
        raise ValueError("load_lineage needs an autocommit connection")
    with conn.transaction(), conn.cursor() as cur:
        for table in ("lineage_edge", "vote_holder", "body_alias", "body", "citation"):
            cur.execute(f"delete from {table}")
        cur.executemany(
            "insert into citation (id, url, title, locator, quote, retrieved) values (%s, %s, %s, %s, %s, %s)",
            [(c.id, c.url, c.title, c.locator, c.quote, c.retrieved) for c in lineage.citations],
        )
        cur.executemany(
            "insert into body (id, name_ms, established, dissolved) values (%s, %s, %s, %s)",
            [(b.id, b.name_ms, b.established, b.dissolved) for b in lineage.bodies],
        )
        cur.executemany(
            """
            insert into body_alias (body_id, name_ms, valid_from, valid_to, origin, confidence, citation_id)
            values (%s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (a.body_id, a.name_ms, a.valid_from, a.valid_to, a.origin, a.confidence, a.citation_id)
                for a in lineage.aliases
            ],
        )
        cur.executemany(
            "insert into vote_holder (vote_code, body_id, from_year, to_year) values (%s, %s, %s, %s)",
            [(h.vote_code, h.body_id, h.from_year, h.to_year) for h in lineage.holders],
        )
        cur.executemany(
            """
            insert into lineage_edge (id, predecessor, successor, effective, whole, functions, confidence, citation_id)
            values (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (e.id, e.predecessor, e.successor, e.effective, e.whole, e.functions, e.confidence, e.citation_id)
                for e in lineage.edges
            ],
        )
        require_lineage(cur)
        checked = cur.execute("select count(*) from vote_lineage_check").fetchone()
    return LineageLoadResult(
        bodies=len(lineage.bodies),
        aliases=len(lineage.aliases),
        holders=len(lineage.holders),
        edges=len(lineage.edges),
        checked=int(checked[0]) if checked else 0,
    )


def require_lineage(cur: psycopg.Cursor, source: str | None = None, fiscal_year: int | None = None) -> None:
    """Raise LineageError unless every printed vote name (in one document, or all) has a holder and an alias."""
    cur.execute(
        """
        select source, fiscal_year, vote_code, name_ms, problem from vote_lineage_check
        where problem is not null
          and (%(source)s::text is null or source = %(source)s)
          and (%(year)s::int is null or fiscal_year = %(year)s)
        order by 1, 2, 3
        """,
        {"source": source, "year": fiscal_year},
    )
    problems = cur.fetchall()
    if problems:
        lines = "\n".join(f"  {src} {year} {code} {name!r}: {problem}" for src, year, code, name, problem in problems)
        raise LineageError(
            f"{len(problems)} printed vote names are not covered by data/lineage/ (add the body, vote holder or alias,"
            f" then rerun `python -m pipeline load-lineage`); load rolled back\n{lines}"
        )
