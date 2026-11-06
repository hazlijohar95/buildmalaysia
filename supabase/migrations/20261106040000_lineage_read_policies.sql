-- The lineage tables, like every other table, are readable by the site's role only through a policy.
alter table citation enable row level security;
create policy public_read on citation for select using (true);
alter table body enable row level security;
create policy public_read on body for select using (true);
alter table body_alias enable row level security;
create policy public_read on body_alias for select using (true);
alter table vote_holder enable row level security;
create policy public_read on vote_holder for select using (true);
alter table lineage_edge enable row level security;
create policy public_read on lineage_edge for select using (true);
