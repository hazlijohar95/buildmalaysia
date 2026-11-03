# Build Canada Outcome Tracker — reverse-engineered spec

Sources read: `reference/OutcomeTrackerAPI` (Rails 8, abbreviated `API/` below) and `reference/OutcomeTracker` (Next.js, `FE/`). Both are MIT-licensed. The API checkout has one commit (`aa098bb`), so history comes from `db/migrate/` only.
Convention: plain statements were checked in code. **(inferred)** marks a conclusion I did not verify directly. **(doc drift)** marks a place where docs and code disagree; in each case the code wins.

---

## 0. Summary

- The tracker follows about 600 federal commitments. They were extracted by an LLM from three documents: the 2025 Liberal platform, the 2025 Speech from the Throne, and Budget 2025. `API/docs/evaluation-system.md` gives the count as "603". `FE/app/faq/page.tsx` gives the same three sources.
- **Current model: `Commitment`.** **Legacy model: `Promise`.** `Promise`, `Evidence` and `Activity` come from an earlier Firebase-era system. They are still in the schema, but no cron job, agent or frontend page uses them (§2.3).
- **Assessment is done by an autonomous Claude Code agent with no human review step.** The agent runs headless (`claude -p`), reads and writes the Rails API with `curl`, searches and fetches `*.canada.ca`/`*.gc.ca`/`parl.ca`, sets each criterion's status, and sets the commitment status. Humans can only correct records by hand in the Avo admin; there is no review queue (§4.6).
- Gemini (via `ruby_llm`) handles the structured, single-shot steps: extraction, dedup, reconciliation, criteria generation, target-date extraction and relevance filtering. Claude handles the agentic evaluation (§5).

---

## 1. Purpose and user-facing features

The site is a public, read-only dashboard at `buildcanada.com/tracker` (`FE/next.config.mjs`: `basePath: "/tracker"`). It shows whether the Carney government (45th Parliament) is delivering what it promised. Nav: Overview, Explore, FAQ (`FE/components/TrackerNav.tsx`).

| Page (FE/app/…) | Shows | API calls |
|---|---|---|
| `page.tsx` + `components/HomePageClient.tsx` (Overview) | Status counts, burn-up chart, grid by policy area/ministry, economic metric charts | `GET /api/dashboard/1/at_a_glance`, `GET /api/burndown/1`, `GET /departments.json`, `GET /commitments.json?per_page=1000` |
| `commitments/page.tsx` (Explore) | Search and filter list | `GET /commitments.json?q=&status=&policy_area=&commitment_type=&department=&source_type=&sort=…` |
| `commitments/[id]/page.tsx` | Header (status, type, departments), **Criteria Assessment** (progress and completion criteria only; success and failure criteria are fetched but not rendered), "Talk vs. Changed" (announcements vs concrete actions), Timeline, Commitment Drift (revisions), Status History, sources | `GET /commitments/:id.json` |
| `platform/page.tsx` | Same views, restricted to platform commitments | the above with `source_type=platform_document` |
| `ministries/[slug]/page.tsx`, `policy-areas/[slug]/page.tsx` | Per-department and per-area burn-up and list | `/api/burndown/1?department_slug=` or `?policy_area_slug=`, `/commitments.json?lead_department=` or `?policy_area=` |
| `feed/page.tsx` | Global activity feed, with an RSS link | `GET /feed.json`, `/feed.rss` |
| `faq/page.tsx` | Public statement of the methodology (§4) | none |
| `password/page.tsx` + `app/api/auth/route.ts` | Password gate (a hardcoded password; sets a cookie valid until 06:00 Mountain Time). `middleware.ts` is now a no-op, so the gate is disabled **(inferred: it was a pre-launch gate)** | `POST /tracker/api/auth` |
| `components/charts/*` | StatCan-backed economic charts | `GET /statcan_datasets/:name` (e.g. `gdp-quarterly`); also static JSON in `FE/metrics/` |

Server-rendered pages use `FE/lib/api.ts` (`fetchApi`, 300 s revalidate). Client pages use SWR against the `/tracker/api/v1/*` rewrites. Public API routes are listed in `API/config/routes.rb`, with JSON views in `API/app/views/commitments/*.jbuilder` and `API/app/controllers/api/{burndown,dashboard}_controller.rb`.

The API also serves a read-only **MCP endpoint**: `POST /mcp`, with 10 tools in `API/app/models/mcp_tools/` (`list_commitments`, `get_commitment`, `get_commitment_progress`, `list_bills`, `list_activity`, …). The frontend proxies `/mcp` to it.

## 2. Domain model (`API/db/schema.rb`, `API/app/models/`)

### 2.1 Core, current

