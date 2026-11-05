import { notFound } from "next/navigation";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { getMinistry } from "@/lib/queries/ministry";
import { titleCase } from "@/lib/queries/sankey";

export const alt = "What this ministry spent";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const ministry = await getMinistry((await params).slug);
  if (!ministry) notFound();
  const { body, latest } = ministry;
  return ogImage({
    kicker: "Ministries",
    title: titleCase(body.name_ms),
    figure: formatSenCompact(latest.actual_sen),
    note: `spent in ${latest.fiscal_year}, operating and development`,
  });
}
