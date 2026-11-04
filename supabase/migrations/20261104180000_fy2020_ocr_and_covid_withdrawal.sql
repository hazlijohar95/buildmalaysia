-- FY2020.
--
-- 1. Lampiran 1 of the FY2020 statement is drawn without a text layer and is read by OCR
--    (pipeline/src/pipeline/ocr.py). source_document records which documents had their
--    Lampiran 1 read that way, and with what engine; it is null where Lampiran 1 was read
--    from the PDF's text layer. operating_line.source_text and printed_total.source_text
--    hold the OCR reading of the line, as they hold the text layer's line in other years.
alter table source_document add column operating_ocr_engine text;
comment on column source_document.operating_ocr_engine is
  'Lampiran 1 was read by OCR with this engine (FY2020); null when it was read from the text layer.';

-- 2. Lampiran 3 (COVID-19 Fund) for FY2020 prints a "Tarik" (withdrawal) column between
--    Tambahan and Virement: allocation + supplementary + withdrawal + virement = revised.
--    Other years print no such column and store zero.
alter table covid_fund_line add column withdrawal_sen bigint not null default 0;
alter table covid_fund_total add column withdrawal_sen bigint not null default 0;
comment on column covid_fund_line.withdrawal_sen is 'Tarik (FY2020 only; zero where not printed), negative as printed.';

-- covid_fund_line_check2 is the unnamed allocation + supplementary + virement = revised check.
alter table covid_fund_line drop constraint covid_fund_line_check2;
alter table covid_fund_line add constraint covid_fund_line_revised_check
  check (allocation_sen + supplementary_sen + withdrawal_sen + virement_sen = revised_sen);

create or replace view covid_fund_reconciliation as
select t.document_id, t.fiscal_year, t.pdf_page,
       count(l.code) as line_count,
       coalesce((t.ceiling_sen, t.spent_prior_sen, t.allocation_sen, t.supplementary_sen, t.virement_sen,
                 t.revised_sen, t.actual_sen, t.spent_to_date_sen, t.withdrawal_sen)
                  = (sum(l.ceiling_sen), sum(l.spent_prior_sen), sum(l.allocation_sen), sum(l.supplementary_sen),
                     sum(l.virement_sen), sum(l.revised_sen), sum(l.actual_sen), sum(l.spent_to_date_sen),
                     sum(l.withdrawal_sen)),
                false) as matches,
       t.actual_sen - coalesce(sum(l.actual_sen), 0) as actual_diff_sen,
       t.revised_sen - coalesce(sum(l.revised_sen), 0) as revised_diff_sen,
       t.spent_to_date_sen - coalesce(sum(l.spent_to_date_sen), 0) as spent_to_date_diff_sen,
       t.withdrawal_sen - coalesce(sum(l.withdrawal_sen), 0) as withdrawal_diff_sen
from covid_fund_total t
left join covid_fund_line l on l.document_id = t.document_id
group by t.document_id;
