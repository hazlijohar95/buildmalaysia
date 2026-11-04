import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TaxCalculator from "@/components/tax/TaxCalculator";
import { getSpendingShares } from "@/lib/queries/allocation";
import { getLoadedYears } from "@/lib/years";

export const metadata: Metadata = {
  title: "Where your taxes go",
  description: "Enter your income to see your Malaysian income tax and how the federal government spent it, ministry by ministry.",
};

interface Props {
  searchParams: Promise<{ income?: string; epf?: string; other?: string }>;
}

const amount = (text: string | undefined, fallback: number) => {
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? Math.round(n) : fallback;
};

export default async function TaxPage({ searchParams }: Props) {
  const [[year], params] = await Promise.all([getLoadedYears(), searchParams]);
  if (year === undefined) notFound();
  const spending = await getSpendingShares(year);
  if (!spending) notFound();
  return (
    <TaxCalculator
      year={year}
      totalSpentSen={spending.total_sen}
      shares={spending.items}
      initial={{
        income: amount(params.income, 60_000),
        epf: params.epf !== "0",
        otherReliefs: amount(params.other, 0),
      }}
    />
  );
}