| Entity | Meaning | Key fields / relations |
|---|---|---|
| `Government` | Tenant. id=1 is "Government of Canada", slug `federal` (`db/seeds/canada.rb`) | `mandate_start/end`; has_many commitments, departments, ministers, sources, source_documents |
| `Department` | A ministry/portfolio (33 are seeded, with display names such as "Housing & Infrastructure") | `slug`, `official_name`, `display_name`, `priority` (1 or 2, used for display order); `officials` (Minister); `commitments` via `commitment_departments(is_lead)` |
| `Minister` | An office holder, synced daily from ourcommons.ca (`services/ministers_fetcher.rb`) | `department_id`, `role` (Minister / Prime Minister / Secretary of State), `started_at/ended_at`, contact data, `person_id` |
| `PolicyArea` | Topic taxonomy (15 seeded, `db/seeds/policy_areas.rb`) | `slug`, `position`; one per commitment |
| **`Commitment`** | One atomic, verifiable promise | `title`, `description` (adds analysis), `original_text` (verbatim), `commitment_type` enum, `status` enum, `date_promised`, `target_date`, `last_assessed_at`, `criteria_generated_at`, `policy_area_id`, `party_code`, `region_code`, `metadata` jsonb. `parent_id` exists but parents were deleted (`migrate/20260317000001_remove_parent_commitments.rb`) |
| `SourceDocument` | An uploaded PDF (ActiveStorage) to extract commitments from | `source_type`, `status` (pending/processing/extracted/failed). Creating one auto-enqueues `SourceDocumentProcessorJob` |
| `Source` | Any citable document: the originating policy documents **and** every web page the agent cites as evidence | `source_type` enum (12 values: platform_document, speech_from_throne, budget, mandate_letter, gazette_notice, order_in_council, treasury_board_submission, committee_report, departmental_results_report, debate, press_conference, other + `source_type_other`), `url`, `title`, `date`, optional `source_document_id`. **It stores no page content**, only URL, title and date |
| `CommitmentSource` | Join: where a commitment was promised | `section`, `reference` (page), `excerpt` (≤500 chars), `relevance_note` |
| `Criterion` | One test of a commitment | `category` (completion / success / progress / failure), `description`, `verification_method`, `status` (not_assessed / met / not_met / no_longer_applicable), `evidence_notes`, `assessed_at`, `position` |
| `CriterionAssessment` | Audit row for each criterion status write | `previous_status`, `new_status`, `source_id`, `evidence_notes`, `assessed_at` |
| `CommitmentStatusChange` | Audit row for each commitment status change (written by an `after_update` callback in `commitment.rb`) | `previous/new_status`, `changed_at` (the *effective* real-world date), `reason` (shown in the UI), `source_id`. Drives the burndown chart |
| `CommitmentEvent` | A timeline entry with a "why it matters" blurb | `event_type` (promised, mentioned, legislative_action, funding_allocated, status_change, criterion_assessed), `action_type` (**announcement vs concrete_action**, which drives "Talk vs. Changed"), `occurred_at`, `source_id` |
| `CommitmentRevision` | "Drift": the previous wording, saved when a later document restates the commitment | old title/description/original_text/target_date, `change_summary` (from an LLM), `source_id` |
| `CommitmentMatch` | Polymorphic link from evidence to a commitment | `matchable` = `Entry` \| `Bill` \| `StatcanDataset`; `relevance_score` 0–1, `relevance_reasoning`, `assessed` |
| `FeedItem` | Denormalised activity feed | Created by callbacks on StatusChange, CriterionAssessment, Event and Revision |
| `EvaluationRun` | Summary the agent submits for each evaluation | `trigger_type`, `previous/new_status`, `reasoning`, `criteria_assessed`, `evidence_found`, `search_queries` |
| `AgentRun` / `AgentRunEvent` | Full trace of each Claude CLI invocation (prompt, system prompt, every stream-json event, token label/fingerprint); deleted after 60 days (`docs/agent-traces.md`) | |

### 2.2 Evidence inputs

| Entity | Meaning |
|---|---|
| `Feed` | An RSS/Atom URL, refreshed every 3 h |
| `Entry` | One feed item, fetched and converted to markdown (`parsed_markdown`) through a Defuddle service. Index entries (`is_index`, e.g. Gazette tables of contents) spawn child entries via `parent_id` and are not themselves evaluated. `agent_processed_at`, `skipped_at`/`skip_reason` |
| `Bill` | A LEGISinfo bill, with columns for each House/Senate reading date and `received_royal_assent_at`; raw JSON kept in `data`. Only "House/Senate Government Bill" types are matched |
| `StatcanDataset` | A StatCan table snapshot (`current_data` jsonb) with its own cron `sync_schedule` |

### 2.3 Legacy: Promise, Evidence, Activity

