import type { APIRoute } from "astro";
import { ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { requireBudgetYear } from "@/lib/budgetYear";
import { getTabledBooks } from "@/lib/queries/budget";

export const GET: APIRoute = async ({ params }) => {
  const budgetYear = await requireBudgetYear(params.budgetYear ?? "");
  const book = (await getTabledBooks()).find((b) => b.budget_year === budgetYear);
  return ogImage({
    kicker: "Budget",
    title: `Budget ${budgetYear}`,
    figure: book && book.grand_total_sen !== null ? formatSenCompact(book.grand_total_sen) : undefined,
    note: "as tabled in Parliament",
  });
};
