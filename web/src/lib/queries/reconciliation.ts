import sql from "@/lib/db";

export interface SourceCheck {
  fiscal_year: number;
  title: string;
  url: string;
  sha256: string;
  operating_total: number;
  operating_matched: number;
  development_total: number;
  development_matched: number;
  covid_matches: boolean | null; // null when the year has no COVID-19 Fund statement
}

/** Every loaded source document with the result of both reconciliation views, newest first. */
export async function getSourceChecks(): Promise<SourceCheck[]> {
  const rows = await sql<
    {
      fiscal_year: number;
      title: string;
      url: string;
      sha256: string;
      operating_total: string;
      operating_matched: string;
      development_total: string;
      development_matched: string;
      covid_matches: boolean | null;
    }[]
  >`
    select d.fiscal_year, d.title, d.url, d.sha256,
           (select count(*) from reconciliation r where r.document_id = d.id) as operating_total,
           (select count(*) from reconciliation r where r.document_id = d.id and r.matches) as operating_matched,
           (select count(*) from development_reconciliation r where r.document_id = d.id) as development_total,
           (select count(*) from development_reconciliation r where r.document_id = d.id and r.matches)
             as development_matched,
           (select c.matches from covid_fund_reconciliation c where c.document_id = d.id) as covid_matches
    from source_document d
    where not exists (select 1 from budget_document b where b.document_id = d.id)
    order by d.fiscal_year desc
  `;
  return rows.map((r) => ({
    ...r,
    operating_total: Number(r.operating_total),
    operating_matched: Number(r.operating_matched),
    development_total: Number(r.development_total),
    development_matched: Number(r.development_matched),
  }));
}

export interface PrintedMismatch {
  fiscal_year: number;
  scope: string;
  vote_code: string | null;
  programme_code: string | null;
  activity_code: string | null;
  pdf_page: number;
  book_page: number;
  doc_url: string;
  printed_actual_sen: string;
  actual_diff_sen: string;
}

/** Operating totals the statements print that disagree with their own rows (accepted only as known misprints). */
export async function getPrintedMismatches(): Promise<PrintedMismatch[]> {
  return sql<PrintedMismatch[]>`
    select r.fiscal_year, r.scope::text, r.vote_code, r.programme_code, r.activity_code, r.pdf_page,
           t.book_page, sd.url as doc_url, t.actual_sen::text as printed_actual_sen,
           r.actual_diff_sen::text
    from reconciliation r
    join printed_total t on t.id = r.printed_total_id
    join source_document sd on sd.id = r.document_id
    where not r.matches
    order by r.fiscal_year, r.printed_total_id
  `;
}

export interface BudgetCheck {
  budget_year: number;
  title: string;
  url: string;
  sha256: string;
  operating_total: number;
  operating_matched: number;
  development_total: number;
  development_matched: number;
  votes_consistent: number;
  votes: number;
  actual_figures: number;
  actual_agree: number;
  actual_worst_sen: number;
}

/** Each loaded budget book with the live result of its reconciliation views. */
export async function getBudgetChecks(): Promise<BudgetCheck[]> {
  const rows = await sql<Record<keyof BudgetCheck, string | number>[]>`
    select b.budget_year, sd.title, sd.url, sd.sha256,
      (select count(*) from budget_operating_reconciliation r where r.document_id = b.document_id) as operating_total,
      (select count(*) from budget_operating_reconciliation r where r.document_id = b.document_id and r.matches)
        as operating_matched,
      (select count(*) from budget_development_reconciliation r where r.document_id = b.document_id) as development_total,
      (select count(*) from budget_development_reconciliation r where r.document_id = b.document_id and r.matches)
        as development_matched,
      (select count(*) filter (where c.matches) from budget_vote_consistency c where c.document_id = b.document_id)
        + (select count(*) filter (where c.matches) from budget_development_consistency c where c.document_id = b.document_id)
        as votes_consistent,
      (select count(*) from budget_vote_consistency c where c.document_id = b.document_id)
        + (select count(*) from budget_development_consistency c where c.document_id = b.document_id) as votes,
      (select count(*) from budget_actual_check c where c.document_id = b.document_id) as actual_figures,
      (select count(*) from budget_actual_check c where c.document_id = b.document_id
        and c.result in ('matches', 'rounding')) as actual_agree,
      (select coalesce(max(abs(c.diff_sen)), 0) from budget_actual_check c where c.document_id = b.document_id)
        as actual_worst_sen
    from budget_document b join source_document sd on sd.id = b.document_id
    order by b.budget_year desc
  `;
  return rows.map((r) => ({
    budget_year: Number(r.budget_year),
    title: String(r.title),
    url: String(r.url),
    sha256: String(r.sha256),
    operating_total: Number(r.operating_total),
    operating_matched: Number(r.operating_matched),
    development_total: Number(r.development_total),
    development_matched: Number(r.development_matched),
    votes_consistent: Number(r.votes_consistent),
    votes: Number(r.votes),
    actual_figures: Number(r.actual_figures),
    actual_agree: Number(r.actual_agree),
    actual_worst_sen: Number(r.actual_worst_sen),
  }));
}
