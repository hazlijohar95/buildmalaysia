// After CanadaSpends' federal spending page (MIT, Build Canada).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Band, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import RankedList from "@/components/RankedList";
import SpendingSankey from "@/components/Sankey/SpendingSankey";
import YearNav from "@/components/YearNav";
import { formatSen, formatSenCompact, parseSen } from "@/lib/money";
import { getSpendingShares } from "@/lib/queries/allocation";
import { getRevenueTotal, getRevenueTree } from "@/lib/queries/revenue";
import { getSpendingTree } from "@/lib/queries/sankey";
import { getFederalSpending } from "@/lib/queries/spending";
import { getLoadedYears } from "@/lib/years";

export const metadata: Metadata = { title: "Government spending" };

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function SpendingPage({ searchParams }: Props) {
  const years = await getLoadedYears();
  const requested = Number((await searchParams).year);
  const year = years.includes(requested) ? requested : years[0];
  if (year === undefined) notFound();

  const [spendingTree, revenueTree, spending, revenue, shares] = await Promise.all([
    getSpendingTree(year),
    getRevenueTree(year),
    getFederalSpending(year),
    getRevenueTotal(year),
    getSpendingShares(year),
  ]);
  if (!spending || !shares) notFound();
  const gap = revenue ? spending.total_actual_sen - revenue.actual_sen : null;

  return (
    <>
      <PageHeader
        eyebrow={`Federal spending · ${year}`}
        title="Where the money went"
        intro="How the federal government raised and spent public money, from the Accountant General's audited financial statements."
      >
        <YearNav year={year} years={years} hrefFor={(y) => `/spending?year=${y}`} />
      </PageHeader>

      <StatRow
        stats={[
          {
            label: `Spent in ${year}`,
            value: formatSenCompact(spending.total_actual_sen),
            title: formatSen(spending.total_actual_sen),
          },
          {
            label: "Operating",
            value: formatSenCompact(spending.operating_net_actual_sen),
            title: formatSen(spending.operating_net_actual_sen),
            sub: "salaries, supplies, grants, debt charges",
          },
          {
            label: "Development",
            value: formatSenCompact(spending.development_actual_sen),
            title: formatSen(spending.development_actual_sen),
            sub: "projects and assets",
          },
          ...(revenue && gap !== null
            ? [
                {
                  label: gap > 0 ? "Spent beyond revenue" : "Revenue left over",
                  value: formatSenCompact(parseSen(Math.abs(gap))),
                  title: formatSen(parseSen(Math.abs(gap))),
                  sub: `against ${formatSenCompact(revenue.actual_sen)} raised`,
                },
              ]
            : []),
        ]}
      />

      <section className="hidden xl:block border-b-2 border-foreground">
        <div className="px-8 py-6 md:px-16">
          <p className="mx-auto max-w-6xl text-charcoal-800">
            Money comes in on the left and goes out on the right. The hatched block is the gap between spending and
            revenue, which was borrowed. Hover a block for its share; click a name to open its page.
          </p>
        </div>
        <div className="sankey-chart-container relative overflow-hidden border-t-2 border-foreground min-h-[1040px]">
          <SpendingSankey spending={spendingTree} revenue={revenueTree} />
          <div className="absolute bottom-3 left-6 text-xs">
            <CitationLink
              year={year}
              docUrl={spending.doc_url}
              pdfPage={spending.operating_pdf_page}
              bookPage={spending.operating_book_page}
              className="text-charcoal-400"
            />
          </div>
        </div>
      </section>

      <Band>
        <H2>Who spent it</H2>
        <p className="mt-3 max-w-3xl text-charcoal-800">
          Every ministry, with its operating and development spending together, and the charges paid outside any
          ministry.
        </p>
        <RankedList
          className="mt-8"
          items={shares.items.map((s) => ({
            key: s.id,
            name: s.name,
            href: s.href,
            amount_sen: s.amount_sen,
            note: s.gloss ?? `${((s.amount_sen / shares.total_sen) * 100).toFixed(1)}% of spending`,
          }))}
        />
      </Band>

      <Band>
        <H2>How the total is counted</H2>
        <div className="mt-4 max-w-3xl space-y-3 text-charcoal-800">
          <p>
            Operating spending is the operating statement&apos;s total less the{" "}
            <span title={formatSen(spending.development_fund_transfer_sen)}>
              {formatSenCompact(spending.development_fund_transfer_sen)}
            </span>{" "}
            it transferred to the Development Fund, which pays for development spending and would otherwise be counted
            twice.
            {spending.covid_fund_actual_sen
              ? ` The total includes ${formatSenCompact(spending.covid_fund_actual_sen)} spent from the COVID-19 Fund.`
              : ""}
          </p>
          <p>
            Figures come from the Jabatan Akauntan Negara&apos;s <em>Penyata Kewangan Kerajaan Persekutuan {year}</em>:
            revenue from Note 5(a), spending from Lampiran 1 to 3. Every total the statement prints is recomputed from
            its line items before it is published. <Link href={`/${year}`}>Full breakdown for {year}</Link> ·{" "}
            <Link href="/methodology">How we check every number</Link>
          </p>
        </div>
      </Band>
    </>
  );
}
