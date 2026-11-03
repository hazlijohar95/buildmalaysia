# York Factory: reverse-engineered spec

Source: `reference/york_factory` (Build Canada). The repo has **no license**, so this document describes concepts and design in our own words. It contains no copied code. Paths are relative to the repo root.

Labels: **[V]** means I verified it in code or schema. **[I]** means it is an inference. **[D]** means only the repo's own docs claim it and I did not confirm it in code.

---

## 0. Findings that change the brief

1. **The fiscal pipeline is a small part of the repo [V].** `CLAUDE.md` describes York Factory as a "Canadian Fiscal Data Pipeline + CMS". The code now holds a general open-data warehouse for Build Canada: fiscal data, spending awards, a KPI claim/fact platform, geography, elections, economy indicators, lobbying, and media/broadcast capture. It also runs a CMS, member auth, marketing-analytics syncs, and search. Its migrations run from March to October 2026 (`db/migrate`, 141 files).
2. **The warehouse is a Postgres schema, not a separate database [V].** `AGENTS.md` says "warehouse database". In `config/database.yml` there is one primary DB with `schema_search_path: public,warehouse`. `app/models/warehouse.rb` prefixes table names with `warehouse.`, and `db/structure.sql` defines the `warehouse` schema. Queue, cache and cable data live in separate DBs.
3. **Other apps consume the warehouse over an HTTP API and a search index, not a shared DB connection [V/I].** No DB roles, grants or replicas exist anywhere in `db/` or `config/` [V]. The documented consumers are the public JSON API (`docs/api/README.md`, base URL `api.buildcanada.com`), the TradingPost frontend (`AGENTS.md`), a Next.js site that York Factory revalidates (`app/services/nextjs_revalidator.rb`), and the "member apps" platform `buildcanada.app`. That platform uses York Factory only as an OAuth identity provider (`lib/tasks/member_apps.rake`). The `CLAUDE.md` phrase "shared, queryable Postgres tables" has no DB-level mechanism behind it [I].
4. **Supplementary Estimates are not actually ingested [V].** Only two fiscal sources are seeded: one InfoBase CSV and Main Estimates 2025-26 (`db/seeds.rb`). The Estimates normaliser can recognise Supplementary columns, but no source supplies them.
5. **Docs disagree on hosting.** `AGENTS.md` names PlanetScale Postgres. `CLAUDE.md` and `config/credentials.yml.sample` name Supabase. Production DB settings come from encrypted credentials, so I cannot tell which is current.

---

## 1. Purpose and the two halves

| Half | Postgres schema | What lives there | Evidence |
|---|---|---|---|
| **Warehouse**: scraped public data | `warehouse.*` | Sources, raw ingestions, organisations and aliases, fiscal authorities and expenditures, spending awards, KPI observations, geo boundaries and crosswalks, elections, economy measures, lobbying, media | `app/models/warehouse/**`, `AGENTS.md` ("no private or application data in this database") |
| **Application**: CMS, users, growth | `public.*` | Memos, posts, builders, team, tools, FAQs, feed, testimonials, polls, subscribers, users/API keys/OAuth, HubSpot/Luma/Substack mirrors, social-metrics tables, trade-barriers tracker, saved searches | `app/models/*.rb`, `db/structure.sql` |

Both halves run in one Rails 8 API-mode app (`ApplicationController` inherits from the API base), with an HTML admin under `/admin` (`config/routes.rb`).

---

## 2. Fiscal data

### 2.1 Sources (all [V] from seeds)

