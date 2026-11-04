import sql from "@/lib/db";
import { getMethodologyChecks } from "@/lib/queries/reconciliation";
import { getLoadedYears } from "@/lib/years";

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
  const [[counts], checks, years] = await Promise.all([
    sql<{ line_items: string }[]>`
      select (select count(*) from operating_line) + (select count(*) from development_project) as line_items
    `,
    getMethodologyChecks(),
    getLoadedYears(),
  ]);
  return {
    statements: checks.sources.length,
    budgetBooks: checks.budgets.length,
    firstYear: years.at(-1) ?? 0,
    lastYear: years[0] ?? 0,
    lineItems: Number(counts.line_items),
    totalsChecked:
      checks.sources.reduce((n, s) => n + s.operating_total + s.development_total, 0) +
      checks.budgets.reduce((n, b) => n + b.operating_total + b.development_total, 0),
  };
}
