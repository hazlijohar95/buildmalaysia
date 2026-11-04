-- Federal development expenditure (Perbelanjaan Pembangunan) for the year and the
-- current Malaysia Plan (RMKe-12, 2021-2025), from JANM's Penyata Kewangan Kerajaan
-- Persekutuan, Lampiran 2.
--
-- Each project row is printed across a two-page spread: the left page carries the code,
-- name, total cost and plan spending up to the prior year; the right page carries the
-- year's estimate and actual, each split into direct (Cara Langsung) and loan-funded
-- (Pinjaman), and plan spending to date. Amounts are integer sen.

create table development_vote (
  fiscal_year  smallint not null,
  code         text not null check (code ~ '^P\.[0-9]{2}$'),
  name_ms      text not null,
  primary key (fiscal_year, code)
);

-- A heading inside a vote, usually an agency or department, closed by its own printed
-- "Jumlah" line. A group whose total sums other groups (e.g. the three forestry
-- departments) is their parent and holds no projects itself.
create table development_group (
  fiscal_year     smallint not null,
  vote_code       text not null,
  ordinal         smallint not null check (ordinal > 0),
  name_ms         text not null,
  parent_ordinal  smallint,
  primary key (fiscal_year, vote_code, ordinal),
  foreign key (fiscal_year, vote_code) references development_vote,
  foreign key (fiscal_year, vote_code, parent_ordinal) references development_group,
  check (parent_ordinal <> ordinal)
);

create table development_project (
  fiscal_year               smallint not null,
  vote_code                 text not null,
  code                      char(5) not null check (code ~ '^[0-9]{5}$'),
  group_ordinal             smallint,
  name_ms                   text not null,
  total_cost_sen            bigint not null,  -- Kos Keseluruhan
  plan_actual_prior_sen     bigint not null,  -- Perbelanjaan Sebenar RMKe-12 hingga 31 Disember of the prior year
  estimate_direct_sen       bigint not null,  -- Anggaran, Cara Langsung
  estimate_loan_sen         bigint not null,  -- Anggaran, Pinjaman
  estimate_sen              bigint not null,  -- Anggaran, Jumlah
  actual_direct_sen         bigint not null,  -- Perbelanjaan Sebenar, Cara Langsung
  actual_loan_sen           bigint not null,  -- Perbelanjaan Sebenar, Pinjaman
  actual_sen                bigint not null,  -- Perbelanjaan Sebenar, Jumlah
  plan_actual_to_date_sen   bigint not null,  -- Perbelanjaan Sebenar RMKe-12 hingga 31 Disember of the year
  footnote                  text,
  document_id               text not null references source_document,
  pdf_page                  integer not null check (pdf_page > 0),  -- left page: code, name, total cost
  line_no                   integer not null check (line_no > 0),   -- first line of the row on the left page
  book_page                 integer not null check (book_page > 0),
  amounts_pdf_page          integer not null check (amounts_pdf_page = pdf_page + 1),  -- right page: the year's figures
  amounts_book_page         integer not null check (amounts_book_page = book_page + 1),
  source_text               text not null,
  amounts_source_text       text not null,
  primary key (fiscal_year, vote_code, code),
  foreign key (fiscal_year, vote_code) references development_vote,
  foreign key (fiscal_year, vote_code, group_ordinal) references development_group,
  check (estimate_direct_sen + estimate_loan_sen = estimate_sen),
  check (actual_direct_sen + actual_loan_sen = actual_sen),
  check (plan_actual_prior_sen + actual_sen = plan_actual_to_date_sen)
);

create type development_total_scope as enum ('group', 'vote', 'statement');

create table development_printed_total (
  id                        bigint generated always as identity primary key,
  document_id               text not null references source_document,
  fiscal_year               smallint not null,
  scope                     development_total_scope not null,
  vote_code                 text,
  group_ordinal             smallint,
  total_cost_sen            bigint not null,
  plan_actual_prior_sen     bigint not null,
  estimate_direct_sen       bigint not null,
  estimate_loan_sen         bigint not null,
  estimate_sen              bigint not null,
  actual_direct_sen         bigint not null,
  actual_loan_sen           bigint not null,
  actual_sen                bigint not null,
  plan_actual_to_date_sen   bigint not null,
  footnote                  text,
  pdf_page                  integer not null check (pdf_page > 0),
  book_page                 integer not null check (book_page > 0),
  amounts_pdf_page          integer not null check (amounts_pdf_page = pdf_page + 1),
  amounts_book_page         integer not null check (amounts_book_page = book_page + 1),
  source_text               text not null,
  amounts_source_text       text not null,
  foreign key (fiscal_year, vote_code, group_ordinal) references development_group,
  check (case scope
    when 'group'     then vote_code is not null and group_ordinal is not null
    when 'vote'      then vote_code is not null and group_ordinal is null
    when 'statement' then vote_code is null and group_ordinal is null
  end)
);

