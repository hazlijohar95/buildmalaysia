import { notFound } from "next/navigation";
import sql from "@/lib/db";

/** Fiscal years with both statements loaded, newest first. */
export async function getLoadedYears(): Promise<number[]> {
  const rows = await sql<{ fiscal_year: number }[]>`
    select fiscal_year from federal_spending order by fiscal_year desc
  `;
  return rows.map((r) => r.fiscal_year);
}

/** The year in a route segment, or a 404 when it is not a loaded fiscal year. */
export async function requireYear(segment: string): Promise<number> {
  const year = /^\d{4}$/.test(segment) ? Number(segment) : NaN;
  if (!(await getLoadedYears()).includes(year)) notFound();
  return year;
}
