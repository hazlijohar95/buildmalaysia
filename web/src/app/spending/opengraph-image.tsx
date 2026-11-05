import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { getFederalSpending } from "@/lib/queries/spending";
import { getLoadedYears } from "@/lib/years";

export const alt = "Where the money went: federal spending, year by year";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Read from the database per request, like the pages, so a build never needs one.
export const dynamic = "force-dynamic";

export default async function Image() {
  const [year] = await getLoadedYears();
  const spending = year ? await getFederalSpending(year) : null;
  return ogImage({
    kicker: "Spending",
    title: "Where the money went",
    figure: spending ? formatSenCompact(spending.total_actual_sen) : undefined,
    note: `federal spending in ${year}`,
  });
}
