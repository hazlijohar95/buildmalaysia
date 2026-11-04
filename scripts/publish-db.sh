#!/usr/bin/env bash
# Replace the data in the hosted database with the local database's, in one
# transaction, then check that every table holds the same rows on both sides.
# The schema must already match: apply migrations first with `supabase db push`.
#
#   SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres scripts/publish-db.sh
#
# pg_dump must match the local server's major version; point PG_DUMP at it if
# the one on PATH is older (PG_DUMP=/opt/homebrew/opt/postgresql@17/bin/pg_dump).
set -euo pipefail

local_url=${DATABASE_URL:-postgresql:///buildmalaysia}
remote_url=${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Supabase session pooler URL}

tables=$(psql "$local_url" -Atc "select string_agg(format('public.%I', tablename), ', ' order by tablename) from pg_tables where schemaname = 'public'")

# Dump to a file first: a dump that fails halfway must never reach the commit.
dump=$(mktemp)
trap 'rm -f "$dump"' EXIT
"${PG_DUMP:-pg_dump}" --data-only --no-owner --no-privileges --schema=public --file="$dump" "$local_url"

psql "$remote_url" -q -v ON_ERROR_STOP=1 --single-transaction \
  -c "truncate $tables" -f "$dump" >/dev/null

# Exact counts and a checksum of every row per table, so a silent difference cannot pass.
# Rows are ordered by byte value and printed in UTC so both servers render them alike.
fingerprint=$(psql "$local_url" -Atc "
  select string_agg(format(\$\$select %L, count(*), md5(coalesce(string_agg(r::text, chr(10) order by r::text collate \"C\"), '')) from public.%I r\$\$, tablename, tablename), ' union all ' order by tablename) || ' order by 1'
  from pg_tables where schemaname = 'public'")

export PGTZ=UTC
psql "$local_url" -At -v ON_ERROR_STOP=1 -c "$fingerprint" >"$dump.local"
psql "$remote_url" -At -v ON_ERROR_STOP=1 -c "$fingerprint" >"$dump.remote"
trap 'rm -f "$dump" "$dump.local" "$dump.remote"' EXIT

if ! diff "$dump.local" "$dump.remote"; then
  echo "The hosted database differs from the local one (lines above)." >&2
  exit 1
fi
echo "Published: $(wc -l <"$dump.local" | tr -d ' ') tables, $(awk -F'|' '{n += $2} END {print n}' "$dump.local") rows, identical on both sides."