`Promise` (about 60 columns: `progress_score`, `bc_promise_rank`, `linked_evidence_ids`, `what_it_means_for_canadians`, …), `DepartmentPromise`, `Activity` (LLM-extracted from an Entry), and `Evidence` (Activity↔Promise, with `impact`, `impact_magnitude`, and the only human-review fields in the system: `review`, `reviewed_by_id`, `reviewed_at`).
Evidence that they are legacy:
- `README.md` describes this model and says promises "are currently static".
- `db/seeds/canada_promises_2024.jsonl` holds Firestore-style records (`migration_version`, `linked_evidence_ids` like `20250605_45_LegisInfo_…`, model `gemini-2.5-flash-preview-05-20`).
- `PromiseProgressUpdater` and `ActivityExtractor` are reachable only through manual `update_progress!` / `extract_activities!` calls. No cron job calls them, and `Entry#fetch_data!` now enqueues the agent instead.
- The frontend never calls `/promises` or `/evidences`.
- The FE prompts in `FE/prompts/` (§5.3) belong to this generation.

**Do not port it.**

Other non-core tables: `canadian_builders` (marketing content), `government_phone_lines*` (call-centre wait-time scraping), `chats/messages/tool_calls` (the `ruby_llm` persistence that every Gemini call is logged through).

## 3. Where commitments come from

**Documents** (`API/lib/tasks/reextract_commitments.rake`):
1. Liberal platform "Canada Strong", 2025-04-28 (`platform_document`)
2. Speech from the Throne, 2025-05-27 (`speech_from_throne`)
3. Budget 2025, 2025-11-05 (`budget`)

Mandate letters exist as a `source_type`, but no mandate-letter document is configured. `FE/raw-data/` holds older inputs (2021 mandate letter CSVs, the 2025 platform PDF and CSV, SFT text). `FE/prompts/economic_contexts/{2021_mandate,2025_platform}.txt` show that the legacy system also tracked 2021 mandate letters.

**Extraction pipeline** (`jobs/source_document_processor_job.rb`). Upload a PDF as a `SourceDocument` in Avo, or run `rake commitments:reextract`, which wipes all commitments and re-extracts them.

**Phase 1** extracts and dedups each document; documents run in parallel.
1. `pdf-reader` splits the PDF into pages tagged `[PAGE n]`.
2. Pages are chunked deterministically: 10 pages per chunk with a 1-page overlap. `DocumentChunker` (an LLM chunker) exists but is unused.
3. `CommitmentExtractor` (Gemini 3.1 Pro, structured output) runs on each chunk. The prompt passes the policy-area slugs, department slugs, and **all existing commitment titles and IDs**. Rules: one verifiable thing per commitment; an action-oriented title; a description that adds analytical value; verbatim `original_text`; no umbrella commitments; set `existing_commitment_id` if the commitment is a duplicate. Its type classification rules are summarised in §4.1. Extractions are cached per chunk, so a re-run resumes.
4. `CommitmentDeduplicator` (LLM) runs on each pair of adjacent chunks to remove duplicates caused by the overlap.

**Phase 2** creates and reconciles commitments; documents run one after another in date order.

5. For each extracted item:
   - If `existing_commitment_id` is set, add a `CommitmentSource` to the existing commitment and run drift detection. If title, description or original_text changed, `CommitmentDriftSummarizer` (Flash-Lite) writes a 1–3 sentence `change_summary`, and a `CommitmentRevision` plus a FeedItem are recorded.
   - Otherwise, create a `Commitment` with `status: not_started`, `date_promised = source.date`, a `CommitmentSource`, and department links (`is_lead`).
6. `CommitmentReconciler` (Gemini Pro) compares the new commitments against all active existing ones and returns two lists:
   - `update_existing`: the existing commitment absorbs the new one, with a drift revision.
   - `abandoned` (with a confidence score): **if confidence ≥ 0.6, the code sets the commitment to `broken` automatically** with the LLM's reason. The prompt says "omission alone is NOT evidence"; nothing checks this.

**Post-processing crons** (`config/initializers/good_job.rb`):
- `CriteriaGenerationCronJob` runs daily at 04:00 for commitments with no criteria (§4.2).
- `TargetDateExtractionCronJob` runs daily at 04:30 for commitments with `target_date IS NULL`. It uses `TargetDateExtractor` (Flash-Lite): explicit dates only; relative phrases resolve against `date_promised` ("by 2029" becomes 2029-12-31); otherwise null. **(inferred)** Commitments with no deadline are re-sent to the LLM every night, because null never changes.
- `CommitmentDedupJob` + `CommitmentDedupFinder` (Flash-Lite) runs manually (`rake dedup:*`), grouped by lead department. It merges sources, criteria, matches and events into the kept commitment.

