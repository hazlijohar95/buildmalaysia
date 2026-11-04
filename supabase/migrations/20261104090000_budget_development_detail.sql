-- Development estimates per project from the MOF budget book (P votes). Budget 2027 prints,
-- per project: total project cost, 2025 actual, the 2026 revised estimate (Anggaran
-- Dipinda) and the 2027 estimate split into direct (Cara Langsung) and loan-funded
-- (Pinjaman). The 2025 actual column covers only the projects carried into 2027, so it is
-- not the vote's 2025 spending; that is in budget_vote_figure.

create table budget_development_group (
  document_id  text not null references budget_document,
  vote_code    text not null check (vote_code ~ '^P\.[0-9]{2}$'),
  ordinal      smallint not null check (ordinal > 0),
  name_ms      text not null,
  pdf_page     integer not null check (pdf_page > 0),
  book_page    integer not null check (book_page > 0),
  primary key (document_id, vote_code, ordinal)
);

create table budget_development_project (
  document_id          text not null references budget_document,
  vote_code            text not null check (vote_code ~ '^P\.[0-9]{2}$'),
  code                 char(5) not null check (code ~ '^[0-9]{5}$'),
  group_ordinal        smallint,
  name_ms              text not null,
  total_cost_sen       bigint not null,
  actual_prior_sen     bigint not null,  -- two years before the budget year (2025)
  revised_sen          bigint not null,  -- the current year's revised estimate (2026)
  estimate_direct_sen  bigint not null,  -- the budget year (2027)
  estimate_loan_sen    bigint not null,
  line_no              integer not null check (line_no > 0),
  pdf_page             integer not null check (pdf_page > 0),
  book_page            integer not null check (book_page > 0),
  source_text          text not null,
  primary key (document_id, vote_code, code),
  foreign key (document_id, vote_code, group_ordinal) references budget_development_group
);

-- Printed totals: each group's Jumlah and each vote's JUMLAH ANGGARAN PERBELANJAAN PEMBANGUNAN.
create table budget_development_total (
  id                   bigint generated always as identity primary key,
  document_id          text not null references budget_document,
  vote_code            text not null,
  group_ordinal        smallint,  -- null for the vote total
  total_cost_sen       bigint not null,
  actual_prior_sen     bigint not null,
  revised_sen          bigint not null,
  estimate_direct_sen  bigint not null,
  estimate_loan_sen    bigint not null,
  pdf_page             integer not null check (pdf_page > 0),
  book_page            integer not null check (book_page > 0),
  source_text          text not null,
  foreign key (document_id, vote_code, group_ordinal) references budget_development_group
);

-- Each printed total against its projects: a group's, or for the vote total all of the vote's.
create view budget_development_reconciliation as
select t.id as printed_total_id, t.document_id, t.vote_code, t.group_ordinal, t.pdf_page, t.book_page,
       coalesce(s.project_count, 0) as project_count,
       coalesce((t.total_cost_sen, t.actual_prior_sen, t.revised_sen, t.estimate_direct_sen, t.estimate_loan_sen)
                  = (s.total_cost_sen, s.actual_prior_sen, s.revised_sen, s.estimate_direct_sen, s.estimate_loan_sen),
                false) as matches
from budget_development_total t
left join lateral (
  select sum(p.total_cost_sen) as total_cost_sen, sum(p.actual_prior_sen) as actual_prior_sen,
         sum(p.revised_sen) as revised_sen, sum(p.estimate_direct_sen) as estimate_direct_sen,
         sum(p.estimate_loan_sen) as estimate_loan_sen, count(*) as project_count
  from budget_development_project p
  where p.document_id = t.document_id and p.vote_code = t.vote_code
    and (t.group_ordinal is null or p.group_ordinal = t.group_ordinal)
) s on true;

-- Each P vote's 2027 direct and loan estimate against the same vote in the summary pages.
-- P.70's own table prints the contingency as direct; the summary keeps it apart, so only
-- its total compares.
create view budget_development_consistency as
select t.document_id, t.vote_code,
       t.estimate_direct_sen, t.estimate_loan_sen,
       f.direct_sen as summary_direct_sen, f.loan_sen as summary_loan_sen, f.total_sen as summary_total_sen,
       case when t.vote_code = 'P.70'
         then t.estimate_direct_sen + t.estimate_loan_sen = f.total_sen
         else (t.estimate_direct_sen, t.estimate_loan_sen) = (f.direct_sen, f.loan_sen)
       end is true as matches
from budget_development_total t
join budget_document d on d.document_id = t.document_id
left join budget_vote_figure f
  on f.document_id = t.document_id and f.vote_code = t.vote_code and f.fiscal_year = d.budget_year
where t.group_ordinal is null;

alter table budget_development_group   enable row level security;
alter table budget_development_project enable row level security;
alter table budget_development_total   enable row level security;
create policy public_read on budget_development_group   for select using (true);
create policy public_read on budget_development_project for select using (true);
create policy public_read on budget_development_total   for select using (true);
