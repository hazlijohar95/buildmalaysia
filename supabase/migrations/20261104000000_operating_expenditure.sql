-- Federal operating expenditure (Perbelanjaan Mengurus), budget vs actual,
-- extracted from JANM's Penyata Kewangan Kerajaan Persekutuan, Lampiran 1.
--
-- Amounts are integer sen. Leaf facts live in operating_line (activity x object group).
-- Every total the source document prints is stored in printed_total, and the
-- reconciliation view recomputes each one from the leaves. A load is accepted only
-- when every printed total reconciles exactly.

create table source_document (
  id            text primary key,
  publisher     text not null,
  title         text not null,
  fiscal_year   smallint not null,
  url           text not null,
  sha256        char(64) not null,
  page_count    integer not null check (page_count > 0),
  retrieved_at  timestamptz not null
);

-- Perbelanjaan Tanggungan (charged, T.xx votes) vs Perbelanjaan Bekalan (supply, B.xx votes).
create type vote_section as enum ('charged', 'supply');

create table vote (
  fiscal_year  smallint not null,
  code         text not null check (code ~ '^[TB]\.[0-9]{2}$'),
  name_ms      text not null,
  section      vote_section not null,
  primary key (fiscal_year, code),
  check ((section = 'charged') = (code like 'T.%'))
);

create table programme (
  fiscal_year  smallint not null,
  vote_code    text not null,
  code         char(6) not null check (code ~ '^[0-9]{2}0000$'),
  name_ms      text not null,
  primary key (fiscal_year, vote_code, code),
  foreign key (fiscal_year, vote_code) references vote
);

create table activity (
  fiscal_year     smallint not null,
  vote_code       text not null,
  code            char(6) not null check (code ~ '^[0-9]{4}00$' and code !~ '0000$'),
  programme_code  char(6) not null check (left(code, 2) = left(programme_code, 2)),
  name_ms         text not null,
  primary key (fiscal_year, vote_code, code),
  foreign key (fiscal_year, vote_code, programme_code) references programme
);

create table object_group (
  code     char(5) primary key check (code ~ '^[1-5]0000$'),
  name_ms  text not null,
  name_en  text not null
);

insert into object_group (code, name_ms, name_en) values
  ('10000', 'Emolumen',                           'Emoluments'),
  ('20000', 'Perkhidmatan dan Bekalan',           'Supplies and Services'),
  ('30000', 'Aset',                               'Assets'),
  ('40000', 'Pemberian dan Kenaan Bayaran Tetap', 'Grants and Fixed Charges'),
  ('50000', 'Perbelanjaan-perbelanjaan Lain',     'Other Expenditures');

-- Column names follow the statement: Asal, Tambahan/(Kurangan), Viremen, Jumlah, Sebenar.
-- Varian and % Prestasi are derived, never stored; the parser checks the printed ones.
create table operating_line (
  fiscal_year        smallint not null,
  vote_code          text not null,
  activity_code      char(6) not null,
  object_code        char(5) not null references object_group,
  original_sen       bigint not null,
  supplementary_sen  bigint not null,
  virement_sen       bigint not null,
  revised_sen        bigint not null,
  actual_sen         bigint not null,
  document_id        text not null references source_document,
  pdf_page           integer not null check (pdf_page > 0),
  book_page          integer not null check (book_page > 0),
  source_text        text not null,
  primary key (fiscal_year, vote_code, activity_code, object_code),
  foreign key (fiscal_year, vote_code, activity_code) references activity,
  check (original_sen + supplementary_sen + virement_sen = revised_sen)
);

create type total_scope as enum ('activity', 'programme', 'vote', 'section', 'statement');

-- One row per total line printed in the source. object_code null means "all object groups".
create table printed_total (
  id                 bigint generated always as identity primary key,
  document_id        text not null references source_document,
  fiscal_year        smallint not null,
  scope              total_scope not null,
  section            vote_section,
  vote_code          text,
  programme_code     char(6),
  activity_code      char(6),
  object_code        char(5) references object_group,
  original_sen       bigint not null,
  supplementary_sen  bigint not null,
  virement_sen       bigint not null,
  revised_sen        bigint not null,
  actual_sen         bigint not null,
  footnote           text,
  pdf_page           integer not null check (pdf_page > 0),
  book_page          integer not null check (book_page > 0),
  source_text        text not null,
  check (case scope
    when 'activity'  then vote_code is not null and programme_code is not null and activity_code is not null and object_code is null
    when 'programme' then vote_code is not null and programme_code is not null and activity_code is null
    when 'vote'      then vote_code is not null and programme_code is null and activity_code is null
    when 'section'   then section is not null and vote_code is null
    when 'statement' then section is null and vote_code is null
  end)
);

create view operating_line_detail as
select l.*, v.section, a.programme_code, v.name_ms as vote_name_ms,
       p.name_ms as programme_name_ms, a.name_ms as activity_name_ms
from operating_line l
join vote v      on v.fiscal_year = l.fiscal_year and v.code = l.vote_code
join activity a  on a.fiscal_year = l.fiscal_year and a.vote_code = l.vote_code and a.code = l.activity_code
join programme p on p.fiscal_year = a.fiscal_year and p.vote_code = a.vote_code and p.code = a.programme_code;

create view reconciliation as
select t.id as printed_total_id, t.document_id, t.fiscal_year, t.scope, t.section, t.vote_code,
       t.programme_code, t.activity_code, t.object_code, t.pdf_page, t.footnote,
       t.original_sen      - s.original_sen      as original_diff_sen,
       t.supplementary_sen - s.supplementary_sen as supplementary_diff_sen,
       t.virement_sen      - s.virement_sen      as virement_diff_sen,
       t.revised_sen       - s.revised_sen       as revised_diff_sen,
       t.actual_sen        - s.actual_sen        as actual_diff_sen,
       s.line_count,
       (t.original_sen, t.supplementary_sen, t.virement_sen, t.revised_sen, t.actual_sen)
         = (s.original_sen, s.supplementary_sen, s.virement_sen, s.revised_sen, s.actual_sen)
         and s.line_count > 0 as matches
from printed_total t
cross join lateral (
  select coalesce(sum(d.original_sen), 0)      as original_sen,
         coalesce(sum(d.supplementary_sen), 0) as supplementary_sen,
         coalesce(sum(d.virement_sen), 0)      as virement_sen,
         coalesce(sum(d.revised_sen), 0)       as revised_sen,
         coalesce(sum(d.actual_sen), 0)        as actual_sen,
         count(*)                              as line_count
  from operating_line_detail d
  where d.document_id = t.document_id
    and (t.object_code    is null or d.object_code    = t.object_code)
    and (t.section        is null or d.section        = t.section)
    and (t.vote_code      is null or d.vote_code      = t.vote_code)
    and (t.programme_code is null or d.programme_code = t.programme_code)
    and (t.activity_code  is null or d.activity_code  = t.activity_code)
) s;

-- Public read-only access when hosted on Supabase.
alter table source_document enable row level security;
alter table vote            enable row level security;
alter table programme       enable row level security;
alter table activity        enable row level security;
alter table object_group    enable row level security;
alter table operating_line  enable row level security;
alter table printed_total   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['source_document','vote','programme','activity','object_group','operating_line','printed_total'] loop
    execute format('create policy public_read on %I for select using (true)', t);
  end loop;
end $$;