-- Recomputes every printed total from the projects. A project counts toward its own
-- group and that group's parent.
create view development_reconciliation as
with amounts as (
  select p.document_id, p.vote_code, p.group_ordinal, g.parent_ordinal,
         p.total_cost_sen, p.plan_actual_prior_sen, p.estimate_direct_sen, p.estimate_loan_sen, p.estimate_sen,
         p.actual_direct_sen, p.actual_loan_sen, p.actual_sen, p.plan_actual_to_date_sen
  from development_project p
  left join development_group g
    on g.fiscal_year = p.fiscal_year and g.vote_code = p.vote_code and g.ordinal = p.group_ordinal
),
memberships as (
  select a.*, a.group_ordinal as total_group from amounts a
  union all
  select a.*, a.parent_ordinal from amounts a where a.parent_ordinal is not null
),
sums as (
  select document_id, vote_code, total_group,
         sum(total_cost_sen) as total_cost_sen, sum(plan_actual_prior_sen) as plan_actual_prior_sen,
         sum(estimate_direct_sen) as estimate_direct_sen, sum(estimate_loan_sen) as estimate_loan_sen,
         sum(estimate_sen) as estimate_sen, sum(actual_direct_sen) as actual_direct_sen,
         sum(actual_loan_sen) as actual_loan_sen, sum(actual_sen) as actual_sen,
         sum(plan_actual_to_date_sen) as plan_actual_to_date_sen, count(*) as project_count
  from memberships
  where total_group is not null
  group by document_id, vote_code, total_group
  union all
  select document_id, vote_code, null,
         sum(total_cost_sen), sum(plan_actual_prior_sen), sum(estimate_direct_sen), sum(estimate_loan_sen),
         sum(estimate_sen), sum(actual_direct_sen), sum(actual_loan_sen), sum(actual_sen),
         sum(plan_actual_to_date_sen), count(*)
  from amounts
  group by grouping sets ((document_id, vote_code), (document_id))
)
select t.id as printed_total_id, t.document_id, t.fiscal_year, t.scope, t.vote_code, t.group_ordinal,
       t.pdf_page, t.footnote,
       t.total_cost_sen          - coalesce(s.total_cost_sen, 0)          as total_cost_diff_sen,
       t.plan_actual_prior_sen   - coalesce(s.plan_actual_prior_sen, 0)   as plan_actual_prior_diff_sen,
       t.estimate_direct_sen     - coalesce(s.estimate_direct_sen, 0)     as estimate_direct_diff_sen,
       t.estimate_loan_sen       - coalesce(s.estimate_loan_sen, 0)       as estimate_loan_diff_sen,
       t.estimate_sen            - coalesce(s.estimate_sen, 0)            as estimate_diff_sen,
       t.actual_direct_sen       - coalesce(s.actual_direct_sen, 0)       as actual_direct_diff_sen,
       t.actual_loan_sen         - coalesce(s.actual_loan_sen, 0)         as actual_loan_diff_sen,
       t.actual_sen              - coalesce(s.actual_sen, 0)              as actual_diff_sen,
       t.plan_actual_to_date_sen - coalesce(s.plan_actual_to_date_sen, 0) as plan_actual_to_date_diff_sen,
       coalesce(s.project_count, 0) as project_count,
       coalesce((t.total_cost_sen, t.plan_actual_prior_sen, t.estimate_direct_sen, t.estimate_loan_sen,
                 t.estimate_sen, t.actual_direct_sen, t.actual_loan_sen, t.actual_sen, t.plan_actual_to_date_sen)
                  = (s.total_cost_sen, s.plan_actual_prior_sen, s.estimate_direct_sen, s.estimate_loan_sen,
                     s.estimate_sen, s.actual_direct_sen, s.actual_loan_sen, s.actual_sen, s.plan_actual_to_date_sen),
                false) as matches
from development_printed_total t
left join sums s
  on  s.document_id = t.document_id
  and s.vote_code   is not distinct from t.vote_code
  and s.total_group is not distinct from t.group_ordinal;

alter table development_vote          enable row level security;
alter table development_group         enable row level security;
alter table development_project       enable row level security;
alter table development_printed_total enable row level security;

do $$
declare t text;
begin
  foreach t in array array['development_vote','development_group','development_project','development_printed_total'] loop
    execute format('create policy public_read on %I for select using (true)', t);
  end loop;
end $$;
