-- Government procurement awards, as published on MyProcurement (Kementerian Kewangan).
--
-- One `procurement_notice` per published result: a tender, a quotation (sebut harga) or a direct
-- negotiation (rundingan terus), with the ministry and agency that procured it. One
-- `procurement_award` per winner the notice prints, with the accepted price (Harga Setuju
-- Terima, or Nilai Perolehan for a direct negotiation) in sen. The rows come from a dated snapshot
-- of every result page (`python -m pipeline fetch-procurement`, then `load-procurement`), which
-- replaces all three tables at once. Nothing here is joined to a budget vote: MyProcurement
-- prints no vote, programme or activity code.

create extension if not exists pg_trgm;

create type procurement_kind as enum ('tender', 'quotation', 'direct');

create table procurement_snapshot (
  id            text primary key,           -- the snapshot's folder name, 'YYYY-MM-DD'
  first_page_at timestamptz not null,       -- when the first and last pages were retrieved
  last_page_at  timestamptz not null,
  notices       integer not null,
  awards        integer not null
);

create table procurement_notice (
  kind          procurement_kind not null,
  id            bigint not null,            -- MyProcurement's own id, unique within a kind
  snapshot_id   text not null references procurement_snapshot (id),
  listing       text not null,              -- the listing it was read from: 'archive-results-tender'
  reference     text,                       -- No. Tender / No. Sebut Harga; none for a direct negotiation
  title         text not null,
  ministry      text not null,
  agency        text not null,
  category      text not null,              -- Kategori Perolehan as printed: Bekalan, Perkhidmatan, Kerja …
  result_date   date,                       -- Tarikh Keputusan; null where the site prints "Tiada Maklumat"
  shown_date    date not null,              -- Tarikh Paparan Keputusan, or Tarikh Permohonan (direct)
  -- The date to file a notice under: the decision date, since archived results are often re-displayed
  -- years later, unless none is printed or it falls after the result was published, which no decision can.
  dated         date generated always as (
                  case when result_date <= shown_date then result_date else shown_date end) stored,
  criterion     text,                       -- Kriteria Rundingan Terus, direct negotiations only
  total_sen     bigint,                     -- the sum of its awards' prices; null when none is printed
  source_url    text not null,              -- the notice's own page; a direct negotiation's listing
  retrieved_at  timestamptz not null,
  primary key (kind, id),
  check ((kind = 'direct') = (reference is null))
);

create table procurement_award (
  kind          procurement_kind not null,
  notice_id     bigint not null,
  ordinal       smallint not null,          -- the winner's number on the notice, from 1
  supplier      text not null,
  amount_sen    bigint,                     -- null where no price is printed
  primary key (kind, notice_id, ordinal),
  foreign key (kind, notice_id) references procurement_notice (kind, id) on delete cascade,
  check (ordinal >= 1)
);

create index procurement_notice_title_trgm on procurement_notice using gin (title gin_trgm_ops);
create index procurement_notice_agency_trgm on procurement_notice using gin (agency gin_trgm_ops);
create index procurement_notice_ministry on procurement_notice (ministry);
create index procurement_notice_dated on procurement_notice (dated desc);
create index procurement_award_supplier_trgm on procurement_award using gin (supplier gin_trgm_ops);
create index procurement_notice_total on procurement_notice (total_sen desc nulls last);

alter table procurement_snapshot enable row level security;
create policy public_read on procurement_snapshot for select using (true);
alter table procurement_notice enable row level security;
create policy public_read on procurement_notice for select using (true);
alter table procurement_award enable row level security;
create policy public_read on procurement_award for select using (true);
