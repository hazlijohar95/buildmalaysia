import type { APIRoute } from "astro";
import { ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { getFederalSpending } from "@/lib/queries/spending";
import { getLoadedYears } from "@/lib/years";

export const GET: APIRoute = async () => {
  const [year] = await getLoadedYears();
  const spending = year ? await getFederalSpending(year) : null;
  return ogImage({
    kicker: "buildmalaysia.com",
    title: "The facts about government spending",
    figure: spending ? formatSenCompact(spending.total_actual_sen) : undefined,
    note: `federal spending in ${year}, audited`,
  });
};
