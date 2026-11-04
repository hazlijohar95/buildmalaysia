import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBudgetActualCheck,
  getBudgetSource,
  getBudgetTotals,
  getBudgetVotes,
  type BudgetVoteRow,
} from "@/lib/queries/budget";
import { formatSen, formatSenCompact, type Sen } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import { columnLabel, requireBudgetYear } from "@/lib/budgetYear";
import CitationLink from "@/components/CitationLink";

interface Props {
  params: Promise<{ budgetYear: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Budget ${(await params).budgetYear}` };
}

const SECTIONS: { letter: string; title: string; note: string }[] = [
  { letter: "B", title: "Supply votes (operating)", note: "Bekalan: voted each year by Parliament, per ministry." },
  {
    letter: "T",
    title: "Charged votes (operating)",
    note: "Tanggungan: charged on the Consolidated Fund by law, such as debt service and pensions.",
  },
  { letter: "P", title: "Development votes", note: "Pembangunan: projects, per ministry." },
];

export default async function BudgetPage({ params }: Props) {
  const year = await requireBudgetYear((await params).budgetYear);
  const [source, totals, votes, check] = await Promise.all([
    getBudgetSource(year),
    getBudgetTotals(year),
    getBudgetVotes(year),
    getBudgetActualCheck(year),
  ]);
  const proposed = totals.at(-1);
  const current = totals.at(-2);
  if (!source || !proposed || !current) notFound();
  const checked = check.reduce((n, c) => n + c.count, 0);
  const agreed = check.filter((c) => c.result === "matches" || c.result === "rounding");
  const agreedCount = agreed.reduce((n, c) => n + c.count, 0);
  const worst = Math.max(0, ...agreed.map((c) => c.worst_sen));

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1">Budget {year}</h1>
        <p style={{ color: "var(--muted)" }} className="text-sm max-w-2xl">
          What the federal government proposes to spend in {year}, from the Ministry of Finance&apos;s{" "}
          <em>Anggaran Perbelanjaan Persekutuan {year}</em>, beside the two years already spent and the{" "}
          {current.fiscal_year} budget.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3 p-4 rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <Stat label={`Proposed ${year}`} value={formatSenCompact(proposed.grand_total_sen)} change={change(proposed.grand_total_sen, current.grand_total_sen, current.fiscal_year)} />
        <Stat label="Operating" value={formatSenCompact(proposed.operating_sen)} change={change(proposed.operating_sen, current.operating_sen, current.fiscal_year)} />
        <Stat label="Development" value={formatSenCompact(proposed.development_sen)} change={change(proposed.development_sen, current.development_sen, current.fiscal_year)} />
      </div>
      <p className="text-xs mb-8 max-w-3xl" style={{ color: "var(--muted)" }}>
        Totals as printed (JUMLAH BESAR,{" "}
        <CitationLink year={year} source="MOF" docUrl={source.url} pdfPage={proposed.pdf_page} bookPage={proposed.book_page} />
        ). Development includes a{" "}
        {formatSenCompact(proposed.contingency_sen)} contingency reserve (P.70). The printed total adds operating and
        development as they stand, so the operating account&apos;s transfer to the Development Fund is counted in both;
        the spending pages count it once.{" "}
        {checked > 0 && (
          <>
            MOF&apos;s printed actuals for {totals[0].fiscal_year} and {totals[1].fiscal_year} agree with the audited
            statements for {agreedCount} of {checked} vote figures
            {worst > 0 ? `, all within ${formatSen(worst as Sen)}` : ""}.
          </>
        )}
      </p>

      {SECTIONS.map((section) => {
        const rows = votes.filter((v) => v.vote_code.startsWith(section.letter));
        if (!rows.length) return null;
        return (
          <section key={section.letter} className="mb-10">
            <h2 className="text-lg font-semibold mb-1">{section.title}</h2>
            <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
              {section.note}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Vote</th>
                    <th>Ministry or department</th>
                    {totals.map((t) => (
                      <th key={t.fiscal_year} className="text-right">
                        {columnLabel(t.fiscal_year, t.basis)} (RM)
                      </th>
                    ))}
                    <th className="text-right">Change</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <VoteRow key={v.vote_code} year={year} url={source.url} vote={v} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}

function change(now: Sen, before: Sen, beforeYear: number): string | null {
  if (before === 0) return null;
  const pct = ((now - before) / before) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% on the ${beforeYear} budget`;
}

function VoteRow({ year, url, vote }: { year: number; url: string; vote: BudgetVoteRow }) {
  const [proposed, current] = [vote.amounts.at(-1) ?? (0 as Sen), vote.amounts.at(-2) ?? (0 as Sen)];
  const pct = current > 0 ? ((proposed - current) / current) * 100 : null;
  const href = `/budget/${year}/vote/${voteCodeToSlug(vote.vote_code)}`;
  return (
    <tr>
      <td className="font-mono text-xs whitespace-nowrap">
        <Link href={href}>{vote.vote_code}</Link>
      </td>
      <td className="max-w-xs">
        <Link href={href}>{vote.heading}</Link>
      </td>
      {vote.amounts.map((a, i) => (
        <td key={i} className={`num ${i === vote.amounts.length - 1 ? "font-medium" : ""}`}>
          {formatSen(a)}
        </td>
      ))}
      <td className="num">{pct === null ? "–" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}</td>
      <td>
        <CitationLink year={year} source="MOF" docUrl={url} pdfPage={vote.pdf_page} bookPage={vote.book_page} />
      </td>
    </tr>
  );
}

function Stat({ label, value, change }: { label: string; value: string; change: string | null }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="text-xl font-semibold tabnum">{value}</div>
      {change && (
        <div className="text-xs tabnum" style={{ color: "var(--muted)" }}>
          {change}
        </div>
      )}
    </div>
  );
}
