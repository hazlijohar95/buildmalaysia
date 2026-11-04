import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBudgetOperatingHeadings,
  getBudgetProjects,
  getBudgetSource,
  getBudgetTotals,
  getBudgetVotes,
  type BudgetHeadingRow,
  type BudgetProjectRow,
} from "@/lib/queries/budget";
import { getLoadedYears } from "@/lib/years";
import { formatSen, parseSen } from "@/lib/money";
import { slugToVoteCode, voteCodeToSlug } from "@/lib/citations";
import { columnLabel, requireBudgetYear } from "@/lib/budgetYear";
import CitationLink from "@/components/CitationLink";

interface Props {
  params: Promise<{ budgetYear: string; code: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { budgetYear, code } = await params;
  return { title: `${slugToVoteCode(code)} · Budget ${budgetYear}` };
}

export default async function BudgetVotePage({ params }: Props) {
  const { budgetYear, code: slug } = await params;
  const year = await requireBudgetYear(budgetYear);
  const code = slugToVoteCode(slug);
  const [source, totals, votes, loadedYears] = await Promise.all([
    getBudgetSource(year),
    getBudgetTotals(year),
    getBudgetVotes(year),
    getLoadedYears(),
  ]);
  const vote = votes.find((v) => v.vote_code === code);
  if (!source || !vote) notFound();
  const development = code.startsWith("P.");
  const [headings, projects] = await Promise.all([
    development ? Promise.resolve([]) : getBudgetOperatingHeadings(year, code),
    development ? getBudgetProjects(year, code) : Promise.resolve([]),
  ]);
  const spentYear = loadedYears.find((y) => totals.some((t) => t.fiscal_year === y && t.basis === "actual"));
  const prior = totals.at(-2)?.fiscal_year ?? year - 1;

  return (
    <>
      <div className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        <Link href={`/budget/${year}`}>← Budget {year}</Link>
      </div>
      <div className="font-mono text-xs mb-1" style={{ color: "var(--muted)" }}>
        {code} · {development ? "Pembangunan (development)" : code.startsWith("T") ? "Tanggungan (charged)" : "Bekalan (supply)"}
        {spentYear && (
          <>
            {" · "}
            <Link href={`/${spentYear}/vote/${voteCodeToSlug(code)}`}>what it spent in {spentYear}</Link>
          </>
        )}
      </div>
      <h1 className="text-2xl font-semibold mb-4">{vote.heading}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 mb-2 rounded-lg border" style={{ borderColor: "var(--border)" }}>
        {totals.map((t, i) => (
          <div key={t.fiscal_year}>
            <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
              {columnLabel(t.fiscal_year, t.basis)}
            </div>
            <div className={`text-sm tabnum ${i === totals.length - 1 ? "font-semibold" : ""}`}>
              {formatSen(vote.amounts[i] ?? parseSen(0))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs mb-8" style={{ color: "var(--muted)" }}>
        As printed in the budget summary,{" "}
        <CitationLink year={year} source="MOF" docUrl={source.url} pdfPage={vote.pdf_page} bookPage={vote.book_page} />.
        Activities and projects are listed as the {year} budget defines them; codes are reused across years for
        different activities, so they are not matched to past spending line by line.
      </p>

      {development ? (
        <Projects year={year} url={source.url} prior={prior} projects={projects} />
      ) : (
        <Headings year={year} url={source.url} prior={prior} headings={headings} />
      )}
    </>
  );
}

function Headings({ year, url, prior, headings }: { year: number; url: string; prior: number; headings: BudgetHeadingRow[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Programme / activity</th>
            <th className="text-right">Budget {prior} (RM)</th>
            <th className="text-right">Budget {year} (RM)</th>
            <th className="text-right">Change</th>
            <th className="text-right">Posts {year}</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {headings.map((h) => {
            const programme = h.code.endsWith("0000");
            const pct = h.prior_estimate_sen > 0 ? ((h.estimate_sen - h.prior_estimate_sen) / h.prior_estimate_sen) * 100 : null;
            return (
              <tr key={h.code} style={programme ? { background: "var(--table-stripe)" } : undefined}>
                <td className="font-mono text-xs">{h.code}</td>
                <td className={programme ? "font-semibold" : "pl-6"}>{h.name_ms}</td>
                <td className="num">{formatSen(h.prior_estimate_sen)}</td>
                <td className="num">{formatSen(h.estimate_sen)}</td>
                <td className="num">{pct === null ? "–" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}</td>
                <td className="num">{h.posts === null ? "–" : h.posts.toLocaleString("en-MY")}</td>
                <td>
                  <CitationLink year={year} source="MOF" docUrl={url} pdfPage={h.pdf_page} bookPage={h.book_page} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Projects({ year, url, prior, projects }: { year: number; url: string; prior: number; projects: BudgetProjectRow[] }) {
  let lastGroup: number | null = null;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Project</th>
            <th className="text-right">Total cost (RM)</th>
            <th className="text-right">Revised {prior} (RM)</th>
            <th className="text-right">Budget {year} (RM)</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {projects.flatMap((p) => {
            const rows = [];
            if (p.group_ordinal !== lastGroup && p.group_name) {
              rows.push(
                <tr key={`g${p.group_ordinal}`} style={{ background: "var(--table-stripe)" }}>
                  <td colSpan={6} className="font-semibold">
                    {p.group_name}
                  </td>
                </tr>,
              );
            }
            lastGroup = p.group_ordinal;
            rows.push(
              <tr key={p.code}>
                <td className="font-mono text-xs">{p.code}</td>
                <td className="max-w-sm">
                  {p.name_ms}
                  {p.estimate_loan_sen > 0 && (
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {formatSen(p.estimate_loan_sen)} loan-funded
                    </div>
                  )}
                </td>
                <td className="num">{formatSen(p.total_cost_sen)}</td>
                <td className="num">{formatSen(p.revised_sen)}</td>
                <td className="num">{formatSen(p.estimate_sen)}</td>
                <td>
                  <CitationLink year={year} source="MOF" docUrl={url} pdfPage={p.pdf_page} bookPage={p.book_page} />
                </td>
              </tr>,
            );
            return rows;
          })}
        </tbody>
      </table>
    </div>
  );
}
