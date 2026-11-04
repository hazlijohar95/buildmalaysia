import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCovidFund, type CovidFundRow } from "@/lib/queries/covid";
import { formatSen, formatSenCompact, utilisation } from "@/lib/money";
import { requireYear } from "@/lib/years";
import CitationLink from "@/components/CitationLink";
import UtilBar from "@/components/UtilBar";

interface Props {
  params: Promise<{ year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `COVID-19 Fund ${(await params).year}` };
}

export default async function CovidFundPage({ params }: Props) {
  const year = await requireYear((await params).year);
  const { lines, total } = await getCovidFund(year);
  if (!total) notFound();

  return (
    <>
      <div className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        <Link href={`/${year}`}>← Federal spending {year}</Link>
      </div>
      <h1 className="text-2xl font-semibold mb-1">COVID-19 Fund {year}</h1>
      <p style={{ color: "var(--muted)" }} className="text-sm max-w-2xl mb-6">
        Kumpulan Wang COVID-19 (Lampiran 3): the fund set up in 2020 for pandemic relief and recovery, with an
        overall ceiling of {formatSenCompact(total.ceiling_sen)}. It was financed outside the operating account, so
        its spending adds to operating and development spending.
      </p>

      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3 p-4 rounded-lg border"
        style={{ borderColor: "var(--border)" }}
      >
        <Stat label={`Allocation ${year} (revised)`} value={formatSenCompact(total.revised_sen)} />
        <Stat label={`Spent ${year}`} value={formatSenCompact(total.actual_sen)} />
        <Stat label="Spent of allocation" value={`${utilisation(total.revised_sen, total.actual_sen).toFixed(1)}%`} />
        <Stat label="Spent since 2020" value={formatSenCompact(total.spent_to_date_sen)} />
      </div>
      <p className="text-xs mb-8" style={{ color: "var(--muted)" }}>
        Totals as printed (Jumlah Keseluruhan),{" "}
        <CitationLink year={year} docUrl={total.doc_url} pdfPage={total.pdf_page} bookPage={total.book_page} spread />.
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Programme</th>
              <th className="text-right">Ceiling (RM)</th>
              <th className="text-right">Allocation {year} (RM)</th>
              <th className="text-right">Spent {year} (RM)</th>
              <th>Spent</th>
              <th className="text-right">Spent since 2020 (RM)</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <Row key={l.code} year={year} line={l} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({ year, line }: { year: number; line: CovidFundRow }) {
  const over = line.actual_sen > line.revised_sen;
  return (
    <tr>
      <td className="font-mono text-xs">{line.code}</td>
      <td className="max-w-sm">{line.name_ms}</td>
      <td className="num">{formatSen(line.ceiling_sen)}</td>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="text-lg font-semibold tabnum">{value}</div>
    </div>
  );
}
