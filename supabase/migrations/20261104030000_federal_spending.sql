-- Whole-year and per-ministry spending across Lampiran 1 (operating) and Lampiran 2
-- (development).
--
-- Lampiran 1's printed total includes the transfer from the Consolidated Fund to the
-- Development Fund (Kumpulan Wang Pembangunan, under vote B.12), and that fund pays for
-- the spending in Lampiran 2. Adding the two printed totals would count the transfer
-- twice, so total spending is operating less the transfer plus development. This matches
-- data.gov.my (spending_oe + spending_de_gross); see specs/external-checks.md.

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
       o.actual_sen - t.actual_sen                 as operating_net_actual_sen,
       o.actual_sen - t.actual_sen + d.actual_sen  as total_actual_sen
from printed_total o
join source_document sd on sd.id = o.document_id
join development_printed_total d on d.document_id = o.document_id and d.scope = 'statement'
join operating_line_detail t
  on t.document_id = o.document_id and t.vote_code = 'B.12' and t.activity_name_ms = 'Kumpulan Wang Pembangunan'
where o.scope = 'statement' and o.object_code is null;

-- A ministry's supply vote B.nn and development vote P.nn share the number and the
-- printed name (all 29 pairs in FY2025). Votes pair only when both match.
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
  on d.fiscal_year = o.fiscal_year and d.number = o.number and d.name_ms = o.name_ms;
