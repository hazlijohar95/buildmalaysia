-- One-time setup of the hosted database's access, safe to rerun.
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -v web_password=<password> -f scripts/hosted-roles.sql
--
-- The site reads through web_reader, which can only select. Supabase's Data API
-- roles get nothing: the site never uses that API, and its default grants would
-- let anyone holding the project's anon key write to these tables.

select format('create role web_reader login password %L', :'web_password')
where not exists (select from pg_roles where rolname = 'web_reader') \gexec
alter role web_reader password :'web_password';

grant usage on schema public to web_reader;
grant select on all tables in schema public to web_reader;
alter default privileges for role postgres in schema public grant select on tables to web_reader;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
