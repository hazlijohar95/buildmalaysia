-- Budget 2025 rounds each project's actual spending to the ringgit and its group and vote
-- totals from the exact sums, so those totals differ from the printed projects by RM1-2 in
-- that column (P.23 2023 actual: +RM2). The actual column may differ by the rounding of
-- n projects, 50 sen x (n + 1); total cost, revised and the budget year's estimates are
-- whole ringgit and must add exactly.
create or replace view budget_development_reconciliation as
select t.id as printed_total_id, t.document_id, t.vote_code, t.group_ordinal, t.pdf_page, t.book_page,
       coalesce(s.project_count, 0) as project_count,
       coalesce(
         (t.total_cost_sen, t.revised_sen, t.estimate_direct_sen, t.estimate_loan_sen)
           = (s.total_cost_sen, s.revised_sen, s.estimate_direct_sen, s.estimate_loan_sen)
         and abs(t.actual_prior_sen - s.actual_prior_sen) <= 50 * (s.project_count + 1),
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