(doc drift) `docs/commitment-generation.md` and `docs/commitments/liberal-platform-2025/README.md` describe an earlier hand-curated extraction: 290 platform commitments, made with pdfplumber, seeded from `commitments_liberal_2025.jsonl`. That file is not in the repo; the LLM pipeline replaced it.

## 4. How progress is assessed (core methodology)

### 4.1 Commitment types

`commitment.rb` enum: `legislative, spending, procedural, institutional, diplomatic, aspirational, outcome`. The type drives the guidance used when generating criteria. Classification rules from the extractor prompt:

| Type | Classified as this when the commitment involves |
|---|---|
| spending | Dollar amounts, funding, tax cuts, investment programs |
| legislative | Bills, amendments, Criminal Code changes, new Acts |
| procedural | Process changes, reviews, strategy launches, agency mandates |
| institutional | New agencies, offices, boards |
| outcome | Measurable targets with specific numbers |
| diplomatic | International agreements, treaties, alliances |
| aspirational | Broad goals with no metrics |

### 4.2 Criteria generation (`models/criteria_generator.rb`, Gemini 3.1 Pro)

Each commitment gets 6–12 criteria in four categories:

| Category | Question | Count |
|---|---|---|
| completion | "Did they literally do it?" (the letter) | 2–4 |
| success | "Did the real-world outcome materialise?" (the spirit) | 2–3 |
| progress | "Are they actively working toward it?" | 1–2 |
| failure | "Is it broken or contradicted?" Must be a falsifiable red flag, not "hasn't happened yet" | 1–2 |

- **`verification_method` must name a concrete source**, such as "LEGISinfo C-XX", "StatCan Table 36-10-0222-01", "Main Estimates Part II" or "Canada Gazette Part II". "Monitor announcements" is explicitly rejected.
- Per-type guidance maps each category to its instruments. For example, legislative: completion = Royal Assent or Gazette II; progress = bill readings; failure = withdrawn or a contradicting bill.
- A re-run deletes only `not_assessed` criteria, so assessed criteria are kept.

The completion/success split is the core design idea: a government can pass a law (letter met) without the outcome happening (spirit not met).

### 4.3 Statuses (current code, `commitment.rb`, `criterion.rb`, `agent/CLAUDE.md`)

**Commitment `status`** (integer enum; value 3 retired). Definitions are from the agent's system prompt, `services/agent_prompts.rb`:

| Status | Definition given to the agent |
|---|---|
| `not_started` (0) | No evidence of meaningful action, or **only announcements with no concrete follow-through** |
| `in_progress` (1) | Concrete steps under way (legislation introduced, funding allocated, program design started) |
| `completed` (2) | Fulfilled (legislation enacted, program operational, objectives substantially achieved) |
| `broken` (4) | The government took a position counter to the commitment, **or a specific deadline passed without completion** (the FAQ: "even if the government is still working on it") |

**Criterion `status`**: `not_assessed` (0), `met` (1), `not_met` (3), `no_longer_applicable` (4).

History, from the migrations: statuses started as not_started / in_progress / partially_implemented / implemented / abandoned / superseded, and criteria had a `partially_met` status. In 2026-03 these were collapsed:
- `superseded` became `abandoned`, which is now `broken`;
- `partially_implemented` and `implemented` became `completed`;
- `partially_met` was removed.

See `migrate/20260310000002`, `…0310000005` and `…0318000001`. (doc drift) `docs/commitments.md` and `docs/frontend-api.md` still list the old six statuses.

### 4.4 Evidence hierarchy (the rubric; enforced only through the prompt)

From `AgentPrompts::SYSTEM_PROMPT`:

- **`completed` requires one of:**
  - a bill with Royal Assent that implements the commitment;
  - a Canada Gazette Part II/III entry (enacted regulation);
  - departmental evidence that a program is operational.
- **`in_progress` requires one of:**
  - a bill introduced and progressing (no Royal Assent yet);
  - a Gazette Part I entry (proposed regulation);
  - an appropriation voted, together with evidence of program implementation;
  - a budget allocation for a **pre-existing** commitment.
- **Budget Evidence Rule:** the Budget cannot count as progress on a commitment that *originated in the Budget* (that would be circular: announcing is not implementing). It can count for platform or SFT commitments that pre-date it. The agent checks this through `GET /api/agent/commitments/:id/sources`.
- **Criteria are "a structured guide, NOT a rigid checklist."** A commitment can be `completed` through a different mechanism than its criteria anticipated. Criteria with insufficient evidence stay `not_assessed`.
- **Date discipline:**
  - use only evidence that existed on the evaluation date (`as_of_date` exists for backfills);
  - give more weight to recent evidence;
  - cite publication dates;
  - if `target_date` has passed without completion, evaluate for `broken`;
  - a status change's `effective_date` is the date of the earliest justifying evidence, not today's date.

