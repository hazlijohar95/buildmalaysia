import sql from "@/lib/db";
import type { SourceDocument } from "@/lib/sources";

/** Every loaded source document: the audited statements and the budget books. */
export async function getSourceDocuments(): Promise<SourceDocument[]> {
  const rows = await sql<
    {
      id: string;
      publisher: string;
      title: string;
      fiscal_year: number;
      budget_year: number | null;
      url: string;
      sha256: string;
      page_count: number;
      retrieved_at: string;
    }[]
  >`
    select d.id, d.publisher, d.title, d.fiscal_year, b.budget_year, d.url, d.sha256, d.page_count,
           to_char(d.retrieved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as retrieved_at
    from source_document d
    left join budget_document b on b.document_id = d.id
  `;
  return rows.map(({ fiscal_year, budget_year, page_count, retrieved_at, ...doc }) => ({
    ...doc,
    pageCount: page_count,
    retrievedAt: retrieved_at,
    ...(budget_year === null
      ? { kind: "statement", fiscalYear: fiscal_year }
      : { kind: "budget", budgetYear: budget_year }),
  }));
}
