import YearOverview from "@/components/YearOverview";
import { previews } from "@/lib/previews";
import type { Page, RouteContext } from "@/lib/route";
import { requireYear } from "@/lib/years";

export default async function yearPage({ params }: RouteContext): Promise<Page> {
  const year = await requireYear(params.year ?? "");
  return {
    head: {
      title: `Federal spending ${year}`,
      description: `What the Malaysian federal government actually spent in ${year}, from the audited federal financial statements. Every figure links to the page it was read from.`,
      og: previews.year(year),
    },
    body: <YearOverview year={year} />,
  };
}
