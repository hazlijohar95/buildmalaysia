// After CanadaSpends' federal spending page (MIT, Build Canada).
// The SpendingSankey island is composed in src/pages/spending/index.astro using client:only="react".
import { notFound } from "@/lib/abort";
import { Band, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Loader } from "@/components/brand/Loader";
import RankedList from "@/components/RankedList";
import YearNav from "@/components/YearNav";
import { formatSen, formatSenCompact, parseSen } from "@/lib/money";
import { getSpendingShares } from "@/lib/queries/allocation";
import { getRevenueTotal, getRevenueTree } from "@/lib/queries/revenue";
import { getSpendingTree } from "@/lib/queries/sankey";
import { type FederalSpending, getFederalSpending } from "@/lib/queries/spending";
import { getLoadedYears } from "@/lib/years";
import type { SankeyNode } from "@/components/Sankey/SankeyChartD3";
import { type Sen } from "@/lib/money";
import type { ReactNode } from "react";

export interface SpendingPageData {
  year: number;
  years: number[];
  spendingTree: SankeyNode;
  revenueTree: SankeyNode | null;
  spending: FederalSpending;
  revenue: { actual_sen: Sen } | null;
  shares: NonNullable<Awaited<ReturnType<typeof getSpendingShares>>>;
  gap: number | null;
}

export async function loadSpendingData(yearParam: string | null): Promise<SpendingPageData> {
  const years = await getLoadedYears();
  const requested = Number(yearParam ?? undefined);
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
  return { year, years, spendingTree, revenueTree, spending, revenue, shares, gap };
}

/** Static top: PageHeader + StatRow */
export function SpendingTop({ year, years, spending, revenue, gap }: SpendingPageData): ReactNode {
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
    </>
  );
}

/**
 * The section shell around the Sankey island: the outer section, the blurb paragraph, and the chart
 * container div. Rendered as server-side React (no client:*) so it emits clean HTML with no
 * data-astro-source-file attributes. The island is passed as children via Astro's slot mechanism.
 */
export function SpendingSankeySection({
  citation,
  children,
}: {
  citation: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return (
    <section className="hidden xl:block border-b-2 border-foreground">
      <div className="px-8 py-6 md:px-16">
        <p className="mx-auto max-w-6xl text-charcoal-800">
          Money comes in on the left and goes out on the right. The hatched block is the gap between spending and
          revenue, which was borrowed. Select a name to open its page.
        </p>
      </div>
      <div className="sankey-chart-container relative overflow-hidden border-t-2 border-foreground min-h-[1040px]">
        {children}
        {citation}
      </div>
    </section>
  );
}

/** The placeholder shown until the client-only chart mounts. */
export function SpendingSankeyFallback({ revenueTree }: Pick<SpendingPageData, "revenueTree">): ReactNode {
  return (
    <div className={`sankey-chart-container ${revenueTree ? "" : "spending-only"}`}>
      <div className="grid min-h-[320px] place-items-center">
        <Loader size="md" label="Drawing the chart" delayed />
      </div>
    </div>
  );
}

/** The CitationLink overlay inside the sankey container. */
export function SpendingCitation({ year, spending }: Pick<SpendingPageData, "year" | "spending">): ReactNode {
  return (
    <div className="absolute bottom-3 left-6 text-xs">
      <CitationLink
        year={year}
        docUrl={spending.doc_url}
        pdfPage={spending.operating_pdf_page}
        bookPage={spending.operating_book_page}
        className="text-charcoal-300"
      />
    </div>
  );
}

/** Static bottom: who-spent-it + how-counted bands. */
export function SpendingBottom({ year, spending, shares }: SpendingPageData): ReactNode {
  return (
    <>
      <Band>
        <H2>Who spent it</H2>
        <p className="mt-3 max-w-xl text-charcoal-800">
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
        <div className="mt-4 max-w-xl space-y-3 text-charcoal-800">
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
            its line items before it is published. <a href={`/${year}`}>Full breakdown for {year}</a> ·{" "}
            <a href="/methodology">How we check every number</a>
          </p>
        </div>
      </Band>
    </>
  );
}
