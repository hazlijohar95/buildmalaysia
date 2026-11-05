import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { getFederalSpending } from "@/lib/queries/spending";
import { requireYear } from "@/lib/years";

export const alt = "Federal spending for the year";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ year: string }> }) {
  const year = await requireYear((await params).year);
  const spending = await getFederalSpending(year);
  return ogImage({
    kicker: "Spending",
    title: `Federal spending in ${year}`,
    figure: spending ? formatSenCompact(spending.total_actual_sen) : undefined,
    note: "from the audited Federal Government Financial Statements",
  });
}
