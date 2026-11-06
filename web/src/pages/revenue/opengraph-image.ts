import type { APIRoute } from "astro";
import { ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { getRevenueHistory } from "@/lib/queries/revenue";

export const GET: APIRoute = async () => {
  const latest = (await getRevenueHistory()).at(-1);
  return ogImage({
    kicker: "Revenue",
    title: "Where the money comes from",
    figure: latest ? formatSenCompact(latest.total) : undefined,
    note: `federal revenue in ${latest?.year}`,
  });
};