| Source name | Publisher / dataset | Format | Years | Frequency | File |
|---|---|---|---|---|---|
| `infobase_authorities` | TBS GC InfoBase "expenditures and authorities by vote" (Public Accounts figures), on open.canada.ca (`.../eav_eac_en.csv`) | CSV | All years in the file (test fixture uses `2023-24`) | manual | `db/seeds.rb` |
| `estimates_main_2025_26` | TBS Main Estimates organisation summary (`canada.ca/.../main-estimates/2025-26/organization-summary.csv`) | CSV | Columns for prior-year actuals, prior-year Mains, estimates to date, and current Mains | manual | `db/seeds.rb` |
| `spending_proactive_contracts` | Proactive Disclosure, Contracts (open.canada.ca datastore dump) | CSV (streamed) | rolling | weekly | `db/seeds/spending_sources.rb` |
| `spending_aggregated_contracts` | Proactive Disclosure, contracts under $10k | CSV | rolling | quarterly | same |
| `spending_proactive_grants` | Proactive Disclosure, Grants and Contributions | CSV | rolling | weekly | same |
| `spending_transfer_payments` | Public Accounts, yearly transfer payments (CKAN `package_show`) | CSV via CKAN | multi-year | annual | same |
| `spending_global_affairs_projects` | Global Affairs IATI activity files | IATI XML | rolling | daily | same |
| `spending_cihr_awards`, `spending_nserc_awards`, `spending_sshrc_awards` | Research council award databases | JSON / CSV | rolling | monthly | same |

All spending sources record the Open Government Licence – Canada plus an attribution line in `sources.license` and `sources.attribution`. The spending set was "ported from the legacy Canada Spends scraper" (seed header comment), which is the `reference/CanadaSpends` repo.

Non-fiscal sources exist for context only. They include StatCan 2021 census boundaries, federal and provincial electoral districts, school-board wards, the Open Database of Addresses, about 40 economy indicators (World Bank, OECD, OWID, StatCan; `db/seeds/economy_sources.rb`), and municipal election candidates.

### 2.2 Normalised schema (fiscal core)

All tables below are in the `warehouse` schema and verified in `db/structure.sql`.

- **`jurisdictions`** holds `code`, `slug`, `level` (municipal through supranational, enforced by a check), `fiscal_year_start_month` (1–12), `default_currency` (default CAD) and `region_code`. When an organisation has no jurisdiction, it defaults to code `CA` (`organization.rb`).
- **`organizations`** is the department/agency entity. It has `canonical_name`, `slug` (both unique per jurisdiction), `org_id_infobase` (unique when present, and the deterministic join key for InfoBase), `kind`, a self-referencing `parent_organization_id`, `active_from_year`/`active_to_year`, and a `needs_review` flag.
- **`organization_aliases`** holds `alias_name` with `valid_from` and `valid_to`. It is unique on (alias, valid_from), so one name can point to different organisations over time.
- **`organization_lineages`** links a predecessor to a successor with a `transition_year` and a `transition_kind` (rename, merge, split, absorb, spin_off, revived). It can cite the document that recorded the change. This is how machinery-of-government changes are modelled.
- **`fiscal_authorities`** stores the **Estimates** side (planned or voted spending). It has organisation, `fiscal_year` as a string such as "2025-26", `document_type` (main, supp_a, supp_b, supp_c), `vote_number` (string; "S" means statutory), `vote_type` (operating, capital, grants_contributions, statutory), `description`, `amount` numeric(15,2), and FKs to `raw_ingestion` and `lineage_entry`. It is unique on (org, year, document_type, vote_number).
- **`fiscal_expenditures`** stores the **Public Accounts** side. It has organisation, `fiscal_year`, `vote_number`, `vote_type`, `description`, `pa_voted_ceiling` (total authorities), `actual_expenditure`, and the same provenance FKs plus search-sync columns. It is unique on (org, year, vote_number).
- **`standard_object_expenditures`** has organisation, year, `standard_object` and `amount`. **It has no loader:** no code writes to it [V]. It is only indexed for search and counted in admin.
- **`spending_deviations`** is a **SQL view**. It sums authorities across all document types per (org, year, vote) into a "consolidated estimate", left-joins actuals on (org, year, vote_number), and computes the variance in dollars and percent. The model treats rows with variance above 20% as `anomalous` (`spending_deviation.rb`).
- **`spending_awards`** is the transaction level, covering contracts, grants, contributions and transfer payments. It has `source_id`, `external_key` (unique per source; a SHA-256 of the row when the source has no ID), `canonical_key` and `is_canonical` for amendment chains, `state` (published or withdrawn), payer/recipient/program names, `payer_organization_id` (exact name or alias match only), `fiscal_year` as an **integer**, `amount` numeric(20,2), `currency`, `is_aggregated`, province and country codes, the raw row in `metadata` jsonb, and `first_seen_at`/`last_seen_at`.

