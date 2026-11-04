// Revenue by type from JANM's Note 5(a) "Hasil mengikut penjenisan", in the boxed buildcanada.com style.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Band, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import StackedBars from "@/components/StackedBars";
import YearNav from "@/components/YearNav";
import { formatSen, formatSenCompact, parseSen } from "@/lib/money";
import { REVENUE_CATEGORIES, getRevenueDetail, getRevenueHistory } from "@/lib/queries/revenue";
import { getFederalSpending } from "@/lib/queries/spending";
import { colours } from "@/styles/colours";

export const metadata: Metadata = {
  title: "Government revenue",
  description:
    "Where the Malaysian federal government's money comes from: taxes, non-tax revenue and other receipts, from the audited statements.",
};

const COLOR: Record<(typeof REVENUE_CATEGORIES)[number]["category"], string> = {
  direct_tax: colours.lake[800],
  indirect_tax: colours.lake[500],
  tax: colours.lake[700],
  non_tax: colours.copper[600],
  non_revenue_receipts: colours.charcoal[500],
  federal_territory: colours.pine[600],
};

const change = (now: number, before: number | null) =>
  before && before > 0 ? `${now >= before ? "+" : ""}${(((now - before) / before) * 100).toFixed(1)}%` : "–";

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function RevenuePage({ searchParams }: Props) {
  const history = await getRevenueHistory();
  const years = history.map((h) => h.year).sort((a, b) => b - a);
  const requested = Number((await searchParams).year);
  const year = years.includes(requested) ? requested : years[0];
  if (year === undefined) notFound();
  const [detail, spending] = await Promise.all([getRevenueDetail(year), getFederalSpending(year)]);
  const now = history.find((h) => h.year === year);
  if (!detail || !now) notFound();

  const before = history.find((h) => h.year === year - 1);
  const tax = now.byCategory.direct_tax + now.byCategory.indirect_tax + now.byCategory.tax;
  // Only the categories this year's note uses, and in the history only those any loaded year uses.
  const present = REVENUE_CATEGORIES.filter((c) => now.byCategory[c.category] > 0);
  const everPresent = REVENUE_CATEGORIES.filter((c) => history.some((h) => h.byCategory[c.category] > 0));
  const share = (v: number) => (v / now.total) * 100;
  const allItems = detail.groups.flatMap((g) => g.items);
  const biggest = [...allItems].sort((a, b) => b.actual_sen - a.actual_sen)[0];

  return (
    <>
      <PageHeader
        eyebrow="Federal revenue · Note 5(a)"
        title="Where the money comes from"
        intro="Every ringgit the federal government collected, by type, from the Accountant General's audited statements. Each category total is recomputed from its items before it is published."
      >
        <YearNav year={year} years={years} hrefFor={(y) => `/revenue?year=${y}`} />
      </PageHeader>

      <StatRow
        stats={[
          {
            label: `Revenue, ${year}`,
            value: formatSenCompact(now.total),
            title: formatSen(now.total),
            sub: before ? `${change(now.total, before.total)} on ${year - 1}` : undefined,
          },
          {
            label: "From taxes",
            value: `${share(tax).toFixed(1)}%`,
            sub: formatSenCompact(parseSen(tax)),
          },
          {
            label: "Largest single source",
            value: formatSenCompact(biggest.actual_sen),
            title: formatSen(biggest.actual_sen),
            sub: biggest.name_ms,
          },
          ...(spending
            ? [
                {
                  label: "Spending covered",
                  value: `${((now.total / spending.total_actual_sen) * 100).toFixed(1)}%`,
                  sub: `of ${formatSenCompact(spending.total_actual_sen)} spent; the rest was borrowed`,
                },
              ]
            : []),
        ]}
      />

      <Band>
        <H2>Revenue by type, {year}</H2>
        <div
          className="mt-8 flex h-14 w-full overflow-hidden border-2 border-foreground"
          role="img"
          aria-label={`Revenue by type, ${year}`}
        >
          {present.map((c) => (
            <div
              key={c.category}
              title={`${c.en}: ${formatSenCompact(now.byCategory[c.category])}`}
              style={{
                width: `${share(now.byCategory[c.category])}%`,
                background: COLOR[c.category],
              }}
              className="h-full border-r border-linen-50/60 last:border-r-0"
            />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-6">
          {present.map((c) => (
            <div key={c.category} className="border-t-[6px] pt-3" style={{ borderColor: COLOR[c.category] }}>
              <div className="font-display text-2xl font-semibold tabular-nums">
                {share(now.byCategory[c.category]).toFixed(1)}%
              </div>
              <div className="font-medium">{c.en}</div>
              <div className="text-sm text-charcoal-700 tabular-nums">
                {formatSenCompact(now.byCategory[c.category])}
              </div>
            </div>
          ))}
        </div>

        <H2 className="mt-16">Over the years</H2>
        <div className="mt-8">
          <StackedBars
            label="Federal revenue by type and year"
            series={everPresent.map((c) => ({
              label: c.en,
              color: COLOR[c.category],
            }))}
            rows={[...history]
              .sort((a, b) => a.year - b.year)
              .map((h) => ({
                year: h.year,
                values: everPresent.map((c) => h.byCategory[c.category]),
              }))}
          />
        </div>
      </Band>

      <Band wide>
        <H2>Every item, {year}</H2>
        <p className="mt-3 max-w-3xl text-charcoal-800">
          As printed in the statement, with the estimate as revised during the year and the previous year&apos;s actual
          from the same page. Item names change between years, so each year is shown on its own.
        </p>
        <div className="table-scroll mt-8">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Revised estimate</th>
                <th className="text-right">Actual</th>
                <th className="text-right">{year - 1}</th>
                <th className="text-right">Change</th>
                <th className="text-right">Share</th>
                <th>Source</th>
              </tr>
            </thead>
            {detail.groups.map((g) => {
              const en = REVENUE_CATEGORIES.find((c) => c.category === g.category)?.en;
              return (
                <tbody key={g.category}>
                  <tr className="bg-linen-200 font-semibold">
                    <td>
                      <span
                        className="inline-block h-3 w-3 mr-2 align-middle"
                        style={{ background: COLOR[g.category] }}
                      />
                      {en} <span className="font-normal text-charcoal-700">({g.name_ms})</span>
                      {!g.printed && (
                        <span className="block text-xs font-normal text-charcoal-700">
                          Printed as a heading without an amount; the figure is the sum of its items.
                        </span>
                      )}
                    </td>
                    <td className="num">{g.revised_sen === null ? "–" : formatSen(g.revised_sen)}</td>
                    <td className="num">{formatSen(g.actual_sen)}</td>
                    <td className="num">{g.prior_sen === null ? "–" : formatSen(g.prior_sen)}</td>
                    <td className="num">{change(g.actual_sen, g.prior_sen)}</td>
                    <td className="num">{share(g.actual_sen).toFixed(1)}%</td>
                    <td>
                      <CitationLink year={year} docUrl={detail.doc_url} pdfPage={g.pdf_page} bookPage={g.book_page} />
                    </td>
                  </tr>
                  {g.items.map((i) => (
                    <tr key={i.ordinal}>
                      <td className="pl-8">{i.name_ms}</td>
                      <td className="num">{i.revised_sen === null ? "–" : formatSen(i.revised_sen)}</td>
                      <td className="num">{formatSen(i.actual_sen)}</td>
                      <td className="num">{i.prior_sen === null ? "–" : formatSen(i.prior_sen)}</td>
                      <td className="num">{change(i.actual_sen, i.prior_sen)}</td>
                      <td className="num">{share(i.actual_sen).toFixed(1)}%</td>
                      <td>
                        <CitationLink year={year} docUrl={detail.doc_url} pdfPage={i.pdf_page} bookPage={i.book_page} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
            <tfoot>
              <tr className="font-semibold border-t-2 border-foreground">
                <td>Total revenue (HASIL)</td>
                <td />
                <td className="num">{formatSen(now.total)}</td>
                <td className="num">{before ? formatSen(before.total) : "–"}</td>
                <td className="num">{before ? change(now.total, before.total) : "–"}</td>
                <td className="num">100%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-8 text-sm text-charcoal-700 max-w-3xl">
          Source: Jabatan Akauntan Negara, <em>Penyata Kewangan Kerajaan Persekutuan {year}</em>, Note 5(a). See how
          this revenue was spent on the <Link href={`/spending?year=${year}`}>spending chart</Link>, or how your own
          income tax is spread on <Link href="/tax">Where your taxes go</Link>.
        </p>
      </Band>
    </>
  );
}
