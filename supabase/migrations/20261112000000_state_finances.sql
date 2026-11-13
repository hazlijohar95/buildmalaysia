-- State governments' finances, from each state's audited financial statements.
--
-- Each of the 13 states publishes its own Penyata Kewangan Kerajaan Negeri, audited by the
-- National Audit Department, on its treasury's site. From each loaded statement two notes are
-- read: revenue by type (Hasil mengikut penjenisannya) and operating expenditure by vote
-- (Perbelanjaan Mengurus mengikut Maksud Perbelanjaan). Amounts are integer sen as printed, and
-- every row cites its PDF page and the printed lines it was read from.
--
-- `python -m pipeline ingest-state --state <slug> --year <yyyy>` replaces one statement and
-- commits only if `state_reconciliation` recomputes every printed total from the rows. The
-- states and years not loaded, and why, are in `state_gap` (`load-state-gaps`).

create table state (
  slug          text primary key,
  name_ms       text not null,
  name_en       text not null
);

insert into state (slug, name_ms, name_en) values
  ('johor', 'Johor', 'Johor'),
  ('kedah', 'Kedah', 'Kedah'),
  ('kelantan', 'Kelantan', 'Kelantan'),
  ('melaka', 'Melaka', 'Malacca'),
  ('negeri-sembilan', 'Negeri Sembilan', 'Negeri Sembilan'),
  ('pahang', 'Pahang', 'Pahang'),
  ('perak', 'Perak', 'Perak'),
  ('perlis', 'Perlis', 'Perlis'),
  ('pulau-pinang', 'Pulau Pinang', 'Penang'),
  ('sabah', 'Sabah', 'Sabah'),
  ('sarawak', 'Sarawak', 'Sarawak'),
  ('selangor', 'Selangor', 'Selangor'),
  ('terengganu', 'Terengganu', 'Terengganu');

create table state_statement (
  id            text primary key,           -- e.g. 'perak-penyata-kewangan-2024'
  state_slug    text not null references state (slug),
  fiscal_year   smallint not null,
  publisher     text not null,
  title         text not null,
  url           text not null,
  sha256        text not null,
  page_count    integer not null,
  retrieved_at  timestamptz not null,
  loaded_at     timestamptz not null default now(),
  unique (state_slug, fiscal_year)
);

-- The sections read from each statement.
create type state_section as enum ('revenue', 'operating');

-- One row per item the statement prints: a revenue item, or an operating vote.
--   revenue:   category hasil_cukai, hasil_bukan_cukai or terimaan_bukan_hasil
--   operating: category tanggungan (charged votes) or bekalan (supply votes)
-- A cell printed blank is null; a dash is zero.
create table state_line (
  statement_id  text not null references state_statement (id) on delete cascade,
  section       state_section not null,
  position      integer not null,           -- printed order within the section
  category      text not null,
  code          text,                       -- the vote or account code as printed: 'B09', 'T. 01', '61000'
  name_ms       text not null,
  original_sen  bigint,                     -- Anggaran Asal
  revised_sen   bigint,                     -- Anggaran Disemak / Dipinda
  actual_sen    bigint not null,            -- Sebenar
  prior_actual_sen bigint,                  -- the year before's Sebenar, where the note prints it
  pdf_page      integer not null,
  source_text   text not null,              -- the row's printed lines, top to bottom
  primary key (statement_id, section, position)
);

-- Every total the two notes print. scope says what it adds up:
--   category                 the rows of `category`
--   statement                every row of the section
--   statement_less_transfer  every row less the transfer to the Development Fund (Perak, Terengganu
--                            print their operating total before and after it)
--   statement_plus_transfer  every row plus the transfer (Melaka's votes exclude it)
-- and `transfer` rows are the transfer itself as printed, not a total.
create table state_printed_total (
  statement_id  text not null references state_statement (id) on delete cascade,
  section       state_section not null,
  position      integer not null,
  scope         text not null check (scope in ('category', 'statement', 'statement_less_transfer',
                                               'statement_plus_transfer', 'transfer')),
  category      text,
  label         text not null,
  original_sen  bigint,
  revised_sen   bigint,
  actual_sen    bigint,
  prior_actual_sen bigint,
  pdf_page      integer not null,
  source_text   text not null,
  primary key (statement_id, section, position),
  check ((scope = 'category') = (category is not null))
);

-- Each printed total beside the sum of its rows, per column. A column the total prints blank is
-- not compared. `matches` must be true for every row, except a misprint registered in the pipeline
-- (StateMisprint), which stays visible here.
create view state_reconciliation as
with leaves as (
  select statement_id, section, category,
         sum(original_sen) as original_sen, sum(revised_sen) as revised_sen,
         sum(actual_sen) as actual_sen, sum(prior_actual_sen) as prior_actual_sen
  from state_line
  group by grouping sets ((statement_id, section, category), (statement_id, section))
),
transfer as (
  select statement_id, section,
         sum(original_sen) as original_sen, sum(revised_sen) as revised_sen,
         sum(actual_sen) as actual_sen, sum(prior_actual_sen) as prior_actual_sen
  from state_printed_total where scope = 'transfer'
  group by statement_id, section
),
expected as (
  select t.statement_id, t.section, t.position, t.scope, t.category, t.label, t.pdf_page,
         t.original_sen, t.revised_sen, t.actual_sen, t.prior_actual_sen,
         l.original_sen + s.sign * coalesce(x.original_sen, 0) as computed_original_sen,
         l.revised_sen + s.sign * coalesce(x.revised_sen, 0) as computed_revised_sen,
         l.actual_sen + s.sign * coalesce(x.actual_sen, 0) as computed_actual_sen,
         l.prior_actual_sen + s.sign * coalesce(x.prior_actual_sen, 0) as computed_prior_actual_sen
  from state_printed_total t
  cross join lateral (select case t.scope when 'statement_less_transfer' then -1
                                          when 'statement_plus_transfer' then 1 else 0 end as sign) s
  join leaves l on l.statement_id = t.statement_id and l.section = t.section
   and l.category is not distinct from t.category
  left join transfer x on x.statement_id = t.statement_id and x.section = t.section
  where t.scope <> 'transfer'
)
select statement_id, section, position, scope, category, label, pdf_page,
       original_sen, computed_original_sen, revised_sen, computed_revised_sen,
       actual_sen, computed_actual_sen, prior_actual_sen, computed_prior_actual_sen,
       (original_sen is null or original_sen = computed_original_sen)
       and (revised_sen is null or revised_sen = computed_revised_sen)
       and (actual_sen is null or actual_sen = computed_actual_sen)
       and (prior_actual_sen is null or prior_actual_sen = computed_prior_actual_sen) as matches
from expected;

-- A state, or a year of one, the site does not show, and why: from STATE_GAPS in
-- pipeline/src/pipeline/state_sources.py (`load-state-gaps`).
create table state_gap (
  state_slug    text not null references state (slug),
  fiscal_year   smallint,                   -- null: no year of this state is loaded
  reason        text not null,
  source_url    text,
  position      integer not null,
  primary key (state_slug, position)
);

create index state_line_statement on state_line (statement_id, section, category);

alter table state enable row level security;
create policy public_read on state for select using (true);
alter table state_statement enable row level security;
create policy public_read on state_statement for select using (true);
alter table state_line enable row level security;
create policy public_read on state_line for select using (true);
alter table state_printed_total enable row level security;
create policy public_read on state_printed_total for select using (true);
alter table state_gap enable row level security;
create policy public_read on state_gap for select using (true);
