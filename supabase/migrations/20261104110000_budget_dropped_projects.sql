-- Lampiran F of the MOF budget book: projects of the current year that the budget drops
-- (Budget 2027: 32 of 2026's projects; Budget 2026: 85 of 2025's). The appendix's JUMLAH
-- must equal its rows, and no dropped project may appear in the book's own project tables.
create table budget_dropped_project (
  document_id       text not null references budget_document,
  vote_code         text not null check (vote_code ~ '^P\.[0-9]{2}$'),
  code              char(5) not null check (code ~ '^[0-9]{5}$'),
  name_ms           text not null,
  total_cost_sen    bigint not null,
  actual_prior_sen  bigint not null,  -- as printed; MOF's project-level actuals differ from the statement's
  allocation_sen    bigint not null,  -- the current year's allocation (Peruntukan)
  pdf_page          integer not null check (pdf_page > 0),
  book_page         integer not null check (book_page > 0),
  source_text       text not null,
  primary key (document_id, vote_code, code)
);

alter table budget_dropped_project enable row level security;
create policy public_read on budget_dropped_project for select using (true);

-- A project printed more than once with identical figures is stored once with its count.
-- Budget 2026 prints P.24 00200 twice, and its JUMLAH counts it twice.
alter table budget_dropped_project add column printed_times smallint not null default 1 check (printed_times > 0);