**How the model handles each concept:**

- **Departments** reconcile through `organizations` and `organization_aliases`. InfoBase is the anchor: its numeric org ID is deterministic, and it is the first loader to run. Estimates and spending names then resolve against the aliases InfoBase created.
- **Votes** have no table of their own. They are a (number, type) pair on each fiscal row, and the type is derived from the vote number using the federal convention of 1, 5 and 10 plus S for statutory. Any other number falls back to "operating" [V], which is lossy for departments with non-standard vote numbers [I].
- **Programs**: there is **no program table** in the fiscal core. Programs appear only as free text, in `description` on fiscal rows and in `program_name`/`program_key` on spending awards.
- **Years**: fiscal rows store years as "YYYY-YY" strings, while spending awards store a calendar-year integer. Their search documents normalise both to the first four digits.

---

## 3. Pipeline

**Shape [V].** Each step is an "associated object" hung off a model (`active_record-associated_object` gem). Methods marked as performable get auto-generated Active Job classes (`active_job-performs`).

1. **Register the source.** Seeds create one row per dataset: a stable `name`, the `url`, a `format`, and a `fetch_frequency` (manual, daily, weekly, monthly, quarterly or annual).
2. **Fetch** (`warehouse/source/fetcher.rb`).
   - A registry picks the download strategy from `format`. Specialised fetchers handle CKAN, IATI, StatCan vectors and HTML scrapers; everything else is a plain HTTP file, streamed for large CSVs.
   - For each download:
     1. Compute a SHA-256 checksum. If a non-failed ingestion with the same checksum already exists, skip the download because the data is unchanged.
     2. Archive the raw bytes to R2 at `raw/<source>/<date>/<filename>`, or to local disk when R2 is not configured.
     3. Create or reuse the `raw_ingestions` row: status pending, plus checksum, path and fetched_at.
     4. Hand the raw file to the loader.
   - Each fetch retries 3 times with exponential backoff. A concurrency limit allows one fetch per source at a time, with a 6-hour lock.
3. **Pick the loader** (`fetcher/registry.rb`). The loader is chosen by a pattern match on the source *name*: `infobase*` uses InfoBase, `estimates*` uses Estimates, `spending_*` uses the per-source scraper class, and similar rules cover geo, econ and lobbying.
4. **Normalise.**
   - **InfoBase loader**, deterministic: strip the BOM and scrub bad UTF-8, resolve the organisation by InfoBase ID (creating the org and alias on first sight), then upsert one expenditure per (org, year, vote). The whole file loads in one transaction. Status ends as complete, or failed with the error message.
   - **Estimates normaliser**:
     1. Detect fiscal-year columns from the headers ("YYYY-YY Main Estimates" becomes main; "Supplementary … A/B/C" becomes a supp).
     2. Resolve each organisation through the cascade below.
     3. Upsert one authority per (org, year, doc type, vote) for each amount column. Parenthesised amounts are read as negatives.
     4. Record any failed row as a "skipped" lineage entry. If any row was skipped, the status ends as `partial`.
   - **Spending scrapers** (`warehouse/spending/scrapers/base.rb`):
     1. Stream rows and map each to a common award shape.
     2. Upsert by `external_key` in batches of 500. Only "material" column changes clear the search-sync marker; otherwise only `last_seen_at` is bumped.
     3. Optionally withdraw published records not seen in this run. This is soft-delete via `state`.
     4. Re-rank amendment chains with a window function so that one row per `canonical_key` is canonical.
     5. Enqueue a resumable job (Active Job Continuation) that pushes un-synced awards to search.
