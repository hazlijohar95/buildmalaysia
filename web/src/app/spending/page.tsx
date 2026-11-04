// Layout adapted from CanadaSpends' federal spending page (MIT, Build Canada).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { H1, H2, InternalLink, Intro, P, Page, PageContent, Section } from "@/components/Layout";
import { StatCard, StatCardContainer } from "@/components/StatCard";
import SpendingSankey from "@/components/Sankey/SpendingSankey";
import YearNav from "@/components/YearNav";
import CitationLink from "@/components/CitationLink";
import { getSpendingTree, titleCase } from "@/lib/queries/sankey";
import { getRevenueTree } from "@/lib/queries/revenue";
import { getFederalSpending, getMinistrySpending } from "@/lib/queries/spending";
import { getLoadedYears } from "@/lib/years";
import { formatSen, formatSenCompact } from "@/lib/money";
import { slugify } from "@/lib/slug";

export const metadata: Metadata = { title: "Government spending" };

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function SpendingPage({ searchParams }: Props) {
  const years = await getLoadedYears();
  const requested = Number((await searchParams).year);
  const year = years.includes(requested) ? requested : years[0];
  if (year === undefined) notFound();

  const [spendingTree, revenue, spending, ministries] = await Promise.all([
    getSpendingTree(year),
    getRevenueTree(year),
    getFederalSpending(year),
    getMinistrySpending(year),
  ]);
  if (!spending) notFound();

  return (
    <Page>
      <PageContent>
        <Section>
          <H1>Government spending</H1>
          <Intro>
            How the Malaysian federal government raised and spent public money, from the Accountant General&apos;s
            audited financial statements.
          </Intro>
        </Section>
        <Section>
          <YearNav year={year} years={years} suffix="" hrefFor={(y) => `/spending?year=${y}`} />
          <H2>{year} government revenue and spending</H2>
          <P>
            Follow revenue in from the left and spending out to the right, or search for a ministry, tax or programme.
            {revenue
              ? " Where spending exceeds revenue, the hatched Shortfall block shows the difference. It is total spending less total revenue as the statement prints them, not the official fiscal deficit, which nets off some recoveries."
              : " Revenue for this year is not loaded yet, so the chart shows spending only."}
          </P>
        </Section>
      </PageContent>

      <div className="sankey-chart-container relative overflow-hidden border-y-2 border-foreground md:min-h-[776px]">
        <SpendingSankey spending={spendingTree} revenue={revenue} />
        <div className="absolute bottom-3 left-6 text-xs">
          <CitationLink
            year={year}
            docUrl={spending.doc_url}
            pdfPage={spending.operating_pdf_page}
            bookPage={spending.operating_book_page}
          />
        </div>
        <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm md:hidden">
          <span className="rounded-md bg-foreground px-3.5 py-2.5 text-sm font-semibold text-background">
            Open on a wider screen to explore the chart
          </span>
        </div>
      </div>

      <PageContent>
        <Section>
          <H2>Where the money went</H2>
          <StatCardContainer>
            <StatCard title={`In ${year},`} value={formatSenCompact(spending.total_actual_sen)} subtitle="was spent by the federal government" />
            <StatCard
              title="Of which"
              value={formatSenCompact(spending.operating_net_actual_sen)}
              subtitle="was operating spending: salaries, supplies, grants and debt service"
            />
            <StatCard title="and" value={formatSenCompact(spending.development_actual_sen)} subtitle="was development spending on projects" />
            {spending.covid_fund_actual_sen !== null && spending.covid_fund_actual_sen > 0 && (
              <StatCard title="plus" value={formatSenCompact(spending.covid_fund_actual_sen)} subtitle="from the COVID-19 Fund" />
            )}
          </StatCardContainer>
          <P className="mt-6 text-sm">
            Operating is the statement&apos;s total less the {formatSen(spending.development_fund_transfer_sen)} it
            transferred to the Development Fund, which pays for development spending and would otherwise be counted
            twice. <Link href={`/${year}`}>Full breakdown for {year}</Link>.
          </P>
        </Section>

        <Section>
          <H2>Ministries explained</H2>
          <div className="text-gray-600 leading-relaxed mb-4">
            {ministries
              .filter((m) => m.operating_vote_code || m.development_vote_code)
              .map((m) => (
                <div key={m.number} className="py-3 border-b border-gray-200 flex justify-between gap-4">
                  <InternalLink href={`/ministries/${slugify(m.name_ms)}`} className="font-medium text-gray-600">
                    {titleCase(m.name_ms)}
                  </InternalLink>
                  <span className="tabnum text-sm text-gray-500">{formatSenCompact(m.actual_sen)}</span>
                </div>
              ))}
          </div>
        </Section>

        <Section>
          <H2>Sources</H2>
          <P>
            All figures come from the Jabatan Akauntan Negara&apos;s <em>Penyata Kewangan Kerajaan Persekutuan</em>{" "}
            for {year}: revenue from Note 5(a), <em>Hasil mengikut penjenisan</em>, and spending from Lampiran 1 to
            3. Every total it prints is recomputed from its line items before we publish it, and the chart
            links each ministry to its own page. If you spot an error, the{" "}
            <InternalLink href="/methodology">methodology page</InternalLink> lists every source and check.
          </P>
        </Section>
      </PageContent>
    </Page>
  );
}