**Important: there is no deterministic roll-up.** The planned rule-based derivation (`docs/commitment_evaluation_plan.md` §5: any failure criterion met means abandoned; all completion and success criteria met means implemented; and so on), together with the per-criterion `CriterionAssessor`, was built and then retired. `models/chat.rb` says: "Rows from retired pipelines (CriterionAssessor, CommitmentStatusDeriver) remain as an audit log". (doc drift) `docs/evaluation-system.md` still cites `commitment_status_deriver.rb`, which does not exist. **Today the commitment status is a holistic LLM judgement, informed by the criteria but not computed from them.**

### 4.5 What counts as evidence, and how it is tied to sources

The **agent loop**, run once per commitment (`EVALUATE_COMMITMENT_PROMPT`):
1. Load the commitment: `GET /api/agent/commitments/:id`. This returns criteria, matches, the last 50 events, sources, departments and the last 10 status changes.
2. Search with `WebSearch` (`site:canada.ca OR site:gc.ca`), then fetch pages with `WebFetch`, which is restricted to `*.canada.ca`, `*.gc.ca` and `www.parl.ca` (`jobs/concerns/runs_claude_agent.rb` `ALLOWED_TOOLS`; also `agent/.claude/settings.json`).
3. **Register every page before citing it:** `POST /api/agent/pages/fetch` (`controllers/api/agent/pages_controller.rb`). The server:
   - re-fetches the URL itself;
   - checks that the host suffix is `.canada.ca`, `.gc.ca` or `.parl.ca`, both before and after redirects;
   - converts the page to markdown and truncates it at 15k characters;
   - reads `dcterms.modified`/`issued` as the date;
   - does `Source.find_or_create_by!(url:)`, inferring `source_type` from the URL (gazette → gazette_notice, budget/finance → budget, …).
4. Write judgements. Each write **requires the URL of a registered `Source`**, otherwise the server returns 422:

| Write | Endpoint | Required | Side effects |
|---|---|---|---|
| Assess criterion | `PATCH /api/agent/criteria/:id` | `new_status`, `evidence_notes`, `source_url` | Updates the Criterion and appends a `CriterionAssessment(source)`, which creates a FeedItem |
| Timeline event | `POST /api/agent/commitment_events` | `event_type`, `title`, `occurred_at`, `source_url`; optional `action_type` (announcement / concrete_action) | Creates a `CommitmentEvent(source)` and a FeedItem |
| Commitment status | `PATCH /api/agent/commitments/:id/status` | `new_status`, `reasoning` (1–3 sentences, **shown in the UI**), `source_urls[]`, `effective_date` | Creates a `CommitmentStatusChange` with the first matching source and `changed_at = effective_date`, plus a FeedItem |
| Link a bill or entry | `POST /api/agent/commitment_matches` | `matchable_type/id`, `relevance_score`, `relevance_reasoning` | `assessed: true` |
| Audit | `POST /api/agent/evaluation_runs` | `trigger_type`, `reasoning` | Sets `last_assessed_at`. A Stop hook (`agent/.claude/hooks/on_stop_commitment.sh`) sets it as a fallback if the agent forgets |

Gaps in these checks:
- The status endpoint rejects a request only if **none** of the `source_urls` are registered. Unregistered URLs alongside a registered one pass.
- The source check proves only that the page was fetched from a government domain. It does not prove the page supports the claim.
- Page content is **not persisted**, so a later reviewer can see the URL but not what the page said at the time.

**Triggers for the agent:**
- **New feed entry:** after the page is fetched, `Entry#fetch_data!` enqueues `AgentProcessEntryJob` (`PROCESS_ENTRY_PROMPT`: decide which commitments the entry is relevant to, then match, add an event, assess criteria and update status for each). Entries published before 2025-04-28 are skipped.
- **Bill stage change:** `Bill.sync_all` runs every 3 h and diffs the 7 stage timestamps for government bills. On a change it enqueues `AgentEvaluateCommitmentJob(trigger: bill_stage_change)` for each commitment *already matched* to that bill. New bills are left to the weekly scan.
- **Weekly scan:** Sundays at 02:00, `AgentWeeklyScanJob` enqueues an evaluation of **every non-broken commitment**. `broken` is therefore effectively terminal; the scan never re-evaluates it. **(inferred)**
- **Manual:** `agent/run_batch.sh`. It references a Python `agent/src` module that is not in the repo (stale).
- An evaluation is skipped if the commitment was already assessed today, unless `force: true`.
- Retries: 3 attempts, 30 s apart. A full agent session takes about 2 min (comment in the job).
- `PROCESS_BILL_CHANGE_PROMPT` and `WEEKLY_SCAN_PROMPT` are defined but unused; both triggers use `EVALUATE_COMMITMENT_PROMPT`.

