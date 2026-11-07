-- Follows each Lampiran 2 project from one fiscal year to the next. The statements print
-- no identifier that spans years: a project code is local to its vote (00107 or 97000
-- recur in many votes), names drift, and votes are renumbered when ministries are
-- reorganised. A row in year Y is linked to a row in year Y + 1 with the same code when:
--   * both are in the same vote, and the next year's plan spending to the prior year
--     equals this year's plan spending to date and is not zero, or their names are equal
--     once case and whitespace are ignored. Zero equals zero for nearly every project in a
--     plan's first year, so it says nothing: FY2021 P.28 00600 "Penyelenggaraan Rangkaian
--     Jalan Raya di Pelabuhan Klang" and FY2022 P.28 00600 "Penyelidikan dan Pembangunan
--     Kejuruteraan" both print 0;
--   * they are in different votes, the row has no such successor in its own vote, the
--     names are equal and the cumulative figures agree (a move, e.g. P.64 to P.63 in 2019);
--   * or the next year's row merges two: FY2018 prints a project that changed ministry
--     twice, under the old vote (spending before the move) and the new one, and FY2019
--     prints one row whose spending to the prior year is exactly their sum. Both rows
--     link to it (merged).
-- A (year, vote, code) printed twice in its year is never linked, and neither is any row
-- that would get two successors, or two predecessors other than a merge.
create view development_project_link as
with project as (
  select fiscal_year, vote_code, code, pdf_page, line_no, plan_actual_prior_sen, plan_actual_to_date_sen,
         lower(btrim(regexp_replace(name_ms, '\s+', ' ', 'g'))) collate "C" as name_key
  from (
    -- Byte order: these keys are only compared for equality, and the default collation's sorts cost most of the time.
    select fiscal_year, vote_code collate "C" as vote_code, code::text collate "C" as code, pdf_page, line_no,
           plan_actual_prior_sen, plan_actual_to_date_sen, name_ms,
           count(*) over (partition by fiscal_year, vote_code collate "C", code::text collate "C") as printed
    from development_project
  ) p
  where printed = 1
),
pair as (
  select f.fiscal_year as from_year, f.vote_code as from_vote_code, f.code,
         t.vote_code as to_vote_code, f.plan_actual_to_date_sen as from_to_date_sen,
         t.plan_actual_prior_sen as to_prior_sen, f.vote_code <> t.vote_code as moved_vote,
         f.name_key = t.name_key as same_name
  from project f
  join project t on t.fiscal_year = f.fiscal_year + 1 and t.code = f.code
),
same_vote as (
  select * from pair
  where not moved_vote and ((from_to_date_sen = to_prior_sen and to_prior_sen <> 0) or same_name)
),
merge as (
  select main.from_year, main.from_vote_code as main_vote_code, partner.from_vote_code as partner_vote_code,
         main.code, main.to_vote_code
  from pair main
  join pair partner
    on partner.from_year = main.from_year and partner.code = main.code
   and partner.to_vote_code = main.to_vote_code and partner.moved_vote
  where not main.moved_vote
    and main.from_to_date_sen <> main.to_prior_sen
    and main.from_to_date_sen + partner.from_to_date_sen = main.to_prior_sen
),
single_merge as (
  select * from merge m
  where (select count(*) from merge o
         where (o.from_year, o.code, o.to_vote_code) = (m.from_year, m.code, m.to_vote_code)) = 1
),
candidate as (
  select from_year, from_vote_code, code, to_vote_code from same_vote
  union
  select from_year, main_vote_code, code, to_vote_code from single_merge
  union
  select from_year, partner_vote_code, code, to_vote_code from single_merge
  union
  select p.from_year, p.from_vote_code, p.code, p.to_vote_code from pair p
  where p.moved_vote and p.same_name and p.from_to_date_sen = p.to_prior_sen
    and not exists (
      select from same_vote s
      where (s.from_year, s.from_vote_code, s.code) = (p.from_year, p.from_vote_code, p.code)
    )
),
counted as (
  select c.*,
         count(*) over (partition by from_year, from_vote_code, code) as successors,
         count(*) over (partition by from_year, code, to_vote_code) as predecessors
  from candidate c
),
kept as (
  select c.* from counted c
  where c.successors = 1
    and (c.predecessors = 1
         or (c.predecessors = 2 and exists (
               select from single_merge m
               where (m.from_year, m.code, m.to_vote_code) = (c.from_year, c.code, c.to_vote_code)
                 and c.from_vote_code in (m.main_vote_code, m.partner_vote_code))))
)
select f.fiscal_year as from_year, f.vote_code as from_vote_code, f.code as from_code,
       f.pdf_page as from_pdf_page, f.line_no as from_line_no,
       t.fiscal_year as to_year, t.vote_code as to_vote_code, t.code as to_code,
       t.pdf_page as to_pdf_page, t.line_no as to_line_no,
       t.plan_actual_prior_sen = sum(f.plan_actual_to_date_sen) over (partition by k.from_year, k.code, k.to_vote_code)
         as cumulative_matches,
       f.vote_code <> t.vote_code as moved_vote,
       count(*) over (partition by k.from_year, k.code, k.to_vote_code) = 2 as merged
from kept k
join project f on (f.fiscal_year, f.vote_code, f.code) = (k.from_year, k.from_vote_code, k.code)
join project t on (t.fiscal_year, t.vote_code, t.code) = (k.from_year + 1, k.to_vote_code, k.code);

-- Every project row with the history it belongs to and its link from the previous year.
-- A row's key is fiscal_year/vote_code/code/pdf_page/line_no. Each row has at most one
-- successor, so following successors from any row ends at one row, the history's latest;
-- chain_id is that row's key. position numbers the history's years from 1 (two merged
-- rows share one). previous holds the keys of the rows linked into this one (empty for a
-- history's first year) and cumulative_matches whether this row's plan spending to the
-- prior year equals their spending to date (null without previous). A row in no link is
-- a history of one.
create view development_project_chain as
with recursive link as (
  select concat_ws('/', from_year, from_vote_code, from_code, from_pdf_page, from_line_no) collate "C" as from_key,
         concat_ws('/', to_year, to_vote_code, to_code, to_pdf_page, to_line_no) collate "C" as to_key,
         cumulative_matches
  from development_project_link
),
project as (
  select fiscal_year, vote_code, code, pdf_page, line_no,
         concat_ws('/', fiscal_year, vote_code, code, pdf_page, line_no) collate "C" as key
  from development_project
),
chain as (
  select p.key, p.key as chain_id
  from project p
  where not exists (select from link l where l.from_key = p.key)
  union all
  select l.from_key, c.chain_id
  from chain c
  join link l on l.to_key = c.key
),
incoming as (
  select to_key, array_agg(from_key order by from_key) as previous, bool_and(cumulative_matches) as cumulative_matches
  from link
  group by to_key
)
select p.fiscal_year, p.vote_code, p.code, p.pdf_page, p.line_no, p.key, c.chain_id,
       dense_rank() over (partition by c.chain_id order by p.fiscal_year)::integer as position,
       coalesce(i.previous, '{}') as previous, i.cumulative_matches
from chain c
join project p on p.key = c.key
left join incoming i on i.to_key = c.key;
