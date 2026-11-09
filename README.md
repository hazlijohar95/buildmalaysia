# build malaysia

where the rakyat's money went. every ringgit, every ministry, every contract.

**→ [buildmalaysia.com](https://buildmalaysia.com)**

the government publishes it in PDFs. we read them, check every total, and link each figure back to the exact page it
came from.

## run it

you need Postgres, [uv](https://docs.astral.sh/uv/) and [pnpm](https://pnpm.io/).

```bash
createdb buildmalaysia
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d buildmalaysia -f "$f"; done

cd pipeline && uv sync
uv run python -m pipeline load-lineage --database-url postgresql:///buildmalaysia
uv run python -m pipeline ingest --year 2025 --database-url postgresql:///buildmalaysia   # ~2 min

cd ../web && pnpm install && pnpm dev   # http://localhost:4321
```

that loads one year. the full load (every year, budgets, contracts) is in [`AGENTS.md`](AGENTS.md#local-development).

## using an agent?

point it at [`AGENTS.md`](AGENTS.md). it has the sources, the schema, every command and the rules. design notes live in
[`specs/`](specs/).

## the one rule

never type a number in by hand. if the parser can't read it, fix the parser.

## contribute

open a pull request. CI must pass. merging to `main` deploys.

```bash
cd web && pnpm test && pnpm lint
cd pipeline && uv run pytest -m "not integration"
```

## license

MIT. the design adapts build canada's [CanadaSpends](https://github.com/BuildCanada/CanadaSpends)
([notices](web/THIRD_PARTY_NOTICES.md)); we're not affiliated. the figures come from Malaysian government publications.