**Gemini relevance filter (now only a backfill tool).** `CommitmentRelevanceFilterJob` (Flash-Lite) sends the item with batches of 20 commitments. It scores relevance from 0 to 1: 0.8–1.0 means directly about the commitment, 0.5–0.7 means indirectly relevant, and anything below 0.5 is dropped. It also refuses "vague thematic similarity", and only considers commitments promised on or before the evidence date. The live pipeline still calls it only from `StatcanDataset#sync!`; for entries and bills it runs only from `rake commitment_backfill:*` and `rake matching_gaps`.

### 4.6 Human review vs automation

| Step | Automated | Human |
|---|---|---|
| Extracting commitments from PDFs | Gemini | A person uploads the PDF; output can be edited in Avo |
| Marking a commitment `broken` because it was superseded | Gemini reconciler, applied automatically at confidence ≥ 0.6 | none |
| Criteria | Gemini | Editable in Avo |
| Criterion and commitment status, events, bill links | Claude agent, written directly to production tables | Editable in Avo after the fact (a status edit made in Avo also creates a StatusChange through the callback) |
| Review queue / approval / second-model check | **none exists** | The only `reviewed_by` fields are on legacy `Evidence` |

Auditability comes from append-only logs, not from gating:
- `CriterionAssessment` and `CommitmentStatusChange`, each with a source;
- `EvaluationRun`, the agent's own summary;
- `AgentRun`/`AgentRunEvent`, the full transcript (kept 60 days, with secrets redacted);
- `chats/messages`, every Gemini call.

The FAQ says statuses are "based on the evidence attached to that commitment" and that "we use AI to match … and evaluate it against the above rubric".

### 4.7 Other evaluation layers (in docs only)

`docs/evaluation-system.md` describes two more layers:
- **L3: commitment quality grade.** Six dimensions scored A–F. It cites `build_evals.py` and `evals.sqlite3`, neither of which is in either repo.
- **L4: Build Canada relevance rank.** Relevance (1–5) × Scale (1–5, C$ GDP bands) + Direction gives a strong/medium/weak rank. Source: `FE/prompts/detailed_rating_instructions.md` + `build_canada_tenets.txt`. This is an advocacy-group lens that survives only on the legacy `Promise.bc_promise_rank*` columns. Nothing in the current Commitment model or UI uses it.

## 5. LLM usage

### 5.1 Providers and models

- **Gemini, via `ruby_llm`** (a fork, `xrendan/ruby_llm@structured-output`) and `structify`. Every call is a JSON-schema structured output persisted as a `Chat` subclass (`models/chat.rb#extract!`). The default model is `gemini-3.1-flash-lite-preview` (`config/initializers/ruby_llm.rb`). The key is `GEMINI_API_KEY`.
- **Claude Code CLI**, run as a subprocess: `claude -p … --system-prompt … --allowedTools … --permission-mode bypassPermissions --model $AGENT_MODEL --output-format stream-json`.
  - Model: `AGENT_MODEL`, default `claude-sonnet-5` (`runs_claude_agent.rb`); `run_batch.sh` defaults to `claude-sonnet-4-6`.
  - Auth: a pool of Claude **OAuth subscription tokens** (`CLAUDE_CODE_OAUTH_TOKENS`, a random pick per run; `services/claude_oauth_pool.rb`, `docs/claude-oauth-pool.md`), not an API key. **(inferred)** The team should check whether this auth method is allowed for production use under the provider's terms.
  - The Dockerfile installs Claude Code inside the Rails image.

### 5.2 LLM steps

| Step | Class | Model | Intent |
|---|---|---|---|
| Extract | `CommitmentExtractor` | 3.1 Pro | Turn a PDF chunk into atomic typed commitments, with dedup against existing ones |
| In-doc dedup | `CommitmentDeduplicator` | Flash-Lite | Remove duplicates in adjacent overlapping chunks |
| Reconcile | `CommitmentReconciler` | 3.1 Pro | Classify new vs existing as restated (drift) or abandoned |
| Drift summary | `CommitmentDriftSummarizer` | Flash-Lite | 1–3 sentences on what changed |
| Global dedup | `CommitmentDedupFinder` | Flash-Lite | Find duplicate groups per lead department |
| Criteria | `CriteriaGenerator` | 3.1 Pro | 4-category criteria with named verification sources |
| Target date | `TargetDateExtractor` | Flash-Lite | Explicit deadlines only |
| Relevance | `CommitmentRelevanceFilter` | Flash-Lite | Score item↔commitment relevance |
| **Evaluate** | Claude agent (`AgentPrompts`) | Sonnet | Search, register sources, assess criteria, write events, set status, record audit |
| Legacy | `ActivityExtractor`, `PromiseProgressUpdater` | Flash-Lite | Old activity extraction and 1–5 progress scoring |

