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
    }[]
  >`
    select d.fiscal_year, d.title, d.url, d.sha256,
           (select count(*) from reconciliation r where r.document_id = d.id) as operating_total,
           (select count(*) from reconciliation r where r.document_id = d.id and r.matches) as operating_matched,
           (select count(*) from development_reconciliation r where r.document_id = d.id) as development_total,
           (select count(*) from development_reconciliation r where r.document_id = d.id and r.matches)
             as development_matched
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
