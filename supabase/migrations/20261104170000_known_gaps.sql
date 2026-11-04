-- A Lampiran 1 page missing from the published PDF (FY2019: between PDF pp. 89 and 90).
-- Every row that is printed is loaded. A printed total whose rows are partly on the missing
-- page (the gap's programmes, their votes, their section and the statement) cannot be
-- recomputed from its rows: the reconciliation view reports it with result 'missing_page'
-- and the gap's id, and matches is null. The pipeline checks those totals against the
-- totals printed below them instead (pipeline/src/pipeline/gap.py).
create table known_gap (
  id               text primary key,
  document_id      text not null references source_document,
  fiscal_year      smallint not null,
  after_pdf_page   integer not null check (after_pdf_page > 0),  -- the last page printed before the gap
  before_pdf_page  integer not null check (before_pdf_page > after_pdf_page),
  evidence         text not null
);

create table known_gap_scope (
  gap_id           text not null references known_gap on delete cascade,
  vote_code        text not null,
  programme_code   char(6) not null,
  printed_before   char(6),  -- the last activity printed before the gap, if the gap is inside the programme
  printed_after    char(6),  -- the first activity printed after it
  primary key (gap_id, vote_code, programme_code)
);

alter table known_gap enable row level security;
alter table known_gap_scope enable row level security;
create policy public_read on known_gap for select using (true);
create policy public_read on known_gap_scope for select using (true);

-- One row per programme a missing page cuts into, for a note on the site's pages.
create view operating_gap as
select g.fiscal_year, s.vote_code, s.programme_code,
       s.printed_before as last_activity_before_gap,
       s.printed_after  as first_activity_after_gap,
       g.after_pdf_page, g.before_pdf_page, g.id as gap_id, g.document_id, g.evidence
from known_gap g
join known_gap_scope s on s.gap_id = g.id;

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
  and s.section        is not distinct from t.section
  and s.vote_code      is not distinct from t.vote_code
  and s.programme_code is not distinct from t.programme_code
  and s.activity_code  is not distinct from t.activity_code
  and s.object_code    is not distinct from t.object_code
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
