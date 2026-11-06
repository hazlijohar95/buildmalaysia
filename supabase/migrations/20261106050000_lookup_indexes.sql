-- Indexes for the lookups every page makes. The totals tables had only their
-- surrogate keys, so each lookup by year, scope and vote read the whole table:
-- federal_spending, which the layout reads on every page, scanned
-- printed_total's 24,000 rows once per fiscal year, and the fastest-growth
-- finding on the home page took most of a second.
create index printed_total_year_scope on printed_total (fiscal_year, scope, vote_code, programme_code);
create index printed_total_document_scope on printed_total (document_id, scope);
create index development_printed_total_year_scope on development_printed_total (fiscal_year, scope, vote_code);
create index budget_operating_total_vote on budget_operating_total (document_id, vote_code);