### 5.3 Hallucination safeguards

**Implemented:**
1. **Structured output** everywhere on the Gemini side, with enums for type and category, and IDs and slugs chosen from lists given in the prompt.
2. **Source-registration gate**: every agent judgement must cite a URL that the *server* fetched from a government domain (§4.5).
3. **Domain allowlist**, enforced in three places: the CLI `--allowedTools`, the agent's `settings.json`, and the server-side host check.
4. **Prompt rules**: an explicit evidence hierarchy; the circular-budget rule; "announcements alone are not progress"; only explicit dates; "omission is not abandonment"; "be conservative" for dedup and reconciliation; verification methods must be named sources.
5. **Date guards**: entries before the mandate start are skipped; relevance matching uses only commitments promised on or before the evidence date; the agent receives `current_date`.
6. **Full traceability**: append-only assessment and status logs, EvaluationRun, and the AgentRun transcript.
7. **Agent sandboxing**: the subprocess env strips `RAILS_MASTER_KEY` and `SECRET_KEY_BASE`. The agent may use only the API key and curl, with no file tools ("Do NOT use Read, Glob, Grep" in `agent/CLAUDE.md`, enforced by the allowedTools list). A preflight check of `/up` runs before each session.

**Missing:**
- No check that a cited page actually supports the claim.
- No human gate.
- No cross-model check.
- No confidence score on agent judgements.
- Page content is not snapshotted.
- The reconciler can mark a commitment `broken` automatically.

### 5.4 Prompt locations

- Agent: `API/app/services/agent_prompts.rb` and `API/agent/CLAUDE.md`.
- Gemini: inline in each `API/app/models/*.rb` class.
- `FE/prompts/*.md` are **legacy Firebase-era prompts**, not referenced by any code. They cover evidence extraction for bills, Gazette II, OICs and news; evidence↔promise linking and validation; 1–5 progress scoring; "what it means for Canadians"; and the BC rating.

## 6. Feeds and scraping

| Source | Mechanism | Frequency |
|---|---|---|
| Canada Gazette Part I, Part II, and Acts (`gazette.gc.ca/rss/{p1,p2,en-ls}-eng.xml`) | RSS → Entry; index pages split into child entries | Every 3 h (`FeedRefresherJob`) |
| Canada News Centre (`api.io.canada.ca/io-server/gc/news/en/v2?...&format=atom`): backgrounders, speeches, statements, plus news releases from Finance and 13 departments (DND, IRCC, ISC, ISED, GAC, Health, ECCC, ESDC, Transport, NRCan, TBS, CIRNAC) | Atom → Entry | Every 3 h |
| PM press releases (`pm.gc.ca/en/rss.xml`), PBO reports (`pbo-dpb.ca/en/feed.xml`) | RSS → Entry | Every 3 h |
| LEGISinfo (`parl.ca/legisinfo/en/bills/json`) | Full JSON upsert, plus stage-change diff → agent | Every 3 h (`BillsCronJob`) |
| StatCan tables (8 seeded: GDP, housing starts, population, NPRs, productivity, energy, balance sheets…) | `StatcanFetcher` → `current_data`, then the relevance filter | `StatcanCronJob` hourly checks each dataset's own cron (mostly daily) |
| ourcommons.ca ministries XML and person pages | Minister sync (roles, contacts, photos) | Daily 05:00 |
| Ad-hoc canada.ca / gc.ca / parl.ca pages | Agent `WebSearch`/`WebFetch` + `pages/fetch` | Per evaluation, and weekly for every commitment |
| FE static metrics (`FE/metrics/*`: StatCan, CIHI, CFIB, World Bank) via `FE/scrape.py` | The README says GitHub Actions update them; no workflow is in this checkout | Unknown |

Feed seeds: `API/db/seeds/canada.rb`, `API/lib/tasks/feeds.rake`. Candidate sources not yet added are listed in `plans/06-new-data-sources.md`. Feed health is visible at `/admin/scraping_health`. Page-to-markdown conversion uses an external Defuddle service (`DEFUDDLE_API_URL`).

## 7. Stack and deployment

**Backend:**
- Rails 8 API with Postgres.
- GoodJob for jobs and cron; the worker runs as a separate container.
- Avo admin at `/admin` (Devise auth; the GoodJob dashboard is admin-only).
- jbuilder, ransack, feedjira, pdf-reader, the `mcp` gem, AppSignal.
- Deployment: `docker-compose.prod.yml` runs `web` and `worker` containers from one Dockerfile, and the worker reaches the API at `http://web:3000`. **(inferred)** The host is not specified.
- `.github/workflows/database-dump.yml` takes a weekly production DB dump to Actions artifacts, minus users (README).

