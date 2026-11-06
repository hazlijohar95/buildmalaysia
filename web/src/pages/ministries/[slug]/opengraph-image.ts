import { notFound } from "@/lib/abort";
import type { APIRoute } from "astro";
import { ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { getMinistry } from "@/lib/queries/ministry";
import { titleCase } from "@/lib/queries/sankey";

export const GET: APIRoute = async ({ params }) => {
  const ministry = await getMinistry(params.slug ?? "");
  if (!ministry) notFound();
  const { body, latest } = ministry;
  return ogImage({
    kicker: "Ministries",
    title: titleCase(body.name_ms),
    figure: formatSenCompact(latest.actual_sen),
    note: `spent in ${latest.fiscal_year}, operating and development`,
  });
};