5. **Entity resolution** (`warehouse/organization/entity_resolver.rb`; the steps are listed in `CLAUDE.md`). The resolver tries each step in order and stops at the first match:
   1. Exact alias match (confidence 1.0).
   2. Case-insensitive match (0.99).
   3. Curly-quote and encoding normalisation (0.95). A match here also learns the original spelling as a new alias.
   4. An LLM is shown the top 5 candidates ranked by in-Ruby trigram Jaccard similarity. The model is Claude Haiku 4.5 via `ruby_llm`, it must reply in JSON, it gets one retry, and there is a hard cap of 1000 calls per resolver instance.
   5. Confidence of 0.8 or higher auto-accepts and adds the alias. Between 0.1 and 0.8 the row still links to the match but adds no alias; the low confidence in the lineage entry is the only "flag". Below 0.1, or with no match, a new organisation is created with `needs_review` set.
6. **Validate.** There is no automated check of loaded fiscal data against published totals [V] (see §4).
7. **Expose.**
   - `GET /api/v1/organizations` and `GET /api/v1/organizations/:id` return an organisation with its aliases, authorities and expenditures. **There is no auth on these endpoints [V].**
   - `GET /api/v1/deviations?fiscal_year=&anomalous=true` serves the deviation view. **There is no auth [V].**
   - `POST /api/v1/spending/search` is a guarded pass-through to a turbopuffer query, pinned to the `government_spending` realm with public visibility and limits capped at 250. `GET /api/v1/spending/awards/:id` returns a single award.
   - Fiscal expenditures, standard-object rows, spending awards and KPI measures all sync to one turbopuffer namespace (`app/models/concerns/searchable.rb`). Embeddings come from Cohere embed-v4 on Azure (`app/services/search/provider_config.rb`). Each record carries an "ontology" block (org IDs and names, jurisdiction IDs, codes and levels) and a "realm_data" block (payer, program, year, amount, currency, dataset key), so search can filter across datasets.

**Schedules** (`config/recurring.yml`, Solid Queue recurring tasks) [V]:

- Spending sources are polled daily at 7:30. Each one is fetched only when its own interval has elapsed, with a 12-hour grace period.
- Economy sources are polled daily at 7:00, and election sources daily at midnight.
- **InfoBase and Estimates are `manual`.** They run only via `rake data:seed`, `data:seed_infobase` or `data:seed_estimates` (`lib/tasks/seed_real_data.rake`), or the admin "run scrape" button (`admin/dashboard_controller.rb`).
- `SourceHealthCheckJob` sends a HEAD request to every source URL and logs failures, but **it is not scheduled** [V]. `TODOS.md` calls it "nightly", which is aspirational.
- The rest of the schedule is CMS and analytics: HubSpot, Luma, Substack, Meta/Zernio social metrics, feed backfill, saved-search fan-out, and CPAC broadcast capture every 15 s.

---

## 4. Provenance and accuracy

**What exists [V]:**

- **Source to file:** `sources` holds the URL, format, licence and attribution. Each `raw_ingestions` row holds the R2 path, checksum, fetched_at, a status (pending, complete, partial or failed) and an error message. Every fiscal row and award points back to its ingestion.
- **Field-level lineage:** each `lineage_entries` row records the source field and value, the target field and value, the transformation type, the confidence, and the LLM model with prompt and response snapshots in jsonb. It also has `human_override`, `override_by` and `override_at` columns. A fiscal row links to the lineage entry that resolved its organisation.
- **Review UI:** `/admin/lineage_review` lists up to 50 entries below 0.8 confidence that have no override. **No route writes an override** [V], so review is read-only today.
- **Spending versioning:** award changes are tracked with `first_seen_at`/`last_seen_at`, withdrawal state, and the canonical flag per amendment chain. Old values are overwritten in place, so there is no history table.
- **Reconciliation:** only the `spending_deviations` view (estimates against actuals). Nothing ties loaded totals back to published totals, checks that votes sum to the department total, or compares Estimates with InfoBase authorities.
- **KPI platform** (`docs/kpis/architecture.md`, `platform_plan.md`, `agent_contract.md`). This is the most rigorous provenance design in the repo and is worth copying for Malaysia:
  - An external extraction agent posts **claims** (`extracted_observations`) together with raw labels, page and section citations, footnotes and assertions.
  - Each claim carries three organisation roles: reporting, responsible and observed.
  - Reviewers approve or reject through an audited queue (`review_decisions`, typed `observation_review_flags`). Only an approval creates a **fact** (`canonical_observations`).
  - Units and measures carry aggregation semantics: additive, ratio, rate and so on, enforced with check constraints.
  - Composite metrics are validated (sum-to-total and sum-to-100), and crosswalks of rates across geographies are refused.
  - Every agent run is logged (`agent_runs`).
  - **"Phase 7" alerts tables are documented but do not exist in `structure.sql` [V].**