**Frontend:**
- Next.js 15.4 (App Router), React 18, Tailwind 3 with shadcn/Radix and DaisyUI, Chart.js, SWR, PostHog (proxied via `/ph/*` rewrites).
- `typescript.ignoreBuildErrors: true`.
- It proxies `/api/v1/*`, `/api/burndown`, `/api/dashboard` and `/mcp` to the Rails API.
- No deployment config is in the repo. **(inferred)** It is a Vercel-style deploy mounted at `buildcanada.com/tracker`.

**Why `firebase` is a dependency.** It is vestigial. The only imports are `Timestamp` from `firebase/firestore`, in `components/PromiseProgressTimeline.tsx` and `components/TimelineNode.tsx`; those two components import each other, and no page imports either one (checked with grep). `.gitignore` lists `promisetrackerapp-firebase-adminsdk-*.json` and `firestore-debug.log`. With the Firestore-shaped promise seed, this shows the original tracker ran on Firebase/Firestore before moving to Rails. **(inferred)** The dependency can be dropped.

## 8. Canada-specific vs portable

| Element | Canada-specific | Portable |
|---|---|---|
| Domain model (Government, Department, Minister, PolicyArea, Commitment, Criterion, Source, Event, StatusChange, Revision, FeedItem, Match) | — | ✔ as is. `Government` is already multi-tenant |
| Commitment types, 4-category criteria, 4 statuses | — | ✔ |
| Evidence hierarchy | Royal Assent, Gazette I/II/III, Main/Supplementary Estimates, LEGISinfo stages (House/Senate 1R–3R) | The structure carries over. Map to Dewan Rakyat/Dewan Negara readings, Royal Assent and gazettement, Warta Kerajaan (P.U.(A)/(B)), Belanjawan, and Anggaran Perbelanjaan |
| Budget Evidence Rule, announcement-vs-action distinction, deadline⇒broken rule | — | ✔ (central to a credible Malaysian version) |
| Source types | `speech_from_throne`, `order_in_council`, `treasury_board_submission`, `departmental_results_report` | Rename to equivalents: Titah Diraja, Cabinet decisions, RMK/Mid-Term Review, Laporan Ketua Audit Negara |
| Bill model | LEGISinfo JSON schema and stage columns | Needs a parlimen.gov.my scraper; there is no equivalent JSON API **(inferred)** |
| Feeds | gazette.gc.ca, api.io.canada.ca, pm.gc.ca, PBO | Feed/Entry/index-entry mechanism ✔; URLs ✗ |
| Domain allowlists | `.canada.ca/.gc.ca/.parl.ca`, hardcoded in 3 places | Change to `.gov.my`, `parlimen.gov.my`, `lom.agc.gov.my`, etc. |
| StatCan integration | Table IDs and the fetcher | Pattern ✔; source becomes DOSM OpenDOSM / data.gov.my |
| Minister sync | ourcommons.ca XML | Needs a new source |
| Prompts | "Canadian federal", English-only, names Canadian sources | Rewrite. Must handle **Bahasa Malaysia** source text |
| Mandate-start skip date, `party_code: "LPC"`, `region_code: "federal"` hardcoded in the extractor job | ✔ | Parameterise |
| BC relevance/tenets rank | Build Canada advocacy lens | Optional; not part of the core |

## 9. Open questions

1. **Accuracy:** no eval set or measured error rate exists for the agent's status calls. `docs/evaluation-system.md` cites `build_evals.py`, which is absent. How did Build Canada validate about 600 autonomous judgements before publishing?
2. **Human review:** was any status QA'd by people before the public launch, or after (e.g., in Avo)? The code has no review state. For Malaysia, decide whether `broken` and `completed` need human sign-off.
3. **Reconciler auto-break:** how many commitments were set `broken` by the ≥0.6 rule rather than by the agent? `CommitmentStatusChange.source` is the document source in that case; check the production dump.
4. **`broken` is terminal** in the weekly scan and the relevance filter. Is that intended when a broken deadline is later met?
5. **Success criteria** are generated and assessed but not rendered in the UI. Is that deliberate (outcomes lag), or unfinished work?
6. **Evidence snapshotting:** cited pages are not archived. Government sites change URLs, so Malaysia should store the content or a hash.
7. **Cost and quota:** about 600 commitments × about 2 min of agent time per week, plus every feed entry, all on Claude subscription OAuth tokens. What is the real token and cost profile? Is subscription auth acceptable for a production service?
8. **Commitment count:** the docs say 603. The current production count and how many came from each document cannot be confirmed without the DB dump (`rake db:fetch_and_restore` needs GitHub access to BuildCanada's artifacts).
9. **Bilingual input:** Canada ingests English-only feeds (`/en/` URLs). Malaysian sources are mostly BM. Should extraction and evaluation be BM-native, or translate first?
