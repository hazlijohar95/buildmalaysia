"""Publish one set of tables to the hosted database, leaving every other table alone.

    DATABASE_URL=postgresql:///buildmalaysia uv run --project pipeline python scripts/publish-procurement.py
    DATABASE_URL=postgresql:///buildmalaysia uv run --project pipeline python scripts/publish-procurement.py --set bills
    DATABASE_URL=postgresql:///buildmalaysia uv run --project pipeline python scripts/publish-procurement.py --set states

`--set procurement` (the default) publishes the procurement tables; `--set bills` the bill and Act tables; `--set states`
the state finance tables.
The rows go up through `supabase db query --remote` (the linked project, signed in with `supabase login`), so no
database password is needed. They are written in chunks to a private staging schema, then swapped into the public
tables in one transaction that commits only if every row count matches. Finally each table's checksum is compared
on both sides, the same check scripts/publish-db.sh makes. A failed run leaves the public tables as they were.

`--target <postgres URL>` runs the same steps against another database, to try them on a copy first.
"""

import argparse
import json
import os
import shlex
import subprocess
import sys
import tempfile
from collections.abc import Iterator

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

# Each set's tables, parents before children: the swap inserts in this order and truncates them all at once. The
# first table is the snapshot, which must not be empty.
SETS = {
    "procurement": ("procurement_snapshot", "procurement_notice", "procurement_award"),
    "bills": ("bill_snapshot", "act", "bill", "bill_house"),
    # The `state` names come with the migration; state_gap only references them.
    "states": ("state_statement", "state_line", "state_printed_total", "state_gap"),
}
LOADERS = {"procurement": "load-procurement", "bills": "load-bills", "states": "ingest-state"}
STAGING = "{}_staging"  # one schema per set, so publishing one set never drops another's staging tables
CHUNK_BYTES = 1_500_000  # the Management API rejects a request body over about 2 MB
ROWS_PER_INSERT = 500

# Every row of a table as text, ordered by byte value in UTC, so both servers print and hash it alike.
FINGERPRINT = """select count(*) as rows, md5(coalesce(string_agg(r::text, chr(10) order by r::text collate "C"), ''))
as checksum from public.{table} r"""


class Hosted:
    """Runs SQL on the hosted database through the Supabase CLI, or with a URL on another Postgres. Returns the
    last statement's rows as dicts."""

    def __init__(self, url: str | None) -> None:
        self.url = url
        self.supabase = shlex.split(os.environ.get("SUPABASE", "npx -y supabase@latest"))

    def run(self, statement: str) -> list[dict]:
        if self.url:
            # Without parameters psycopg sends the text as one simple query, so it may hold several statements.
            with psycopg.connect(self.url, autocommit=True, row_factory=dict_row) as conn:
                cur = conn.execute(statement.encode())
                while cur.nextset():  # step to the last statement's result
                    pass
                return cur.fetchall() if cur.description else []
        with tempfile.NamedTemporaryFile("w", suffix=".sql") as f:
            f.write(statement)
            f.flush()
            command = [*self.supabase, "db", "query", "--remote", "--yes", "--output-format", "json", "-f", f.name]
            result = subprocess.run(command, check=False, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"supabase db query failed:\n{result.stdout[-2000:]}{result.stderr[-2000:]}")
        start = result.stdout.find("{")
        return json.loads(result.stdout[start:]).get("rows", []) if start >= 0 else []


def columns(conn: psycopg.Connection, table: str) -> list[str]:
    """A table's columns in order, leaving out generated ones, which Postgres fills in itself."""
    rows = conn.execute(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = %s"
        " and is_generated = 'NEVER' order by ordinal_position",
        (table,),
    ).fetchall()
    return [name for (name,) in rows]


