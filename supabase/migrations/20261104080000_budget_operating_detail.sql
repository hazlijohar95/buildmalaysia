-- Operating estimates per vote, programme, activity and object group from the MOF budget
-- book, with established posts (Bil. Jawatan). Budget 2027 prints the 2026 original
-- estimate and the 2027 estimate. Codes are the ones the JANM statements use, so an
-- activity's estimate can sit beside what was spent on it.

create table budget_heading (
  document_id     text not null references budget_document,
  vote_code       text not null check (vote_code ~ '^[TB]\.[0-9]{2}$'),
  code            char(6) not null check (code ~ '^[0-9]{4}00$'),
  programme_code  char(6) not null check (programme_code ~ '^[0-9]{2}0000$' and left(code, 2) = left(programme_code, 2)),
  name_ms         text not null,
  pdf_page        integer not null check (pdf_page > 0),
  book_page       integer not null check (book_page > 0),
  primary key (document_id, vote_code, code)
);

-- Leaves: activity x object group.
create table budget_operating_line (
  document_id         text not null,
  vote_code           text not null,
  programme_code      char(6) not null,
  activity_code       char(6) not null check (activity_code !~ '0000$'),
  object_code         char(5) not null references object_group,
  prior_estimate_sen  bigint not null,  -- the current year's original estimate (2026 in Budget 2027)
  estimate_sen        bigint not null,  -- the budget year's estimate (2027)
  prior_posts         integer check (prior_posts >= 0),
  posts               integer check (posts >= 0),
  pdf_page            integer not null check (pdf_page > 0),
  book_page           integer not null check (book_page > 0),
  source_text         text not null,
  primary key (document_id, vote_code, activity_code, object_code),
  foreign key (document_id, vote_code, activity_code) references budget_heading,
  check ((prior_posts is null) = (posts is null))
);

create type budget_total_scope as enum ('activity', 'programme', 'vote');

-- Every total the book prints: activity and programme rows, the object lines under a
-- programme, the detail table's JUMLAH, and the vote's object-group summary page.
create table budget_operating_total (
  id                  bigint generated always as identity primary key,
  document_id         text not null references budget_document,
  scope               budget_total_scope not null,
  vote_code           text not null,
  programme_code      char(6),
  activity_code       char(6),
  object_code         char(5) references object_group,
  prior_estimate_sen  bigint not null,
  estimate_sen        bigint not null,
  prior_posts         integer,
  posts               integer,
  pdf_page            integer not null check (pdf_page > 0),
  book_page           integer not null check (book_page > 0),
  source_text         text not null,
  check (case scope
    when 'activity'  then programme_code is not null and activity_code is not null and object_code is null
    when 'programme' then programme_code is not null and activity_code is null
    when 'vote'      then programme_code is null and activity_code is null
  end)
);

-- Recomputes each printed total from the leaves. Posts compare only where the total prints
-- them: activity and programme rows and the object summary page print none.
create view budget_operating_reconciliation as
with sums as (
  select document_id, vote_code, programme_code, activity_code, object_code,
         sum(prior_estimate_sen) as prior_estimate_sen, sum(estimate_sen) as estimate_sen,
         sum(prior_posts) as prior_posts, sum(posts) as posts, count(*) as line_count
  from budget_operating_line
  group by grouping sets (
    (document_id, vote_code, programme_code, activity_code),
    (document_id, vote_code, programme_code, object_code),
    (document_id, vote_code, programme_code),
    (document_id, vote_code, object_code),
    (document_id, vote_code)
  )
)
select t.id as printed_total_id, t.document_id, t.scope, t.vote_code, t.programme_code, t.activity_code,
       t.object_code, t.pdf_page, t.book_page,
       t.prior_estimate_sen - coalesce(s.prior_estimate_sen, 0) as prior_estimate_diff_sen,
       t.estimate_sen - coalesce(s.estimate_sen, 0) as estimate_diff_sen,
       t.prior_posts - coalesce(s.prior_posts, 0) as prior_posts_diff,
       t.posts - coalesce(s.posts, 0) as posts_diff,
       coalesce(s.line_count, 0) as line_count,
       coalesce(
         (t.prior_estimate_sen, t.estimate_sen) = (s.prior_estimate_sen, s.estimate_sen)
         and (t.prior_posts is null or t.prior_posts = coalesce(s.prior_posts, 0))
         and (t.posts is null or t.posts = coalesce(s.posts, 0)),
         false) as matches
from budget_operating_total t
left join sums s
  on  s.document_id = t.document_id
  and s.vote_code = t.vote_code
  and s.programme_code is not distinct from t.programme_code
  and s.activity_code  is not distinct from t.activity_code
  and s.object_code    is not distinct from t.object_code;

-- Each vote's detail total against the same vote in the book's summary pages.
create view budget_vote_consistency as
select t.document_id, t.vote_code,
       t.prior_estimate_sen, f26.total_sen as summary_prior_estimate_sen,
       t.estimate_sen, f27.total_sen as summary_estimate_sen,
       coalesce((t.prior_estimate_sen, t.estimate_sen) = (f26.total_sen, f27.total_sen), false) as matches
from budget_operating_total t
join budget_document d on d.document_id = t.document_id
left join budget_vote_figure f26
  on f26.document_id = t.document_id and f26.vote_code = t.vote_code and f26.basis = 'original_estimate'
left join budget_vote_figure f27
  on f27.document_id = t.document_id and f27.vote_code = t.vote_code and f27.basis = 'estimate'
where t.scope = 'vote' and t.object_code is null;

alter table budget_heading          enable row level security;
alter table budget_operating_line   enable row level security;
alter table budget_operating_total  enable row level security;
create policy public_read on budget_heading         for select using (true);
create policy public_read on budget_operating_line  for select using (true);
create policy public_read on budget_operating_total for select using (true);
