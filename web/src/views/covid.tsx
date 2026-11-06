import { notFound } from "@/lib/abort";
import { getCovidFund, type CovidFundRow } from "@/lib/queries/covid";
import { formatSen, parseSen, utilisation } from "@/lib/money";
import { requireYear } from "@/lib/years";
import { Band, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Breadcrumb, Money, Term, money } from "@/components/Figures";
import UtilBar from "@/components/UtilBar";
import { previews } from "@/lib/previews";
import type { Page, RouteContext } from "@/lib/route";

export default async function covidPage({ params }: RouteContext): Promise<Page> {
  const year = await requireYear(params.year ?? "");
  const { lines, total } = await getCovidFund(year);
  if (!total) notFound();
  const withdrawals = total.withdrawal_sen !== 0;

  return {
    head: { title: `COVID-19 Fund ${year}`, og: previews.year(year) },
    body: (
      <>
        <PageHeader
          wide
          eyebrow={<Breadcrumb items={[{ label: year, href: `/${year}` }, { label: "COVID-19 Fund" }]} />}
          title={`COVID-19 Fund ${year}`}
          intro={
            <p>
              The fund set up in 2020 for pandemic relief and recovery (<span lang="ms">Kumpulan Wang COVID-19</span>,
              Lampiran 3), with an overall ceiling of <Money sen={total.ceiling_sen} />. It was financed outside the
              operating account, so its spending adds to{" "}
              <Term id="operating-development">operating and development</Term> spending.
            </p>
          }
        />

        <StatRow
          stats={[
            {
              label: `Allocation ${year} (revised)`,
              ...money(total.revised_sen),
              ...(withdrawals && {
                sub: (
                  <>
                    after <Money sen={parseSen(-total.withdrawal_sen)} /> withdrawn (<span lang="ms">Tarik</span>)
                  </>
                ),
              }),
            },
            { label: `Spent ${year}`, ...money(total.actual_sen) },
            { label: "% used", value: `${utilisation(total.revised_sen, total.actual_sen).toFixed(1)}%` },
            {
              label: "Spent since 2020",
              ...money(total.spent_to_date_sen),
              sub: (
                <>
                  Totals as printed,{" "}
                  <CitationLink
                    year={year}
                    docUrl={total.doc_url}
                    pdfPage={total.pdf_page}
                    bookPage={total.book_page}
                    spread
                  />
                </>
              ),
            },
          ]}
        />

        <Band wide>
          <H2>Every programme</H2>
          <p className="mt-3 max-w-xl text-charcoal-800">
            Each programme exactly as printed, to the sen. See the <a href={`/${year}`}>year&apos;s total</a> for how
            the fund adds to federal spending.
          </p>
          <div className="table-scroll mt-8">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th className="min-w-60">Programme</th>
                  <th className="text-right">Ceiling</th>
                  {withdrawals && (
                    <th className="text-right">
                      Withdrawn (<span lang="ms">Tarik</span>)
                    </th>
                  )}
                  <th className="text-right">Allocation {year}</th>
                  <th className="text-right">Spent {year}</th>
                  <th>% used</th>
                  <th className="text-right">Spent since 2020</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <Row key={l.code} year={year} line={l} withdrawals={withdrawals} />
                ))}
              </tbody>
            </table>
          </div>
        </Band>
      </>
    ),
  };
}

function Row({ year, line, withdrawals }: { year: number; line: CovidFundRow; withdrawals: boolean }) {
  const over = line.actual_sen > line.revised_sen;
  return (
    <tr>
      <td className="font-mono text-xs">{line.code}</td>
      <td lang="ms">{line.name_ms}</td>
      <td className="num">{formatSen(line.ceiling_sen)}</td>
      {withdrawals && <td className="num">{line.withdrawal_sen === 0 ? "–" : formatSen(line.withdrawal_sen)}</td>}
      <td className="num">{formatSen(line.revised_sen)}</td>
      <td className={`num ${over ? "over-budget" : ""}`}>{formatSen(line.actual_sen)}</td>
      <td>{line.revised_sen > 0 ? <UtilBar revised={line.revised_sen} actual={line.actual_sen} /> : null}</td>
      <td className="num">{formatSen(line.spent_to_date_sen)}</td>
      <td>
        <CitationLink year={year} docUrl={line.doc_url} pdfPage={line.pdf_page} bookPage={line.book_page} spread />
      </td>
    </tr>
  );
}
