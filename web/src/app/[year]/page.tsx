import type { Metadata } from "next";
import YearOverview from "@/components/YearOverview";
import { requireYear } from "@/lib/years";

interface Props {
  params: Promise<{ year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Federal spending ${(await params).year}` };
}

export default async function YearPage({ params }: Props) {
  return <YearOverview year={await requireYear((await params).year)} />;
}
