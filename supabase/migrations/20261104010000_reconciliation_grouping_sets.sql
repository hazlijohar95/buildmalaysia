-- Same result as the original reconciliation view, computed with one grouped pass over
-- the leaves instead of one scan per printed total. Each grouping set matches one
-- printed_total key pattern; columns outside a set roll up to null, which is how
-- printed_total spells "all" for that level.
drop view reconciliation;

create view reconciliation as
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
       coalesce((t.original_sen, t.supplementary_sen, t.virement_sen, t.revised_sen, t.actual_sen)
                  = (s.original_sen, s.supplementary_sen, s.virement_sen, s.revised_sen, s.actual_sen),
                false) as matches
from printed_total t
left join sums s
  on  s.document_id = t.document_id
  and s.section        is not distinct from t.section
  and s.vote_code      is not distinct from t.vote_code
  and s.programme_code is not distinct from t.programme_code
  and s.activity_code  is not distinct from t.activity_code
  and s.object_code    is not distinct from t.object_code;
