import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/brand/og";
import { formatSenCompact } from "@/lib/money";
import { getRevenueHistory } from "@/lib/queries/revenue";

export const alt = "Where the government's money comes from";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Read from the database per request, like the pages, so a build never needs one.
export const dynamic = "force-dynamic";

export default async function Image() {
  const latest = (await getRevenueHistory()).at(-1);
  return ogImage({
    kicker: "Revenue",
    title: "Where the money comes from",
    figure: latest ? formatSenCompact(latest.total) : undefined,
    note: `federal revenue in ${latest?.year}`,
  });
}
