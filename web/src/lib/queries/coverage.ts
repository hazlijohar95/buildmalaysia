import sql from "@/lib/db";
import { getLoadedYears } from "@/lib/years";

export interface Coverage {
  statements: number;
  budgetBooks: number;
  years: { first: number; last: number } | null; // null before any statement is loaded
  lineItems: number; // operating lines and development projects read from the statements
  totalsChecked: number; // printed totals recomputed from their rows, in the statements and the budget books
}

/**
 * How much of the public record is loaded, counted live from the database.
 * A load commits only when every printed total reconciles, and each reconciliation view has one row per printed
 * total, so the totals tables are counted directly rather than recomputing the views.
 */
export async function getCoverage(): Promise<Coverage> {
  const [[counts], years] = await Promise.all([
    sql<{ statements: string; budget_books: string; line_items: string; totals_checked: string }[]>`
      select
        (select count(*) from source_document d
          where not exists (select 1 from budget_document b where b.document_id = d.id)) as statements,
        (select count(*) from budget_document) as budget_books,
        (select count(*) from operating_line) + (select count(*) from development_project) as line_items,
        (select count(*) from printed_total) + (select count(*) from development_printed_total)
          + (select count(*) from budget_operating_total) + (select count(*) from budget_development_total)
          as totals_checked
    `,
    getLoadedYears(),
  ]);
  return {
    statements: Number(counts.statements),
    budgetBooks: Number(counts.budget_books),
    years: years.length > 0 ? { first: years[years.length - 1], last: years[0] } : null,
    lineItems: Number(counts.line_items),
    totalsChecked: Number(counts.totals_checked),
  };
}
