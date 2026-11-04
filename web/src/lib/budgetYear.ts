import { notFound } from "next/navigation";
import { getBudgetYears } from "@/lib/queries/budget";

/** The budget year in a route segment, or a 404 when no budget book for it is loaded. */
export async function requireBudgetYear(segment: string): Promise<number> {
  const year = /^\d{4}$/.test(segment) ? Number(segment) : NaN;
  if (!(await getBudgetYears()).includes(year)) notFound();
  return year;
}

/** Column heading for one of the budget book's four columns. */
export function columnLabel(fiscalYear: number, basis: string): string {
  if (basis === "actual") return `Actual ${fiscalYear}`;
  if (basis === "original_estimate") return `Budget ${fiscalYear}`;
  return `Budget ${fiscalYear} as tabled`;
}
