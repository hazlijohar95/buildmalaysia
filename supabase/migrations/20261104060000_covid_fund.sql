-- COVID-19 Fund (Kumpulan Wang COVID-19) spending, from the federal statements' Lampiran 3
-- (FY2020-2023). Each programme row is printed across a two-page spread like Lampiran 2.
-- The fund is financed outside the operating account (no operating transfer feeds it), so
-- its spending adds to operating and development spending; data.gov.my reports it
-- separately as spending_covid19.

create table covid_fund_line (
  fiscal_year          smallint not null,
  code                 char(5) not null check (code ~ '^[0-9]{5}$'),
  name_ms              text not null,
  ceiling_sen          bigint not null,  -- Siling Keseluruhan
  spent_prior_sen      bigint not null,  -- Perbelanjaan sehingga 31 Disember of the prior year
  allocation_sen       bigint not null,  -- Peruntukan
  supplementary_sen    bigint not null,  -- Tambahan (FY2021 only; zero where not printed)
  virement_sen         bigint not null,  -- Viremen Tambah/(Kurang)
  revised_sen          bigint not null,  -- Peruntukan Dipinda
  actual_sen           bigint not null,  -- Perbelanjaan Sebenar
  spent_to_date_sen    bigint not null,  -- Perbelanjaan Terkumpul sehingga 31 Disember of the year
  document_id          text not null references source_document,
  pdf_page             integer not null check (pdf_page > 0),
  book_page            integer not null check (book_page > 0),
  line_no              integer not null check (line_no > 0),
  amounts_pdf_page     integer not null check (amounts_pdf_page = pdf_page + 1),
  amounts_book_page    integer not null check (amounts_book_page = book_page + 1),
  source_text          text not null,
  amounts_source_text  text not null,
  primary key (fiscal_year, code),
  check (allocation_sen + supplementary_sen + virement_sen = revised_sen),
  check (spent_prior_sen + actual_sen = spent_to_date_sen)
);

-- The statement's one printed total, "Jumlah Keseluruhan".
create table covid_fund_total (
  document_id          text primary key references source_document,
  fiscal_year          smallint not null unique,
  ceiling_sen          bigint not null,
  spent_prior_sen      bigint not null,
  allocation_sen       bigint not null,
  supplementary_sen    bigint not null,
  virement_sen         bigint not null,
  revised_sen          bigint not null,
  actual_sen           bigint not null,
  spent_to_date_sen    bigint not null,
  pdf_page             integer not null check (pdf_page > 0),
  book_page            integer not null check (book_page > 0),
  amounts_pdf_page     integer not null check (amounts_pdf_page = pdf_page + 1),
  amounts_book_page    integer not null check (amounts_book_page = book_page + 1),
  source_text          text not null,
  amounts_source_text  text not null
);

create view covid_fund_reconciliation as
select t.document_id, t.fiscal_year, t.pdf_page,
       count(l.code) as line_count,
       coalesce((t.ceiling_sen, t.spent_prior_sen, t.allocation_sen, t.supplementary_sen, t.virement_sen,
                 t.revised_sen, t.actual_sen, t.spent_to_date_sen)
                  = (sum(l.ceiling_sen), sum(l.spent_prior_sen), sum(l.allocation_sen), sum(l.supplementary_sen),
                     sum(l.virement_sen), sum(l.revised_sen), sum(l.actual_sen), sum(l.spent_to_date_sen)),
                false) as matches,
       t.actual_sen - coalesce(sum(l.actual_sen), 0) as actual_diff_sen,
       t.revised_sen - coalesce(sum(l.revised_sen), 0) as revised_diff_sen,
       t.spent_to_date_sen - coalesce(sum(l.spent_to_date_sen), 0) as spent_to_date_diff_sen
from covid_fund_total t
left join covid_fund_line l on l.document_id = t.document_id
group by t.document_id;

alter table covid_fund_line  enable row level security;
alter table covid_fund_total enable row level security;
create policy public_read on covid_fund_line  for select using (true);
create policy public_read on covid_fund_total for select using (true);

-- Total spending now adds the COVID-19 Fund where a year has one.
drop view ministry_spending, federal_spending;

create view federal_spending as
select o.fiscal_year, o.document_id, sd.url as doc_url,
       o.actual_sen                                as operating_actual_sen,
       o.revised_sen                               as operating_revised_sen,
       o.pdf_page                                  as operating_pdf_page,
       o.book_page                                 as operating_book_page,
       t.actual_sen                                as development_fund_transfer_sen,
       t.pdf_page                                  as transfer_pdf_page,
       t.book_page                                 as transfer_book_page,
       d.estimate_sen                              as development_estimate_sen,
       d.actual_sen                                as development_actual_sen,
       d.amounts_pdf_page                          as development_pdf_page,
       d.amounts_book_page                         as development_book_page,
       c.actual_sen                                as covid_fund_actual_sen,
       c.amounts_pdf_page                          as covid_fund_pdf_page,
       c.amounts_book_page                         as covid_fund_book_page,
       o.actual_sen - t.actual_sen                 as operating_net_actual_sen,
       o.actual_sen - t.actual_sen + d.actual_sen + coalesce(c.actual_sen, 0) as total_actual_sen
from printed_total o
join source_document sd on sd.id = o.document_id
join development_printed_total d on d.document_id = o.document_id and d.scope = 'statement'
join operating_line_detail t
  on t.document_id = o.document_id and t.vote_code = 'B.12' and t.activity_name_ms = 'Kumpulan Wang Pembangunan'
left join covid_fund_total c on c.document_id = o.document_id
where o.scope = 'statement' and o.object_code is null;

create view ministry_spending as
with operating as (
  select v.fiscal_year, v.code, substr(v.code, 3) as number, v.name_ms, t.revised_sen, t.actual_sen
  from vote v
  join printed_total t on t.fiscal_year = v.fiscal_year and t.vote_code = v.code
   and t.scope = 'vote' and t.object_code is null
  where v.section = 'supply'
),
development as (
  select v.fiscal_year, v.code, substr(v.code, 3) as number, v.name_ms, t.estimate_sen, t.actual_sen
  from development_vote v
  join development_printed_total t on t.fiscal_year = v.fiscal_year and t.vote_code = v.code and t.scope = 'vote'
)
select coalesce(o.fiscal_year, d.fiscal_year) as fiscal_year,
       coalesce(o.number, d.number)           as number,
       coalesce(o.name_ms, d.name_ms)         as name_ms,
       o.code                                 as operating_vote_code,
       o.revised_sen                          as operating_revised_sen,
       o.actual_sen                           as operating_actual_sen,
       d.code                                 as development_vote_code,
       d.estimate_sen                         as development_estimate_sen,
       d.actual_sen                           as development_actual_sen,
       coalesce(o.actual_sen, 0) + coalesce(d.actual_sen, 0) as actual_sen
from operating o
full join development d
  on d.fiscal_year = o.fiscal_year and d.number = o.number;
