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

export const metadata: Metadata = {
  title: "Development expenditure 2025",
};

const YEAR = 2025;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function sortParam(raw: string | string[] | undefined): DevelopmentSortKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "estimate_sen" || v === "actual_sen" ? v : "code";
}

export default async function DevelopmentPage({ searchParams }: Props) {
  const sort = sortParam((await searchParams).sort);
  const [votes, total] = await Promise.all([getDevelopmentVotes(YEAR, sort), getDevelopmentStatementTotal(YEAR)]);

  if (!total) {
    return <p>No development statement has been loaded for {YEAR} yet.</p>;
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Development expenditure {YEAR}</h1>
        <p style={{ color: "var(--muted)" }} className="text-sm max-w-2xl">
          Perbelanjaan Pembangunan (Lampiran 2): spending on projects under the Twelfth Malaysia Plan (RMKe-12,
          2021–2025), by vote. <Link href="/methodology">How these numbers are checked.</Link>
        </p>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3 p-4 rounded-lg border"
        style={{ borderColor: "var(--border)" }}
      >
        <Stat label={`Estimate ${YEAR}`} value={formatSenCompact(total.estimate_sen)} />
        <Stat label={`Actual ${YEAR}`} value={formatSenCompact(total.actual_sen)} />
        <Stat label="Spent of estimate" value={`${utilisation(total.estimate_sen, total.actual_sen).toFixed(1)}%`} />
        <Stat label="RMKe-12 spent to date" value={formatSenCompact(total.plan_actual_to_date_sen)} />
      </div>
      <p className="text-xs mb-8 max-w-3xl" style={{ color: "var(--muted)" }}>
        Totals as printed (JUMLAH PERBELANJAAN PEMBANGUNAN),{" "}
        <CitationLink docUrl={total.doc_url} pdfPage={total.pdf_page} bookPage={total.book_page} spread />.{" "}
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
        <SortLink col="code" current={sort} label="Vote code" />
        <SortLink col="estimate_sen" current={sort} label="Estimate" />
        <SortLink col="actual_sen" current={sort} label="Actual" />
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Vote</th>
              <th className="text-right">Estimate {YEAR} (RM)</th>
              <th className="text-right">Actual {YEAR} (RM)</th>
              <th>Spent</th>
              <th className="text-right">RMKe-12 to date (RM)</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {votes.map((v) => {
              const over = v.actual_sen > v.estimate_sen;
              const href = `/2025/vote/${voteCodeToSlug(v.code)}`;
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
                    <CitationLink docUrl={v.doc_url} pdfPage={v.pdf_page} bookPage={v.book_page} spread />
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

function SortLink({ col, current, label }: { col: DevelopmentSortKey; current: DevelopmentSortKey; label: string }) {
  const active = col === current;
  return (
    <Link
      href={`/2025/development?sort=${col}`}
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
