import Link from "next/link";
import {
  getFederalSpending,
  getMinistrySpending,
  getSpendingByYear,
  type MinistrySpending,
  type YearSpending,
} from "@/lib/queries/spending";
import { getFiscalTotals } from "@/lib/queries/overview";
import { formatSen, formatSenCompact, type Sen } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import CitationLink from "@/components/CitationLink";
import YearNav from "@/components/YearNav";

/** Federal spending for one fiscal year: the total, its parts, the trend and each ministry. */
export default async function YearOverview({ year }: { year: number }) {
  const [spending, ministries, operating, byYear] = await Promise.all([
    getFederalSpending(year),
    getMinistrySpending(year),
    getFiscalTotals(year),
    getSpendingByYear(),
  ]);

  if (!spending || !operating) {
    return <p>No statements have been loaded for {year} yet.</p>;
  }

  const largest = ministries[0]?.actual_sen ?? 0;

  return (
    <>
      <div className="mb-8">
        <YearNav year={year} years={byYear.map((y) => y.fiscal_year)} />
        <h1 className="text-2xl font-semibold mb-1">Federal spending {year}</h1>
        <p style={{ color: "var(--muted)" }} className="text-sm max-w-2xl">
          What the Malaysian federal government actually spent in {year}, from the audited federal financial
          statements. Every figure links to the page it was read from.{" "}
          <Link href="/methodology">How these numbers are checked.</Link>
        </p>
      </div>

      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3 p-4 rounded-lg border"
        style={{ borderColor: "var(--border)" }}
      >
        <Stat label="Total spending" value={formatSenCompact(spending.total_actual_sen)} />
        <Stat
          label="Operating (Mengurus)"
          value={formatSenCompact(spending.operating_net_actual_sen)}
          href={`/${year}/operating`}
        />
        <Stat
          label="Development (Pembangunan)"
          value={formatSenCompact(spending.development_actual_sen)}
          href={`/${year}/development`}
        />
      </div>
      <p className="text-xs mb-10 max-w-3xl" style={{ color: "var(--muted)" }}>
        Operating is the printed operating total of {formatSen(spending.operating_actual_sen)} (
        <CitationLink
          year={year}
          docUrl={spending.doc_url}
          pdfPage={spending.operating_pdf_page}
          bookPage={spending.operating_book_page}
        />
        ) less the {formatSen(spending.development_fund_transfer_sen)} transfer to the Development Fund (
        <CitationLink
          year={year}
          docUrl={spending.doc_url}
          pdfPage={spending.transfer_pdf_page}
          bookPage={spending.transfer_book_page}
        />
        ). That fund pays for development spending, so counting the transfer as well would count the same money
        twice. Development is the printed development total (
        <CitationLink
          year={year}
          docUrl={spending.doc_url}
          pdfPage={spending.development_pdf_page}
          bookPage={spending.development_book_page}
        />
        ). Both are checked against data.gov.my&apos;s published figures; see the methodology.
      </p>

      {byYear.length > 1 && <YearTable years={byYear} current={year} />}

      <h2 className="text-lg font-semibold mb-1">By ministry</h2>
      <p className="text-xs mb-3 max-w-3xl" style={{ color: "var(--muted)" }}>
        Each ministry&apos;s supply vote (B) and development vote (P), actual spending as printed. Charged expenditure
        (T votes, such as debt service and pensions, {formatSenCompact(operating.charged_actual_sen)}) is not
        voted to a ministry and is listed under <Link href={`/${year}/operating`}>operating expenditure</Link>. B.12 is
        transfers into statutory funds, including the Development Fund transfer above.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Ministry or department</th>
              <th className="text-right">Operating (RM)</th>
              <th className="text-right">Development (RM)</th>
              <th className="text-right">Total (RM)</th>
              <th style={{ minWidth: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {ministries.map((m) => (
              <MinistryRow key={m.number} year={year} m={m} largest={largest} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MinistryRow({ year, m, largest }: { year: number; m: MinistrySpending; largest: number }) {
  const width = largest > 0 ? (m.actual_sen / largest) * 100 : 0;
  return (
    <tr>
      <td className="max-w-sm">{m.name_ms}</td>
      <td className="num">
        <VoteAmount year={year} code={m.operating_vote_code} amount={m.operating_actual_sen} />
      </td>
      <td className="num">
        <VoteAmount year={year} code={m.development_vote_code} amount={m.development_actual_sen} />
      </td>
      <td className="num font-medium">{formatSen(m.actual_sen)}</td>
      <td>
        <div className="h-1.5 rounded-full" style={{ background: "var(--border)" }}>
          <div className="h-full rounded-full" style={{ width: `${width}%`, background: "var(--accent)" }} />
        </div>
      </td>
    </tr>
  );
}

function VoteAmount({ year, code, amount }: { year: number; code: string | null; amount: Sen | null }) {
  if (code === null || amount === null) return <span style={{ color: "var(--muted)" }}>–</span>;
  return (
    <Link href={`/${year}/vote/${voteCodeToSlug(code)}`} title={code}>
      {formatSen(amount)}
      <span className="font-mono text-xs ml-1" style={{ color: "var(--muted)" }}>
        {code}
      </span>
    </Link>
  );
}

function YearTable({ years, current }: { years: YearSpending[]; current: number }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">Year by year</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th className="text-right">Operating (RM)</th>
              <th className="text-right">Development (RM)</th>
              <th className="text-right">Total (RM)</th>
              <th className="text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y, i) => {
              const prior = years[i - 1];
              const change = prior ? ((y.total_actual_sen - prior.total_actual_sen) / prior.total_actual_sen) * 100 : null;
              return (
                <tr key={y.fiscal_year} className={y.fiscal_year === current ? "font-medium" : ""}>
                  <td>
                    <Link href={`/${y.fiscal_year}`}>{y.fiscal_year}</Link>
                  </td>
                  <td className="num">{formatSen(y.operating_net_actual_sen)}</td>
                  <td className="num">{formatSen(y.development_actual_sen)}</td>
                  <td className="num">{formatSen(y.total_actual_sen)}</td>
                  <td className="num">{change === null ? "–" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
        {href ? <Link href={href}>{label}</Link> : label}
      </div>
      <div className="text-xl font-semibold tabnum">{value}</div>
    </div>
  );
}