**Defects worth avoiding (from reading the code, not from running it):**

- The Supplementary regex is case-insensitive and matches "Supp…" followed by any later letter "a". The "a" in the word "Estimates" satisfies that, so a "(B)" or "(C)" column would be filed as `supp_a` [I, high confidence].
- The Estimates header comment says "Estimates To Date" maps to main, but no branch matches that header, so the column is silently dropped [V].
- When the LLM step falls below 0.1, the resolver writes a lineage type that is not in the enum (`auto_created_for_review`). This would raise, so the row is skipped after the flagged organisation is created [I].
- The deviation view sums Main and Supps together, so including both a Mains row and a cumulative "to date" row would double-count [I].

---

## 5. CMS / website backend (brief)

- **Content models** (`app/models`):
  - **Memos** are policy memos. They have a `publication` scope (`build_canada` or `build_toronto`), authors and co-authors drawn from team members, endorsements, and moderated critiques. Memo changes trigger revalidation of the Next.js site.
  - **Posts, builders, team_members, tools, FAQs, testimonials, feed_entries**, the general site content types.
  - **Polls**, which have downloadable artefacts.
  - **Trade-barriers tracker** tables: agreements, themes and jurisdiction histories.
  - **Elections**, with races, candidates, surveys and pledges. These are hand-editable in admin for cities with no scrapable source.
  - The `Publishable` concern gates visibility on `published_at`, which gives draft, scheduled and published states.
- **Slugs** come from `friendly_id` built from the English title, with history.
- **i18n:** Mobility uses a column backend, so each field has paired English and French columns (for example `title_en`/`title_fr`).
  - The `Translatable` concern enqueues `TranslateRecordJob` after commit whenever an English field changes. `TranslationService` uses `ruby_llm` with Claude Haiku 4.5 and handles plain, markdown and hash fields.
  - Admins can force a fresh translation with a per-record "retranslate" action.
  - Markdown is stored, the admin uses the Marksmith editor, and inline images go to ActiveStorage.
- **Auth:**
  - Devise with JWT (and a denylist table) for API users.
  - Google OAuth for admin.
  - Personal `api_keys`, whose permissions are always read from the owning user.
  - Doorkeeper OAuth provider with PKCE, served on `auth.buildcanada.com`, which `buildcanada.app` uses.
  - Roles: member, trade_barriers_editor, admin, superadmin.
  - Separate `warehouse.api_tokens` for the KPI admin write API.
  - Content reads are public. Admin tokens unlock preview of drafts.
- **Integrations:**
  - HubSpot: contact mirror, webhook endpoint, and daily and weekly bulk sync.
  - Luma: event and guest sync.
  - Substack: subscriber push every 10 min, plus post analytics.
  - Customer.io, Meta/Instagram and Zernio for social metrics.
  - Webflow: an importer for legacy content.
  - turbopuffer for search, R2 for storage, and Anthropic via `ruby_llm` for translation and entity resolution.
  - AWS SES SMTP for Devise mail.

---

## 6. Infrastructure

- **Deploy** (`config/deploy.yml`): Kamal, with one OVH host running two roles. The `web` role runs Puma behind kamal-proxy with a custom TLS cert; the `worker` role runs `bin/jobs`.
  - Hosts: `yorkfactory.buildcanada.com` and `auth.buildcanada.com`.
  - Images are built for amd64 and pushed to a local registry.
  - A volume is mounted at `/rails/storage`.
