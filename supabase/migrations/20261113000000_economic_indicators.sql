-- Economic indicators from data.gov.my's open API (CC BY 4.0).
--
-- One `indicator_dataset` per data.gov.my catalogue dataset the site reads (GDP, CPI inflation, the labour force,
-- federal finance and federal debt), with what its catalogue page says about it: title, publisher (DOSM, JANM, BNM),
-- field definitions and units, and where and when it was retrieved. One `indicator_value` per published figure:
-- the row's date, the string columns that name the row (`dims`, e.g. {"series": "abs"}), the numeric column's name
-- (`measure`, e.g. 'gdp') and the value exactly as the API printed it. Units are the dataset's: RM million, percent,
-- thousands of people, as each field's description says.
--
-- The rows come from a dated snapshot (`python -m pipeline fetch-indicators`, then `load-indicators`), which
-- replaces all three tables at once.

create table indicator_snapshot (
  id            text primary key,           -- the snapshot's folder name, 'YYYY-MM-DD'
  first_at      timestamptz not null,       -- when the first and last replies were retrieved
  last_at       timestamptz not null,
  datasets      integer not null,
  figures       integer not null
);

create table indicator_dataset (
  id            text primary key,           -- data.gov.my's catalogue id, e.g. 'gdp_gni_annual_nominal'
  title         text not null,              -- as the catalogue page prints it
  description   text not null,
  publisher     text[] not null,            -- the catalogue's data source: {'DOSM'}, {'JANM'}, {'BNM'}
  frequency     text not null,              -- 'YEARLY'
  data_as_of    text not null,              -- as the API's meta prints it, e.g. '2025'
  last_updated  text not null,              -- as printed, 'YYYY-MM-DD HH:MM'
  page_url      text not null,              -- https://data.gov.my/data-catalogue/<id>
  api_url       text not null,              -- the request the rows were read from
  csv_url       text,                       -- the catalogue's CSV download
  fields        jsonb not null,             -- [{name, title, description}] as the catalogue defines them
  retrieved_at  timestamptz not null,       -- the API reply
  page_retrieved_at timestamptz not null,   -- the catalogue page
  published_rows integer not null,          -- the API's row count, checked against the rows it returned
  snapshot_id   text not null references indicator_snapshot (id)
);

create table indicator_value (
  dataset_id    text not null references indicator_dataset (id) on delete cascade,
  date          date not null,              -- as published: '2025-01-01' is the year 2025
  dims          jsonb not null,             -- the row's string columns; '{}' for a dataset that has none
  measure       text not null,              -- the numeric column
  value         numeric,                    -- as printed; null where the API prints null
  primary key (dataset_id, measure, dims, date)
);

alter table indicator_snapshot enable row level security;
create policy public_read on indicator_snapshot for select using (true);
alter table indicator_dataset enable row level security;
create policy public_read on indicator_dataset for select using (true);
alter table indicator_value enable row level security;
create policy public_read on indicator_value for select using (true);
