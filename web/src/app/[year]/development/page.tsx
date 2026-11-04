import type { Metadata } from "next";
import Link from "next/link";
import {
  getDevelopmentStatementTotal,
  getDevelopmentVotes,
  type DevelopmentSortKey,
} from "@/lib/queries/development";
import { formatSen, formatSenCompact, utilisation } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import CitationLink from "@/components/CitationLink";
import UtilBar from "@/components/UtilBar";
import { getLoadedYears, requireYear } from "@/lib/years";
import YearNav from "@/components/YearNav";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Development expenditure ${(await params).year}` };
}

interface Props {
  params: Promise<{ year: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function sortParam(raw: string | string[] | undefined): DevelopmentSortKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "estimate_sen" || v === "actual_sen" ? v : "code";
}

export default async function DevelopmentPage({ params, searchParams }: Props) {
  const year = await requireYear((await params).year);
  const sort = sortParam((await searchParams).sort);
  const [votes, total, years] = await Promise.all([
    getDevelopmentVotes(year, sort),
    getDevelopmentStatementTotal(year),
    getLoadedYears(),
  ]);

  if (!total) {
    return <p>No development statement has been loaded for {year} yet.</p>;
  }

  return (
    <>
      <div className="mb-8">
        <YearNav year={year} years={years} suffix="/development" />
        <h1 className="text-2xl font-semibold mb-1">Development expenditure {year}</h1>
        <p style={{ color: "var(--muted)" }} className="text-sm max-w-2xl">
          Perbelanjaan Pembangunan (Lampiran 2): spending on projects under the Twelfth Malaysia Plan (RMKe-12,
          2021–2025), by vote. <Link href="/methodology">How these numbers are checked.</Link>
        </p>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3 p-4 rounded-lg border"
        style={{ borderColor: "var(--border)" }}
      >
        <Stat label={`Estimate ${year}`} value={formatSenCompact(total.estimate_sen)} />
        <Stat label={`Actual ${year}`} value={formatSenCompact(total.actual_sen)} />
        <Stat label="Spent of estimate" value={`${utilisation(total.estimate_sen, total.actual_sen).toFixed(1)}%`} />
        <Stat label="RMKe-12 spent to date" value={formatSenCompact(total.plan_actual_to_date_sen)} />
      </div>
      <p className="text-xs mb-8 max-w-3xl" style={{ color: "var(--muted)" }}>
        Totals as printed (JUMLAH PERBELANJAAN PEMBANGUNAN),{" "}
        <CitationLink year={year} docUrl={total.doc_url} pdfPage={total.pdf_page} bookPage={total.book_page} spread />.{" "}
        {formatSen(total.actual_loan_sen)} of the year&apos;s actual was loan-funded (Pinjaman); the rest was paid
        directly (Cara Langsung). Total cost of all projects is {formatSen(total.total_cost_sen)}.
        {total.footnote && (
          <>
            {" "}
            The statement notes: <q lang="ms">{total.footnote.replace(/^\*\s*/, "")}</q>
          </>
        )}
      </p>

      <div className="mb-3 flex flex-wrap gap-4 text-xs" style={{ color: "var(--muted)" }}>
        <span>Sort by:</span>
        <SortLink year={year} col="code" current={sort} label="Vote code" />
        <SortLink year={year} col="estimate_sen" current={sort} label="Estimate" />
        <SortLink year={year} col="actual_sen" current={sort} label="Actual" />
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Vote</th>
              <th className="text-right">Estimate {year} (RM)</th>
              <th className="text-right">Actual {year} (RM)</th>
              <th>Spent</th>
              <th className="text-right">RMKe-12 to date (RM)</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {votes.map((v) => {
              const over = v.actual_sen > v.estimate_sen;
              const href = `/${year}/vote/${voteCodeToSlug(v.code)}`;
              return (
                <tr key={v.code}>
                  <td className="font-mono text-xs whitespace-nowrap">
                    <Link href={href}>{v.code}</Link>
                  </td>
                  <td className="max-w-xs">
                    <Link href={href}>{v.name_ms}</Link>
                  </td>
                  <td className="num">{formatSen(v.estimate_sen)}</td>
                  <td className={`num ${over ? "over-budget" : ""}`}>{formatSen(v.actual_sen)}</td>
                  <td>
                    <UtilBar revised={v.estimate_sen} actual={v.actual_sen} />
                  </td>
                  <td className="num">{formatSen(v.plan_actual_to_date_sen)}</td>
                  <td>
                    <CitationLink year={year} docUrl={v.doc_url} pdfPage={v.pdf_page} bookPage={v.book_page} spread />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SortLink({
  year,
  col,
  current,
  label,
}: {
  year: number;
  col: DevelopmentSortKey;
  current: DevelopmentSortKey;
  label: string;
}) {
  const active = col === current;
  return (
    <Link
      href={`/${year}/development?sort=${col}`}
      style={{ color: active ? "var(--fg)" : "var(--muted)", fontWeight: active ? 600 : 400, textDecoration: "none" }}
    >
      {label}
      {active && " ↓"}
    </Link>
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
