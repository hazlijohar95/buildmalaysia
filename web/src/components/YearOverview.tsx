import SourceNotes from "@/components/SourceNotes";
import { getSourceNotes } from "@/lib/queries/gaps";
import {
  getFederalSpending,
  getMinistrySpending,
  getSpendingByYear,
  type MinistrySpending,
  type YearSpending,
} from "@/lib/queries/spending";
import { getFiscalTotals } from "@/lib/queries/overview";
import { titleCase } from "@/lib/queries/sankey";
import type { Sen } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import { Band, BiLabel, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Money, Term, change, money } from "@/components/Figures";
import YearNav from "@/components/YearNav";

/** Federal spending for one fiscal year: the total, its parts, the trend and each ministry. */
export default async function YearOverview({ year }: { year: number }) {
  const [spending, ministries, operating, byYear, notes] = await Promise.all([
    getFederalSpending(year),
    getMinistrySpending(year),
    getFiscalTotals(year),
    getSpendingByYear(),
    getSourceNotes(year),
  ]);

  if (!spending || !operating) {
    return (
      <Band wide>
        <p>No statements have been loaded for {year} yet.</p>
      </Band>
    );
  }
  const covid = spending.covid_fund_actual_sen;
  const showCovid = covid !== null && covid > 0;
  const largest = ministries[0]?.actual_sen ?? 0;

  return (
    <>
      <PageHeader
        wide
        eyebrow="Federal spending · audited statements"
        title={`Federal spending ${year}`}
        intro={
          <p>
            What the Malaysian federal government actually spent in {year}, from the audited federal financial
            statements. Every figure links to the page it was read from.{" "}
            <a href="/methodology">How these numbers are checked.</a>
          </p>
        }
      >
        <YearNav year={year} years={byYear.map((y) => y.fiscal_year)} />
      </PageHeader>
      <SourceNotes notes={notes} />

      <StatRow
        stats={[
          { label: "Total spending", ...money(spending.total_actual_sen) },
          {
            label: "Operating",
            ...money(spending.operating_net_actual_sen),
            sub: <a href={`/${year}/operating`}>Every operating vote</a>,
          },
          {
            label: "Development",
            ...money(spending.development_actual_sen),
            sub: <a href={`/${year}/development`}>Every development vote</a>,
          },
          ...(showCovid
            ? [
                {
                  label: "COVID-19 Fund",
                  ...money(covid),
                  sub: <a href={`/${year}/covid`}>Every programme</a>,
                },
              ]
            : []),
        ]}
      />

      <Band wide>
        <p className="max-w-xl text-charcoal-800">
          <Term id="operating-development">Operating</Term> is the printed operating total of{" "}
          <Money sen={spending.operating_actual_sen} /> (
          <CitationLink
            year={year}
            docUrl={spending.doc_url}
            pdfPage={spending.operating_pdf_page}
            bookPage={spending.operating_book_page}
          />
          ) less the <Money sen={spending.development_fund_transfer_sen} /> transfer to the Development Fund (
          <CitationLink
            year={year}
            docUrl={spending.doc_url}
            pdfPage={spending.transfer_pdf_page}
            bookPage={spending.transfer_book_page}
          />
          ). That fund pays for development spending, so counting the transfer as well would count the same money twice.
          Development is the printed development total (
          <CitationLink
            year={year}
            docUrl={spending.doc_url}
            pdfPage={spending.development_pdf_page}
            bookPage={spending.development_book_page}
          />
          ).
          {showCovid && spending.covid_fund_pdf_page !== null && spending.covid_fund_book_page !== null && (
            <>
              {" "}
              The COVID-19 Fund (<span lang="ms">Kumpulan Wang COVID-19</span>) was financed outside the operating
              account, so its spending adds to the other two (
              <CitationLink
                year={year}
                docUrl={spending.doc_url}
                pdfPage={spending.covid_fund_pdf_page}
                bookPage={spending.covid_fund_book_page}
              />
              ).
            </>
          )}{" "}
          Each part is checked against data.gov.my&apos;s published figures; see the{" "}
          <a href="/methodology">methodology</a>.
        </p>
      </Band>

      {byYear.length > 1 && <YearTable years={byYear} current={year} />}

      <Band wide>
        <H2>By ministry</H2>
        <p className="mt-3 max-w-xl text-charcoal-800">
          Each ministry&apos;s <Term id="vote-codes">supply vote (B) and development vote (P)</Term>, actual spending as
          printed. Charged expenditure (T votes, such as debt service and pensions,{" "}
          <Money sen={operating.charged_actual_sen} />) is not voted to a ministry and is listed under{" "}
          <a href={`/${year}/operating`}>operating expenditure</a>. B.12 is transfers into statutory funds, including
          the Development Fund transfer above.
        </p>
        <div className="table-scroll mt-8">
          <table>
            <thead>
              <tr>
                <th>Ministry or department</th>
                <th className="text-right">
                  <BiLabel en="Operating" ms="Mengurus" />
                </th>
                <th className="text-right">
                  <BiLabel en="Development" ms="Pembangunan" />
                </th>
                <th className="text-right">Total</th>
                <th className="relative min-w-[120px]">
                  <span className="sr-only">Share of the largest</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ministries.map((m) => (
                <MinistryRow key={m.body_id} year={year} m={m} largest={largest} />
              ))}
            </tbody>
          </table>
        </div>
      </Band>
    </>
  );
}

