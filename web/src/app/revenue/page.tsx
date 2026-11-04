// Revenue by type from JANM's Note 5(a) "Hasil mengikut penjenisan", in the boxed buildcanada.com style.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CitationLink from "@/components/CitationLink";
import StackedBars from "@/components/StackedBars";
import YearNav from "@/components/YearNav";
import { cn } from "@/lib/cn";
import { formatSen, formatSenCompact, parseSen } from "@/lib/money";
import { REVENUE_CATEGORIES, getRevenueDetail, getRevenueHistory } from "@/lib/queries/revenue";
import { getFederalSpending } from "@/lib/queries/spending";
import { colours } from "@/styles/colours";

export const metadata: Metadata = {
  title: "Government revenue",
  description: "Where the Malaysian federal government's money comes from: taxes, non-tax revenue and other receipts, from the audited statements.",
};

const label = "font-mono text-[12px] uppercase tracking-[0.22em]";
const COLOR: Record<(typeof REVENUE_CATEGORIES)[number]["category"], string> = {
  direct_tax: colours.lake[800],
  indirect_tax: colours.lake[500],
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
  const tax = now.byCategory.direct_tax + now.byCategory.indirect_tax;
  const share = (v: number) => (v / now.total) * 100;
  const allItems = detail.groups.flatMap((g) => g.items);
  const biggest = [...allItems].sort((a, b) => b.actual_sen - a.actual_sen)[0];

  return (
    <>
      <section className="border-b-2 border-foreground px-6 py-12 md:px-16 md:py-16">
        <div className="max-w-6xl mx-auto">
          <div className={cn(label, "text-charcoal-700")}>Federal revenue · Note 5(a)</div>
          <h1 className="mt-4 m-0 font-display text-4xl md:text-6xl font-semibold tracking-tight">Where the money comes from</h1>
          <p className="mt-4 max-w-3xl text-lg text-charcoal-800">
            Every ringgit the federal government collected, by type, from the Accountant General&apos;s audited
            statements. Each category total is recomputed from its items before it is published.
          </p>
          <div className="mt-8">
            <YearNav year={year} years={years} hrefFor={(y) => `/revenue?year=${y}`} />
          </div>
        </div>
      </section>

      <section className="border-b-2 border-foreground grid grid-cols-2 lg:grid-cols-4">
        {[
          { k: `Revenue, ${year}`, v: formatSenCompact(now.total), sub: before ? `${change(now.total, before.total)} on ${year - 1}` : "" },
          { k: "From taxes", v: `${share(tax).toFixed(1)}%`, sub: formatSenCompact(parseSen(tax)) },
          { k: "Largest single source", v: formatSenCompact(biggest.actual_sen), sub: biggest.name_ms },
          spending
            ? {
                k: "Spending covered",
                v: `${((now.total / spending.total_actual_sen) * 100).toFixed(1)}%`,
                sub: `of ${formatSenCompact(spending.total_actual_sen)} spent; the rest was borrowed`,
              }
            : { k: "Spending covered", v: "–", sub: "" },
        ].map((c) => (
          <div
            key={c.k}
            className="px-6 md:px-8 py-8 md:py-10 border-r-2 border-b-2 lg:border-b-0 border-foreground last:border-r-0 [&:nth-child(2)]:border-r-0 lg:[&:nth-child(2)]:border-r-2"
          >
            <div className={cn(label, "text-charcoal-700")}>{c.k}</div>
            <div className="mt-3 font-display text-3xl md:text-5xl font-semibold tracking-tight tabular-nums">{c.v}</div>
            <div className="mt-1 text-sm text-charcoal-700">{c.sub}</div>
          </div>
        ))}
      </section>

      <section className="border-b-2 border-foreground px-6 py-14 md:px-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="m-0 font-display text-3xl md:text-4xl font-semibold tracking-tight">Revenue by type, {year}</h2>
          <div className="mt-8 flex h-14 w-full overflow-hidden border-2 border-foreground" role="img" aria-label={`Revenue by type, ${year}`}>
            {REVENUE_CATEGORIES.map((c) => (
              <div
                key={c.category}
                title={`${c.en}: ${formatSenCompact(now.byCategory[c.category])}`}
                style={{ width: `${share(now.byCategory[c.category])}%`, background: COLOR[c.category] }}
                className="h-full border-r border-linen-50/60 last:border-r-0"
              />
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-6">
            {REVENUE_CATEGORIES.map((c) => (
              <div key={c.category} className="border-t-[6px] pt-3" style={{ borderColor: COLOR[c.category] }}>
                <div className="font-display text-2xl font-semibold tabular-nums">{share(now.byCategory[c.category]).toFixed(1)}%</div>
                <div className="font-medium">{c.en}</div>
                <div className="text-sm text-charcoal-700 tabular-nums">{formatSenCompact(now.byCategory[c.category])}</div>
              </div>
            ))}
          </div>

          <h2 className="mt-16 m-0 font-display text-3xl md:text-4xl font-semibold tracking-tight">Over the years</h2>
          <div className="mt-8">
            <StackedBars
              label="Federal revenue by type and year"
              series={REVENUE_CATEGORIES.map((c) => ({ label: c.en, color: COLOR[c.category] }))}
              rows={[...history]
                .sort((a, b) => a.year - b.year)
                .map((h) => ({ year: h.year, values: REVENUE_CATEGORIES.map((c) => h.byCategory[c.category]) }))}
            />
          </div>
        </div>
      </section>

      <section className="border-b-2 border-foreground px-6 py-14 md:px-16">
        <div className="max-w-6xl mx-auto">
          <h2 className="m-0 font-display text-3xl md:text-4xl font-semibold tracking-tight">Every item, {year}</h2>
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
                        <span className="inline-block h-3 w-3 mr-2 align-middle" style={{ background: COLOR[g.category] }} />
                        {en} <span className="font-normal text-charcoal-700">({g.name_ms})</span>
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
        </div>
      </section>
    </>
  );
}