def insert_chunks(conn: psycopg.Connection, table: str, staging: str) -> Iterator[str]:
    """Multi-row INSERTs of every local row into the staging copy of `table`, grouped into request-sized chunks."""
    cols = sql.SQL(", ").join(map(sql.Identifier, columns(conn, table)))
    head = sql.SQL("insert into {}.{} ({}) values ").format(sql.Identifier(staging), sql.Identifier(table), cols)
    head_text = head.as_string(conn)
    chunk: list[str] = []
    size = 0

    def flush() -> Iterator[str]:
        nonlocal chunk, size
        if chunk:
            yield "".join(chunk)
        chunk, size = [], 0

    with conn.cursor(name=f"publish_{table}") as cur:
        cur.itersize = ROWS_PER_INSERT
        cur.execute(sql.SQL("select {} from public.{}").format(cols, sql.Identifier(table)))
        while rows := cur.fetchmany(ROWS_PER_INSERT):
            values = ", ".join("(" + ", ".join(sql.Literal(v).as_string(conn) for v in row) + ")" for row in rows)
            statement = f"{head_text}{values};\n"
            if size + len(statement) > CHUNK_BYTES:
                yield from flush()
            chunk.append(statement)
            size += len(statement)
    yield from flush()


def swap_sql(conn: psycopg.Connection, tables: tuple[str, ...], counts: dict[str, int], staging: str) -> str:
    """One transaction: empty the public tables, fill them from staging, check every count, drop staging."""
    moves = []
    for table in tables:
        cols = ", ".join(columns(conn, table))
        moves.append(f"insert into public.{table} ({cols}) select {cols} from {staging}.{table};")
    checks = [
        f"if (select count(*) from public.{t}) <> {n} then raise exception '{t} has % rows, expected {n}',"
        f" (select count(*) from public.{t}); end if;"
        for t, n in counts.items()
    ]
    return "\n".join(
        [
            "begin;",
            f"truncate {', '.join(f'public.{t}' for t in tables)};",
            *moves,
            "do $$ begin",
            *checks,
            "end $$;",
            f"drop schema {staging} cascade;",
            "commit;",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--target",
        help="publish to this Postgres URL instead of the linked project",
    )
    parser.add_argument("--set", choices=sorted(SETS), default="procurement", help="which tables to publish")
    args = parser.parse_args()
    hosted = Hosted(args.target)
    tables = SETS[args.set]
    staging = STAGING.format(args.set)

    with psycopg.connect(os.environ.get("DATABASE_URL", "postgresql:///buildmalaysia")) as conn:
        conn.execute("set time zone 'UTC'")
        counts = {
            t: conn.execute(sql.SQL("select count(*) from {}").format(sql.Identifier(t))).fetchone()[0] for t in tables
        }
        if not counts[tables[0]]:
            print(f"The local {args.set} tables are empty: run {LOADERS[args.set]} first.", file=sys.stderr)
            return 1
        print("local: " + ", ".join(f"{t} {n:,}" for t, n in counts.items()))

        create = "".join(f"create table {staging}.{t} (like public.{t} including defaults);\n" for t in tables)
        hosted.run(f"drop schema if exists {staging} cascade;\ncreate schema {staging};\n{create}")
        try:
            sent = 0
            for table in tables:
                for chunk in insert_chunks(conn, table, staging):
                    hosted.run(chunk)
                    sent += 1
                print(f"  staged {table} ({sent} requests so far)")
            hosted.run(swap_sql(conn, tables, counts, staging))
        except BaseException:
            hosted.run(f"drop schema if exists {staging} cascade;")
            raise

        local = {t: conn.execute(FINGERPRINT.format(table=t)).fetchone() for t in tables}
    remote = {}
    for table in tables:
        [row] = hosted.run(f"set time zone 'UTC';\n{FINGERPRINT.format(table=table)};")
        remote[table] = (int(row["rows"]), row["checksum"])
    if local != remote:
        for t in tables:
            print(f"{t}: local {local[t]}, hosted {remote[t]}", file=sys.stderr)
        print(f"The hosted {args.set} tables differ from the local ones.", file=sys.stderr)
        return 1
    print("Published: " + ", ".join(f"{t} {local[t][0]:,} rows" for t in tables) + ", identical on both sides.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
