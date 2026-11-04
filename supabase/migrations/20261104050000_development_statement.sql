-- Lampiran 2 has two plan columns: spending to the end of the prior year (left page) and
-- spending to date (right page), each counted against the Malaysia Plan named in its head.
-- They name the same plan except in a plan's first year: FY2021 prints RMKe-11 to
-- 31.12.2020 on the left and RMKe-12 to 31.12.2021 on the right.
create table development_statement (
  document_id  text primary key references source_document,
  fiscal_year  smallint not null unique,
  prior_plan   text not null check (prior_plan ~ '^RMKe-[0-9]+$'),
  plan         text not null check (plan ~ '^RMKe-[0-9]+$')
);

alter table development_statement enable row level security;
create policy public_read on development_statement for select using (true);

-- prior + actual = to date holds only within one plan, so the parser checks it per
-- statement: within a plan as written, and in a plan's first year as actual = to date.
alter table development_project drop constraint development_project_check4;
