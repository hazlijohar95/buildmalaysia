-- Ministries as bodies with dated names, vote holders and predecessor/successor links.
--
-- A vote number identifies a funding line, not an institution: numbers are reused
-- (B/P.15, B/P.33) and names change without the number changing. `body` is the
-- institution; `body_alias` every name it has carried, printed or gazetted;
-- `vote_holder` which body each vote code belonged to in each fiscal year; and
-- `lineage_edge` each machinery-of-government change between bodies. The rows come
-- from the curated files in data/lineage/ (`python -m pipeline load-lineage`), each
-- with a citation. None of them carries an amount.

create extension if not exists btree_gist;

create table citation (
  id         text primary key,
  url        text not null,
  title      text not null,
  locator    text,            -- 'P.U.(A) 20/2024 para 2(c)', 'PDF p39 note 4'
  quote      text,
  retrieved  date not null
);

create table body (
  id           text primary key,  -- stable, chosen once: 'kasa', 'petra'
  name_ms      text not null,     -- the name the site shows; must be one of its aliases
  established  date,              -- null when the body predates the loaded data
  dissolved    date
);

create type alias_origin as enum ('printed', 'gazetted', 'acronym');
create type lineage_confidence as enum ('high', 'medium', 'unverified');

-- The key two printings of one name share: case, spacing, '&' for 'DAN' and
-- spaces around hyphens ("YANG DI - PERTUA") vary between statements.
create function lineage_name_key(name text) returns text
language sql immutable strict parallel safe as $$
  select trim(regexp_replace(regexp_replace(upper(replace(name, '&', 'DAN')), '\s*-\s*', '-', 'g'), '\s+', ' ', 'g'))
$$;

create table body_alias (
  id           bigint generated always as identity primary key,
  body_id      text not null references body,
  name_ms      text not null,
  valid_from   date,   -- null: already in use when the loaded data starts
  valid_to     date,   -- null: still in use
  origin       alias_origin not null,
  confidence   lineage_confidence not null,
  citation_id  text not null references citation,
  check (valid_from is null or valid_to is null or valid_from <= valid_to)
);
create unique index body_alias_period on body_alias (body_id, lineage_name_key(name_ms), coalesce(valid_from, '-infinity'::date));

create table vote_holder (
  vote_code   text not null check (vote_code ~ '^[TBP]\.[0-9]{2}$'),
  body_id     text not null references body,
  from_year   smallint not null,
  to_year     smallint,  -- null: still held
  check (to_year is null or to_year >= from_year),
  primary key (vote_code, from_year),
  -- One holder per vote code and year.
  exclude using gist (vote_code with =, int4range(from_year, coalesce(to_year, 32767), '[]') with &&)
);

create table lineage_edge (
  id           text primary key,  -- the event key in data/lineage/edges.csv, e.g. 'E4-kasa'
  predecessor  text not null references body,
  successor    text not null references body,
  effective    date not null,
  whole        boolean not null,  -- true: the entire predecessor became part of the successor
  functions    text not null,     -- what moved, as the sources name it; '' when whole
  confidence   lineage_confidence not null,
  citation_id  text not null references citation,
  check (predecessor <> successor)
);

-- Every printed vote name in the loaded statements and budget books, with the body that
-- held the vote that year and the problem, if any, that must be fixed in data/lineage/
-- before the load is accepted. A budget book is checked for its own year only: the
-- prior-year actuals it restates on a row may belong to another body (AP25 prints
-- KASA's 2022 actual on PETRA's B/P.33 row).
create view vote_lineage_check as
with printed as (
  select 'janm' as source, fiscal_year, code as vote_code, name_ms from vote
  union all
  select 'janm', fiscal_year, code, name_ms from development_vote
  union all
  select 'mof', d.budget_year, f.vote_code,
         -- "P.70" is the parser's heading for a vote the book names only on its own line.
         case when f.heading ~ '^[BPT]\.[0-9]+$'
              then coalesce(substring(f.source_text from '^[BPT]\.\s?[0-9]+\s+([^0-9(-]+)\s+[-(0-9]'), f.heading)
              else f.heading end
  from budget_vote_figure f
  join budget_document d on d.document_id = f.document_id
  where f.fiscal_year = d.budget_year
)
select p.source, p.fiscal_year, p.vote_code, p.name_ms, h.body_id,
       case
         when h.body_id is null then 'no vote_holder'
         when not exists (
           select 1 from body_alias a
           where a.body_id = h.body_id
             and lineage_name_key(a.name_ms) = lineage_name_key(p.name_ms)
             and coalesce(a.valid_from, '-infinity'::date) <= make_date(p.fiscal_year, 12, 31)
             and coalesce(a.valid_to, 'infinity'::date) >= make_date(p.fiscal_year, 1, 1)
         ) then 'no alias covering the year'
       end as problem
from printed p
left join vote_holder h
  on h.vote_code = p.vote_code and p.fiscal_year between h.from_year and coalesce(h.to_year, 32767);

-- ministry_spending now names the body behind each year's B/P pair. A `residual` year is
-- one printed with zero after the body was dissolved (P.29 FY2019-21, P.15 FY2021,
-- P.32 FY2023-25, P.33 FY2023): the number still appears, the ministry is gone.
create or replace view ministry_spending as
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
       coalesce(o.actual_sen, 0) + coalesce(d.actual_sen, 0) as actual_sen,
       b.id                                   as body_id,
       b.name_ms                              as body_name_ms,
       b.dissolved is not null
         and coalesce(o.fiscal_year, d.fiscal_year) > extract(year from b.dissolved) as residual
from operating o
full join development d
  on d.fiscal_year = o.fiscal_year and d.number = o.number
join vote_holder h
  on h.vote_code = coalesce(o.code, d.code)
 and coalesce(o.fiscal_year, d.fiscal_year) between h.from_year and coalesce(h.to_year, 32767)
join body b on b.id = h.body_id;
