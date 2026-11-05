-- Match printed totals to their sums with plain equality on the key columns.
-- `is not distinct from` cannot be a join key, so Postgres joined on document_id
-- alone and filtered about 59 million pairs: over 20 seconds on the hosted
-- database. Coalescing NULL to '' keeps the same NULL-matches-NULL behaviour
-- (no key column holds an empty string) and lets the join sort or hash on the
-- full key. The view's rows are unchanged.
create or replace view reconciliation as
with sums as (
  select document_id, section, vote_code, programme_code, activity_code, object_code,
         sum(original_sen)      as original_sen,
         sum(supplementary_sen) as supplementary_sen,
         sum(virement_sen)      as virement_sen,
         sum(revised_sen)       as revised_sen,
         sum(actual_sen)        as actual_sen,
         count(*)               as line_count
  from operating_line_detail
  group by grouping sets (
    (document_id, vote_code, programme_code, activity_code),
    (document_id, vote_code, programme_code, object_code),
    (document_id, vote_code, programme_code),
    (document_id, vote_code, object_code),
    (document_id, vote_code),
    (document_id, section, object_code),
    (document_id, section),
    (document_id, object_code),
    (document_id)
  )
)
select t.id as printed_total_id, t.document_id, t.fiscal_year, t.scope, t.section, t.vote_code,
       t.programme_code, t.activity_code, t.object_code, t.pdf_page, t.footnote,
       t.original_sen      - coalesce(s.original_sen, 0)      as original_diff_sen,
       t.supplementary_sen - coalesce(s.supplementary_sen, 0) as supplementary_diff_sen,
       t.virement_sen      - coalesce(s.virement_sen, 0)      as virement_diff_sen,
       t.revised_sen       - coalesce(s.revised_sen, 0)       as revised_diff_sen,
       t.actual_sen        - coalesce(s.actual_sen, 0)        as actual_diff_sen,
       coalesce(s.line_count, 0) as line_count,
       case when g.gap_id is null then
         s.line_count is not null
         and (t.original_sen, t.supplementary_sen, t.virement_sen, t.revised_sen, t.actual_sen)
             is not distinct from (s.original_sen, s.supplementary_sen, s.virement_sen, s.revised_sen, s.actual_sen)
       end as matches,
       case
         when g.gap_id is not null then 'missing_page'
         when s.line_count is not null
          and (t.original_sen, t.supplementary_sen, t.virement_sen, t.revised_sen, t.actual_sen)
              is not distinct from (s.original_sen, s.supplementary_sen, s.virement_sen, s.revised_sen, s.actual_sen)
           then 'matches'
         else 'differs'
       end as result,
       g.gap_id
from printed_total t
left join sums s
  on  s.document_id = t.document_id
  and coalesce(s.section::text, '')        = coalesce(t.section::text, '')
  and coalesce(s.vote_code, '')            = coalesce(t.vote_code, '')
  and coalesce(s.programme_code::text, '') = coalesce(t.programme_code::text, '')
  and coalesce(s.activity_code::text, '')  = coalesce(t.activity_code::text, '')
  and coalesce(s.object_code::text, '')    = coalesce(t.object_code::text, '')
left join lateral (
  select min(k.gap_id) as gap_id
  from known_gap kg
  join known_gap_scope k on k.gap_id = kg.id
  join vote v on v.fiscal_year = kg.fiscal_year and v.code = k.vote_code
  where kg.document_id = t.document_id
    and (t.scope = 'statement'
         or (t.scope = 'section' and t.section = v.section)
         or (t.scope = 'vote' and t.vote_code = k.vote_code)
         or (t.scope = 'programme' and t.vote_code = k.vote_code and t.programme_code = k.programme_code))
) g on true;