function MinistryRow({ year, m, largest }: { year: number; m: MinistrySpending; largest: number }) {
  const width = largest > 0 ? (m.actual_sen / largest) * 100 : 0;
  return (
    <tr>
      <td lang="ms">{titleCase(m.name_ms)}</td>
      <td className="num">
        <VoteAmount year={year} code={m.operating_vote_code} amount={m.operating_actual_sen} />
      </td>
      <td className="num">
        <VoteAmount year={year} code={m.development_vote_code} amount={m.development_actual_sen} />
      </td>
      <td className="num font-medium">
        <Money sen={m.actual_sen} />
      </td>
      <td>
        <div className="h-2 bg-linen-200">
          <div className="h-full bg-foreground" style={{ width: `${width}%` }} />
        </div>
      </td>
    </tr>
  );
}

function VoteAmount({ year, code, amount }: { year: number; code: string | null; amount: Sen | null }) {
  if (code === null || amount === null) return <span className="text-charcoal-600">–</span>;
  return (
    <a href={`/${year}/vote/${voteCodeToSlug(code)}`}>
      <Money sen={amount} />
      <span className="font-mono text-xs ml-2 text-charcoal-600">{code}</span>
    </a>
  );
}

function YearTable({ years, current }: { years: YearSpending[]; current: number }) {
  const hasCovid = years.some((y) => y.covid_fund_actual_sen > 0);
  return (
    <Band wide>
      <H2>Year by year</H2>
      <div className="table-scroll mt-8">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th className="text-right">
                <BiLabel en="Operating" ms="Mengurus" />
              </th>
              <th className="text-right">
                <BiLabel en="Development" ms="Pembangunan" />
              </th>
              {hasCovid && <th className="text-right">COVID-19 Fund</th>}
              <th className="text-right">Total</th>
              <th className="text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y, i) => {
              const prior = years[i - 1]?.fiscal_year === y.fiscal_year - 1 ? years[i - 1] : undefined; // no change across a gap in loaded years
              return (
                <tr key={y.fiscal_year} className={y.fiscal_year === current ? "font-semibold" : ""}>
                  <td>
                    {y.fiscal_year === current ? (
                      <span aria-current="page">{y.fiscal_year}</span>
                    ) : (
                      <a href={`/${y.fiscal_year}`}>{y.fiscal_year}</a>
                    )}
                  </td>
                  <td className="num">
                    <Money sen={y.operating_net_actual_sen} />
                  </td>
                  <td className="num">
                    <Money sen={y.development_actual_sen} />
                  </td>
                  {hasCovid && (
                    <td className="num">
                      {y.covid_fund_actual_sen > 0 ? <Money sen={y.covid_fund_actual_sen} /> : "–"}
                    </td>
                  )}
                  <td className="num">
                    <Money sen={y.total_actual_sen} />
                  </td>
                  <td className="num">{prior ? change(y.total_actual_sen, prior.total_actual_sen) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Band>
  );
}