- **Queues:** Solid Queue on a separate Postgres DB with no Redis (`config/queue.yml`): 1 dispatcher and 3 worker threads on `default`, with process count set by an env var. Solid Cache and Solid Cable also use their own DBs. Mission Control Jobs is mounted at `/admin/jobs` for superadmins.
- **Storage:** R2 has two buckets. One archives raw source files and the other holds ActiveStorage uploads (`config/storage.yml`). There is a local-disk fallback.
- **DB:** Postgres with PostGIS (adapter `postgis`) and a `tin` text-search extension for transcript search. The hosting provider is ambiguous (§0.5).

---

## 7. Canada-specific vs portable

| Concept | Canada-specific | Portable to Malaysia |
|---|---|---|
| Source registry, checksum dedupe, raw archive to object storage, ingestion status | — | Yes, as-is |
| Loader chosen by source name/format | — | Yes. Use an explicit `loader` column, not a regex on the name |
| Org + alias + lineage(predecessor/successor) model | Federal departments; InfoBase org ID as anchor | Yes. For Malaysia: ministries, agencies, statutory bodies, GLCs. Ministry reshuffles are frequent, so the lineage table matters |
| Deterministic anchor ID for orgs | `org_id_infobase` | Use the ministry/agency codes from the Federal Budget (Anggaran Perbelanjaan Persekutuan) or Treasury (MOF) codes, if a stable code exists |
| Vote model (1/5/10/S, Mains/Supps A-B-C) | Parliamentary vote structure and Supplementary Estimates cycle | Not portable. [I, from general knowledge, not verified here] Malaysia budgets by Supply Bill heads (B.xx operating / P.xx development) plus charged expenditure, with supplementary supply bills. Model "appropriation line" as its own table, not a string |
| Authorities vs actuals split + deviation view | Estimates vs Public Accounts | Yes. Budget estimates against Laporan Kewangan Kerajaan Persekutuan / Auditor-General actuals |
| Fiscal year as "YYYY-YY" string | April–March FY | Malaysia FY = calendar year. Keep `fiscal_year_start_month` on jurisdiction; store FY as int + period dates |
| Spending awards (contracts/grants, canonical amendment chain, withdraw-missing) | Proactive Disclosure feeds | Concept portable; Malaysian award data availability unverified (MyProcurement / ePerolehan are candidates) |
| LLM entity resolution cascade with lineage snapshots | — | Yes. Use pg_trgm instead of in-Ruby trigram over all orgs, and make review writable |
| KPI claim→fact platform, 3 org roles, units with aggregation semantics | — | Yes. The strongest design in the repo |
| Bilingual EN/FR column i18n + LLM translation | Official bilingualism | Yes, as EN/BM (and optionally ZH/TA). Column backend is simple; reconsider if >2 languages |
| Census geo, FSA postal crosswalks, ODA addresses | StatCan geography | Replace with DOSM/JUPEM boundaries, parliamentary/state constituencies (SPR) |
| Kamal + single VPS + Solid Queue + R2 | — | Yes |

---

## 8. Open questions

1. Who are the real consumers of the fiscal tables beyond the public API? Does any Build Canada app hold direct DB credentials? I found no evidence in this repo.
2. Which is the current DB host, PlanetScale Postgres or Supabase?
3. Are Supplementary Estimates and older Main Estimates loaded in production by an ad-hoc process? Neither seeds nor schedules cover them.
4. What was meant to populate `standard_object_expenditures` (presumably the InfoBase standard-object dataset)? Nothing loads it.
5. Is the low-confidence lineage review ever acted on? The override columns exist but no write path does.
6. Was the "Phase 7" alerts work dropped or never merged?
7. For Malaysia: which publication gives machine-readable budget lines? The Federal Budget estimates are PDF-first, so we probably need the KPI-style extraction-agent + human-approval path for the fiscal core itself, not a CSV loader [I].
