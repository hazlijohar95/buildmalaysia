import sql from "@/lib/db";
import { getMethodologyChecks } from "@/lib/queries/reconciliation";

export interface Coverage {
  statements: number;
  budgetBooks: number;
  firstYear: number;
  lastYear: number;
  lineItems: number; // operating lines and development projects read from the statements
  totalsChecked: number; // printed totals recomputed from their rows, in the statements and the budget books
}

/** How much of the public record is loaded, counted live from the database. */
export async function getCoverage(): Promise<Coverage> {
  const [[counts], checks] = await Promise.all([
    sql<{ first_year: number; last_year: number; line_items: string }[]>`
      select (select min(fiscal_year) from federal_spending) as first_year,
             (select max(fiscal_year) from federal_spending) as last_year,
             (select count(*) from operating_line) + (select count(*) from development_project) as line_items
    `,
    getMethodologyChecks(),
  ]);
  return {
    statements: checks.sources.length,
    budgetBooks: checks.budgets.length,
    firstYear: counts.first_year,
    lastYear: counts.last_year,
    lineItems: Number(counts.line_items),
    totalsChecked:
      checks.sources.reduce((n, s) => n + s.operating_total + s.development_total, 0) +
      checks.budgets.reduce((n, b) => n + b.operating_total + b.development_total, 0),
  };
}
