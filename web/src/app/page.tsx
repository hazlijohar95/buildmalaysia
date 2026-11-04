import type { Metadata } from "next";
import YearOverview from "@/components/YearOverview";
import { getLoadedYears } from "@/lib/years";

export const metadata: Metadata = { title: "Federal spending" };

export default async function HomePage() {
  const [latest] = await getLoadedYears();
  if (latest === undefined) return <p>No statements have been loaded yet.</p>;
  return <YearOverview year={latest} />;
}
