-- Federal revenue by type (Hasil mengikut penjenisan), from Note 5(a) of JANM's Penyata
-- Kewangan Kerajaan Persekutuan, "Akaun Hasil Disatukan".
--
-- The note prints whole ringgit; amounts are stored as integer sen. Items live in
-- revenue_line, every category line the note prints (HASIL, HASIL CUKAI, Cukai Langsung, ...)
-- in revenue_total, and revenue_reconciliation recomputes each category from the items
-- under it. % Anggaran is derived and not stored.

create type revenue_category as enum (
  'revenue',               -- HASIL
  'tax',                   -- HASIL CUKAI
  'direct_tax',            -- Cukai Langsung
  'indirect_tax',          -- Cukai Tidak Langsung
  'non_tax',               -- HASIL BUKAN CUKAI
  'non_revenue_receipts',  -- TERIMAAN BUKAN HASIL
  'federal_territory'      -- HASIL WILAYAH PERSEKUTUAN
);

create table revenue_total (
  fiscal_year            smallint not null,
  category               revenue_category not null,
  parent_category        revenue_category,
  name_ms                text not null,
  original_estimate_sen  bigint not null,  -- Anggaran Asal
  revised_estimate_sen   bigint not null,  -- Anggaran Disemak
  actual_sen             bigint not null,  -- Sebenar
  prior_year_actual_sen  bigint not null,  -- Sebenar of the year before, as this statement prints it
  document_id            text not null references source_document,
  pdf_page               integer not null check (pdf_page > 0),
  book_page              integer not null check (book_page > 0),
  line_no                integer not null check (line_no > 0),
  source_text            text not null,
  primary key (fiscal_year, category),
  foreign key (fiscal_year, parent_category) references revenue_total (fiscal_year, category),
  check ((category = 'revenue') = (parent_category is null)),
  check (original_estimate_sen % 100 = 0 and revised_estimate_sen % 100 = 0
         and actual_sen % 100 = 0 and prior_year_actual_sen % 100 = 0)
);

create table revenue_line (
  fiscal_year            smallint not null,
  ordinal                smallint not null check (ordinal > 0),  -- printed order within the note
  category               revenue_category not null,              -- the innermost category above it
  name_ms                text not null,
  original_estimate_sen  bigint not null,
  revised_estimate_sen   bigint not null,
  actual_sen             bigint not null,
  prior_year_actual_sen  bigint not null,
  document_id            text not null references source_document,
  pdf_page               integer not null check (pdf_page > 0),
  book_page              integer not null check (book_page > 0),
  line_no                integer not null check (line_no > 0),
  source_text            text not null,  -- a name wrapped over several lines is joined with a newline
  primary key (fiscal_year, ordinal),
  unique (fiscal_year, name_ms),
  foreign key (fiscal_year, category) references revenue_total (fiscal_year, category),
  check (original_estimate_sen % 100 = 0 and revised_estimate_sen % 100 = 0
         and actual_sen % 100 = 0 and prior_year_actual_sen % 100 = 0)
);

create view revenue_reconciliation as
with recursive below (fiscal_year, ancestor, category) as (
  select fiscal_year, category, category from revenue_total
  union all
  select b.fiscal_year, b.ancestor, t.category
  from below b
  join revenue_total t on t.fiscal_year = b.fiscal_year and t.parent_category = b.category
)
select t.document_id, t.fiscal_year, t.category, t.name_ms, t.pdf_page, t.book_page,
       t.original_estimate_sen - s.original_estimate_sen as original_estimate_diff_sen,
       t.revised_estimate_sen  - s.revised_estimate_sen  as revised_estimate_diff_sen,
       t.actual_sen            - s.actual_sen            as actual_diff_sen,
       t.prior_year_actual_sen - s.prior_year_actual_sen as prior_year_actual_diff_sen,
       s.line_count,
       (t.original_estimate_sen, t.revised_estimate_sen, t.actual_sen, t.prior_year_actual_sen)
         = (s.original_estimate_sen, s.revised_estimate_sen, s.actual_sen, s.prior_year_actual_sen)
         and s.line_count > 0 as matches
from revenue_total t
cross join lateral (
  select coalesce(sum(l.original_estimate_sen), 0) as original_estimate_sen,
         coalesce(sum(l.revised_estimate_sen), 0)  as revised_estimate_sen,
         coalesce(sum(l.actual_sen), 0)            as actual_sen,
         coalesce(sum(l.prior_year_actual_sen), 0) as prior_year_actual_sen,
         count(l.*)                                as line_count
  from below b
  join revenue_line l on l.fiscal_year = b.fiscal_year and l.category = b.category
  where b.fiscal_year = t.fiscal_year and b.ancestor = t.category and l.document_id = t.document_id
) s;

-- The Consolidated Revenue Account balances: revenue equals operating spending including
-- the transfer of the year's surplus to the Development Fund (Lampiran 1's statement
-- total). The note prints whole ringgit and Lampiran 1 prints sen, so they may differ by
-- the note's rounding, at most 50 sen.
create view revenue_operating_balance as
select r.document_id, r.fiscal_year,
       r.actual_sen               as revenue_actual_sen,
       o.actual_sen               as operating_actual_sen,
       r.actual_sen - o.actual_sen as diff_sen,
       abs(r.actual_sen - o.actual_sen) <= 50 as matches,
       r.pdf_page as revenue_pdf_page, r.book_page as revenue_book_page,
       o.pdf_page as operating_pdf_page, o.book_page as operating_book_page
from revenue_total r
join printed_total o
  on o.document_id = r.document_id and o.scope = 'statement' and o.object_code is null
where r.category = 'revenue';

alter table revenue_total enable row level security;
alter table revenue_line  enable row level security;
create policy public_read on revenue_total for select using (true);
create policy public_read on revenue_line  for select using (true);
