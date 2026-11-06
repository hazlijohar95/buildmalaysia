import type { APIRoute } from "astro";
import { ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { getFederalSpending } from "@/lib/queries/spending";
import { requireYear } from "@/lib/years";

export const GET: APIRoute = async ({ params }) => {
  const year = await requireYear(params.year ?? "");
  const spending = await getFederalSpending(year);
  return ogImage({
    kicker: "Spending",
    title: `Federal spending in ${year}`,
    figure: spending ? formatSenCompact(spending.total_actual_sen) : undefined,
    note: "from the audited Federal Government Financial Statements",
  });
};
