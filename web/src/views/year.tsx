import YearOverview from "@/components/YearOverview";
import { previews } from "@/lib/previews";
import type { Page, RouteContext } from "@/lib/route";
import { requireYear } from "@/lib/years";

export default async function yearPage({ params }: RouteContext): Promise<Page> {
  const year = await requireYear(params.year ?? "");
  return {
    head: { title: `Federal spending ${year}`, og: previews.year(year) },
    body: <YearOverview year={year} />,
  };
}
