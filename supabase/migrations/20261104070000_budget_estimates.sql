-- MOF budget estimates (Anggaran Perbelanjaan Persekutuan), starting with the vote-level
-- summary "Ringkasan Perbelanjaan Sebenar dan Anggaran Perbelanjaan Mengurus dan
-- Pembangunan": for every vote, two years of actual spending, the current year's original
-- estimate and the coming year's estimate. Budget 2027 prints 2024 and 2025 actuals, the
-- 2026 original estimate and the 2027 estimate. Amounts are printed in whole ringgit and
-- stored in sen.
--
-- The printed actuals restate JANM's audited figures, so budget_actual_check compares them
-- vote by vote with the statements already loaded.

create type budget_basis as enum ('actual', 'original_estimate', 'estimate');

create table budget_document (
  document_id  text primary key references source_document,
  budget_year  smallint not null unique  -- the year the budget is for
);

-- One row per vote and year. Operating votes (T, B) split into emoluments and other
-- spending; development votes (P) into direct and loan-funded. P.70, the contingency
-- reserve, is printed as one figure.
create table budget_vote_figure (
  document_id      text not null references budget_document,
  vote_code        text not null check (vote_code ~ '^[TBP]\.[0-9]{2}$'),
  heading          text not null,  -- the ministry or agency heading printed above the vote
  fiscal_year      smallint not null,
  basis            budget_basis not null,
  total_sen        bigint not null,
  emoluments_sen   bigint,
  other_sen        bigint,
  direct_sen       bigint,
  loan_sen         bigint,
  pdf_page         integer not null check (pdf_page > 0),
  book_page        integer not null check (book_page > 0),
  source_text      text not null,
  primary key (document_id, vote_code, fiscal_year),
  check (case
    when vote_code like 'P.%' and vote_code <> 'P.70'
      then direct_sen + loan_sen = total_sen and emoluments_sen is null and other_sen is null
    when vote_code = 'P.70'
      then direct_sen is null and loan_sen is null and emoluments_sen is null and other_sen is null
    else emoluments_sen + other_sen = total_sen and direct_sen is null and loan_sen is null
  end)
);

-- The grand summary ("Ringkasan Keseluruhan") per year. Its JUMLAH BESAR adds operating
-- and development as printed, so it counts the operating transfer to the Development Fund
-- in both; federal_spending explains the difference for years with statements.
create table budget_total (
  document_id      text not null references budget_document,
  fiscal_year      smallint not null,
  basis            budget_basis not null,
  operating_sen    bigint not null,
  emoluments_sen   bigint not null,
  other_sen        bigint not null,
  development_sen  bigint not null,
  direct_sen       bigint not null,
  loan_sen         bigint not null,
  contingency_sen  bigint not null,  -- P.70 Simpanan Luar Jangka, included in development
  grand_total_sen  bigint not null,  -- JUMLAH BESAR
  pdf_page         integer not null check (pdf_page > 0),
  book_page        integer not null check (book_page > 0),
  primary key (document_id, fiscal_year),
  check (emoluments_sen + other_sen = operating_sen),
  check (direct_sen + loan_sen + contingency_sen = development_sen),
  check (operating_sen + development_sen = grand_total_sen)
);

-- MOF's printed actuals against the audited statements: every vote total, and the
-- emoluments line against the statement's per-vote emoluments total. MOF prints whole
-- ringgit: 'matches' is within 50 sen (the total rounded). MOF's totals for Budget 2027 can
-- also be one or two ringgit off the rounded statement figure in either direction, as when
-- rounded parts are summed (FY2024 B.13: JANM 855,341,185.21, MOF 855,341,186); 'rounding'
-- is within RM10. Anything larger is 'differs'.
create view budget_actual_check as
with janm as (
  select t.fiscal_year, t.vote_code, 'total' as line, t.actual_sen
  from printed_total t
  where t.scope = 'vote' and t.object_code is null
  union all
  select t.fiscal_year, t.vote_code, 'emoluments', t.actual_sen
  from printed_total t
  where t.scope = 'vote' and t.object_code = '10000'
  union all
  select t.fiscal_year, t.vote_code, 'total', t.actual_sen
  from development_printed_total t
  where t.scope = 'vote'
),
mof as (
  select f.document_id, f.fiscal_year, f.vote_code, f.heading, 'total' as line, f.total_sen as mof_sen,
         f.pdf_page, f.book_page
  from budget_vote_figure f where f.basis = 'actual'
  union all
  select f.document_id, f.fiscal_year, f.vote_code, f.heading, 'emoluments', f.emoluments_sen, f.pdf_page, f.book_page
  from budget_vote_figure f where f.basis = 'actual' and f.emoluments_sen is not null
)
select m.document_id, m.fiscal_year, m.vote_code, m.heading, m.line, m.mof_sen, j.actual_sen as janm_sen,
       m.mof_sen - j.actual_sen as diff_sen,
       case
         when j.actual_sen is null and m.mof_sen = 0 then 'matches'  -- nothing spent; the statement prints no line
         when j.actual_sen is null then 'no statement figure'
         when abs(m.mof_sen - j.actual_sen) <= 50 then 'matches'
         when abs(m.mof_sen - j.actual_sen) <= 1000 then 'rounding'
         else 'differs'
       end as result,
       m.pdf_page, m.book_page
from mof m
left join janm j on j.fiscal_year = m.fiscal_year and j.vote_code = m.vote_code and j.line = m.line;

alter table budget_document    enable row level security;
alter table budget_vote_figure enable row level security;
alter table budget_total       enable row level security;
create policy public_read on budget_document    for select using (true);
create policy public_read on budget_vote_figure for select using (true);
create policy public_read on budget_total       for select using (true);
