-- FY2017's Note 5(a) prints "Cukai Langsung" and "Cukai Tak Langsung" as headings over their
-- items with no amounts of their own. Such a category keeps its row (its items reference it)
-- with null amounts, and revenue_reconciliation checks only the categories printed with
-- amounts; HASIL CUKAI's printed total still covers those items.
alter table revenue_total
  alter column original_estimate_sen drop not null,
  alter column revised_estimate_sen drop not null,
  alter column actual_sen drop not null,
  alter column prior_year_actual_sen drop not null,
  add constraint revenue_total_amounts_check check (
    (original_estimate_sen is null) = (actual_sen is null)
    and (revised_estimate_sen is null) = (actual_sen is null)
    and (prior_year_actual_sen is null) = (actual_sen is null)
    and (category not in ('revenue', 'tax', 'non_tax', 'non_revenue_receipts', 'federal_territory')
         or actual_sen is not null)
  );

create or replace view revenue_reconciliation as
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
) s
where t.actual_sen is not null;
