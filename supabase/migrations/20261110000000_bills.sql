-- Bills before Parliament, and the Acts they became.
--
-- One `bill` per Dewan Rakyat bill number (D.R. n/yyyy), as parlimen.gov.my lists it, with one
-- `bill_house` row for each house that lists it: the status and dates that house prints. Bills
-- go to the Dewan Negara under the same number, so the two houses join on it exactly.
--
-- One `act` per Act the Attorney General's Chambers lists on Laws of Malaysia (lom.agc.gov.my):
-- principal Acts, amending Acts (A-numbers, published online from 2011) and repealed Acts. A bill
-- names no Act and an Act no bill, so `bill.act_no` is found by title (`act_link` 'title'), or
-- taken from the reviewed decisions in data/bills/act_links.csv (`act_link` 'file').
--
-- The rows come from a dated snapshot (`python -m pipeline fetch-bills`, then `load-bills`),
-- which replaces all four tables at once. Nothing here is a ringgit amount.

create type parliament_house as enum ('dewan_rakyat', 'dewan_negara');
create type act_kind as enum ('principal', 'amendment', 'repealed');

create table bill_snapshot (
  id            text primary key,           -- the snapshot's folder name, 'YYYY-MM-DD'
  first_at      timestamptz not null,       -- when the first and last listings were retrieved
  last_at       timestamptz not null,
  bills         integer not null,
  acts          integer not null
);

create table act (
  act_no        text primary key,           -- as LOM prints it: '887', 'A1801'
  kind          act_kind not null,
  title_ms      text not null,
  title_en      text,
  royal_assent  date,                       -- none for revised and repealed Acts
  published     date,                       -- gazetted
  in_force      date,                       -- the commencement date LOM prints, if one
  in_force_note text,                       -- or its remark: 'NOT YET IN FORCE', 'Lihat P.U. (B) …'
  repealed_by   text,                       -- repealed Acts: the repealing Act's number
  pdf_ms_url    text,
  pdf_en_url    text,
  source_url    text not null,              -- the LOM listing it was read from
  retrieved_at  timestamptz not null
);

create table bill (
  year          smallint not null,
  number        smallint not null,
  code          text generated always as ('D.R.' || number || '/' || year) stored,
  title         text not null,              -- as the Dewan Rakyat prints it, else the Dewan Negara
  title_truncated boolean not null,         -- the archive cuts titles at 100 characters
  act_no        text references act (act_no),
  act_link      text,                       -- how act_no was found: 'title' or 'file'
  act_link_note text,                       -- a file decision's evidence
  snapshot_id   text not null references bill_snapshot (id),
  primary key (year, number),
  check (number >= 1),
  -- A title match always finds an Act; a file decision may also record that a bill has none.
  check (act_link is null and act_no is null or act_link = 'title' and act_no is not null or act_link = 'file')
);

create table bill_house (
  year          smallint not null,
  number        smallint not null,
  house         parliament_house not null,
  title         text not null,
  status        text not null,              -- as printed: 'Lulus', 'Bacaan Kali Pertama', 'Ditarik Balik' …
  first_reading date,                       -- Bacaan Pertama Pada
  second_reading date,                      -- Bacaan Kedua Pada
  passed        date,                       -- Diluluskan Pada
  committee     date,                       -- Dirujuk JKPK Pada: sent to a special select committee
  failed        date,                       -- Tidak Mendapat Undi 2/3 Pada: short of a two-thirds majority
  tabled_by     text,                       -- the first Dibentang Oleh: who moved the bill
  passed_by     text,                       -- the second: who moved it at its passing
  pdf_url       text,
  listing       text not null,              -- 'current', or 'archive' for the yearly archive tree
  source_url    text not null,
  retrieved_at  timestamptz not null,
  primary key (year, number, house),
  foreign key (year, number) references bill (year, number) on delete cascade
);

-- Where each bill has got to, from both houses' rows and its Act. One stage per bill:
--   enacted              an Act was found for it
--   passed               both houses passed it (or the Dewan Negara did; a few older bills are listed there only)
--   passed_dewan_rakyat  the Dewan Rakyat passed it; the Dewan Negara has not, or does not list it
--   dewan_rakyat         read for the first time, or awaiting its second and third readings
--   committee            sent to a special select committee
--   withdrawn            Ditarik Balik
--   defeated             rejected, or short of the two-thirds a constitutional amendment needs
create view bill_progress as
select
  b.year, b.number, b.code, b.title, b.title_truncated, b.act_no, b.act_link,
  r.status as dr_status, n.status as dn_status,
  coalesce(r.first_reading, n.first_reading) as first_reading,
  coalesce(n.passed, r.passed) as last_passed,
  case
    when b.act_no is not null then 'enacted'
    when r.status = 'Ditarik Balik' or n.status = 'Ditarik Balik' then 'withdrawn'
    when r.status = 'Tolak' or r.status like 'Tidak Mendapat Undi%' or r.failed is not null then 'defeated'
    when n.status = 'Tolak' then 'defeated'
    when n.status = 'Lulus' or n.passed is not null then 'passed'
    when r.status = 'Lulus' or r.passed is not null then 'passed_dewan_rakyat'
    when r.status like 'Dirujuk%' or r.committee is not null then 'committee'
    else 'dewan_rakyat'
  end as stage,
  -- The date the bill last moved, for sorting the newest first.
  greatest(r.first_reading, r.second_reading, r.passed, r.committee, r.failed,
           n.first_reading, n.second_reading, n.passed, a.royal_assent) as last_moved
from bill b
left join bill_house r on r.year = b.year and r.number = b.number and r.house = 'dewan_rakyat'
left join bill_house n on n.year = b.year and n.number = b.number and n.house = 'dewan_negara'
left join act a on a.act_no = b.act_no;

create index bill_title_trgm on bill using gin (title extensions.gin_trgm_ops);
create index bill_act_no on bill (act_no);

alter table bill_snapshot enable row level security;
create policy public_read on bill_snapshot for select using (true);
alter table act enable row level security;
create policy public_read on act for select using (true);
alter table bill enable row level security;
create policy public_read on bill for select using (true);
alter table bill_house enable row level security;
create policy public_read on bill_house for select using (true);
