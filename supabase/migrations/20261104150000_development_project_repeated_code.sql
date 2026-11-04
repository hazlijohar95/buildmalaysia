-- FY2018 Lampiran 2 prints two different projects of P.21 with the same code, 90700:
-- "Majlis Latihan Pertanian Kebangsaan (NATC)" under Ibu Pejabat and "Latihan Pertanian
-- Kebangsaan" under Perikanan (PDF p224), each with its own amounts. Both are rows of the
-- statement, so a project is keyed by its code and the line that prints it. The pipeline
-- still rejects a repeated code unless the two rows sit in different groups under different
-- names (rule DUPLICATE_PROJECT_CODE).
alter table development_project
  drop constraint development_project_pkey,
  add primary key (fiscal_year, vote_code, code, pdf_page, line_no);
