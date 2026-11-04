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
