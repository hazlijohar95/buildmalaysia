import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { requireBudgetYear } from "@/lib/budgetYear";
import { getTabledBooks } from "@/lib/queries/budget";

export const alt = "The federal budget as tabled";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ budgetYear: string }> }) {
  const budgetYear = await requireBudgetYear((await params).budgetYear);
  const book = (await getTabledBooks()).find((b) => b.budget_year === budgetYear);
  return ogImage({
    kicker: "Budget",
    title: `Budget ${budgetYear}`,
    figure: book && book.grand_total_sen !== null ? formatSenCompact(book.grand_total_sen) : undefined,
    note: "as tabled in Parliament",
  });
}
