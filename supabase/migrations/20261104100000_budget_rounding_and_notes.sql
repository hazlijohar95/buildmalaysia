-- Budget 2026 rounds every printed figure on its own, so a vote's two parts can sum to one
-- ringgit off its total in the actual columns (T.7 2024: 1,907,044 + 377,686 = 2,284,730,
-- printed 2,284,731; JANM 2,284,730.59). Actuals may differ by the rounding of three
-- figures, at most RM1.50; estimates are whole ringgit and must add exactly.
alter table budget_vote_figure drop constraint budget_vote_figure_check;
alter table budget_vote_figure add constraint budget_vote_figure_check check (case
  when vote_code like 'P.%' and vote_code <> 'P.70'
    then emoluments_sen is null and other_sen is null
     and (case when basis = 'actual' then abs(direct_sen + loan_sen - total_sen) <= 150
               else direct_sen + loan_sen = total_sen end)
  when vote_code = 'P.70'
    then direct_sen is null and loan_sen is null and emoluments_sen is null and other_sen is null
  else direct_sen is null and loan_sen is null
     and (case when basis = 'actual' then abs(emoluments_sen + other_sen - total_sen) <= 150
               else emoluments_sen + other_sen = total_sen end)
end);

alter table budget_total drop constraint budget_total_check;
alter table budget_total drop constraint budget_total_check1;
alter table budget_total drop constraint budget_total_check2;
-- The parser checks these lines against the vote figures with allowances for rounding;
-- estimates are checked exactly here.
alter table budget_total add check (basis = 'actual' or emoluments_sen + other_sen = operating_sen);
alter table budget_total add check (basis = 'actual' or direct_sen + loan_sen + contingency_sen = development_sen);
alter table budget_total add check (basis = 'actual' or operating_sen + development_sen = grand_total_sen);

-- A footnote on a vote's ministry heading, e.g. that it was renamed or took over another
-- ministry. The restated actuals follow the budget year's structure.
alter table budget_vote_figure add column note text;

-- A budget book's original estimate for the current year (Budget 2026's "Anggaran Asal
-- 2025") against the original estimate in that year's audited statement (JANM Lampiran 1,
-- Asal), per operating vote. Budget 2026 against FY2025: 53 of 53 votes equal. Below vote
-- level the later book restates the year in its own structure (the 2025 civil service pay
-- revision, an activity of its own in JANM, is spread across activities), so only votes
-- compare. Development is not compared: JANM's Lampiran 2 prints the year's revised
-- allocation, not the original estimate.
create view budget_original_check as
select f.document_id, f.vote_code, f.fiscal_year, f.total_sen as mof_sen, t.original_sen as janm_sen,
       f.total_sen - t.original_sen as diff_sen,
       f.total_sen = t.original_sen as matches
from budget_vote_figure f
join printed_total t
  on t.fiscal_year = f.fiscal_year and t.vote_code = f.vote_code and t.scope = 'vote' and t.object_code is null
where f.basis = 'original_estimate';
