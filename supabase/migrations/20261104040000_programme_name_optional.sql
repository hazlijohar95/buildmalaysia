-- A programme whose heading the statement does not print (FY2022 B.24 020000) has no
-- name. Null records that; the pipeline's PROGRAMME_HEADING_MISSING rule logs each case.
alter table programme alter column name_ms drop not null;
