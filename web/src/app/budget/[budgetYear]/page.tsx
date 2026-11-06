import type { Metadata } from "next";
import Link from "next/link";
import { LuChevronRight } from "react-icons/lu";
import { notFound } from "next/navigation";
import {
  getBudgetYears,
  getBudgetActualCheck,
  getDroppedProjects,
  type DroppedProjectRow,
  getBudgetSource,
  getBudgetTotals,
  getBudgetVotes,
  type BudgetVoteRow,
  type BudgetYearTotal,
} from "@/lib/queries/budget";
import { getPrintedVoteNames } from "@/lib/queries/vote-nav";
import { titleCase } from "@/lib/queries/sankey";
import { formatSen, parseSen, type Sen } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import { columnLabel, columnLabelMs, requireBudgetYear } from "@/lib/budgetYear";
import { Band, BiLabel, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Money, Term, change, formatRinggit, money } from "@/components/Figures";
import YearNav from "@/components/YearNav";

interface Props {
  params: Promise<{ budgetYear: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Budget ${await requireBudgetYear((await params).budgetYear)}` };
}

const SECTIONS: { letter: string; title: string; note: React.ReactNode }[] = [
  {
    letter: "B",
    title: "Supply votes",
    note: (
      <>
        <Term id="vote-codes">Bekalan (B)</Term>: <Term id="operating-development">operating</Term> spending voted each
        year by Parliament, one vote per ministry or department.
      </>
    ),
  },
  {
    letter: "T",
    title: "Charged votes",
    note: "Tanggungan (T): operating spending charged on the Consolidated Fund by law, such as debt service and pensions.",
  },
  { letter: "P", title: "Development votes", note: "Pembangunan (P): spending on projects, one vote per ministry." },
];

export default async function BudgetPage({ params }: Props) {
  const year = await requireBudgetYear((await params).budgetYear);
  const [source, totals, votes, check, years, dropped, names] = await Promise.all([
    getBudgetSource(year),
    getBudgetTotals(year),
    getBudgetVotes(year),
    getBudgetActualCheck(year),
    getBudgetYears(),
    getDroppedProjects(year),
    getPrintedVoteNames(year),
  ]);
  const proposed = totals.at(-1);
  const current = totals.at(-2);
  if (!source || !proposed || !current) notFound();
  const checked = check.reduce((n, c) => n + c.count, 0);
  const agreed = check.filter((c) => c.result === "matches" || c.result === "rounding");
  const agreedCount = agreed.reduce((n, c) => n + c.count, 0);
  const worst = Math.max(0, ...agreed.map((c) => c.worst_sen));
  const onCurrent = (now: Sen, before: Sen) => `${change(now, before)} on the ${current.fiscal_year} budget`;

  return (
    <>
      <PageHeader
        wide
        eyebrow="Federal budget · Ministry of Finance"
        title={`Budget ${year}`}
        intro={
          <p>
            What the federal government set out to spend in {year} when the budget was tabled, from the Ministry of
            Finance&apos;s <em lang="ms">Anggaran Perbelanjaan Persekutuan {year}</em>, beside the two years already
            spent and the {current.fiscal_year} budget.
          </p>
        }
      >
        {years.length > 1 && <YearNav year={year} years={years} hrefFor={(y) => `/budget/${y}`} />}
      </PageHeader>

      <StatRow
        stats={[
          {
            label: <BiLabel en={`Budget ${year} as tabled`} ms="Jumlah Besar" />,
            ...money(proposed.grand_total_sen, true),
            sub: onCurrent(proposed.grand_total_sen, current.grand_total_sen),
          },
          {
            label: <BiLabel en="Operating" ms="Mengurus" />,
            ...money(proposed.operating_sen, true),
            sub: onCurrent(proposed.operating_sen, current.operating_sen),
          },
          {
            label: <BiLabel en="Development" ms="Pembangunan" />,
            ...money(proposed.development_sen, true),
            sub: onCurrent(proposed.development_sen, current.development_sen),
          },
        ]}
      />

      <Band wide>
        <p className="max-w-xl text-charcoal-800">
          Totals as printed (<span lang="ms">Jumlah Besar</span>,{" "}
          <CitationLink
            year={year}
            source="MOF"
            docUrl={source.url}
            pdfPage={proposed.pdf_page}
            bookPage={proposed.book_page}
          />
          ). Development includes a <Money sen={proposed.contingency_sen} whole /> contingency reserve (P.70,{" "}
          <span lang="ms">Simpanan Luar Jangka</span>). The printed total adds operating and development as they stand,
          so the operating account&apos;s transfer to the Development Fund is counted in both; the spending pages count
          it once.{" "}
          {checked > 0 && (
            <>
              MOF&apos;s printed actuals for {totals[0].fiscal_year} and {totals[1].fiscal_year} agree with the audited
              statements for {agreedCount} of {checked} vote figures
              {worst > 0 ? `, all within ${formatSen(parseSen(worst))}` : ""}.
            </>
          )}
        </p>
      </Band>

      {SECTIONS.map((section) => {
        const rows = votes.filter((v) => v.vote_code.startsWith(section.letter));
        if (!rows.length) return null;
        return (
          <Band wide key={section.letter}>
            <H2>{section.title}</H2>
            <p className="mt-3 max-w-xl text-charcoal-800">{section.note}</p>
            <div className="table-scroll mt-8">
              <table>
                <thead>
                  <tr>
                    <th>
                      <BiLabel en="Vote" ms="Kod" />
                    </th>
                    <th>
                      <BiLabel en="Ministry or department" ms="Maksud Perbelanjaan" />
                    </th>
                    {totals.map((t) => (
                      <th key={t.fiscal_year} className="text-right">
                        <BiLabel en={columnLabel(t.fiscal_year, t.basis)} ms={columnLabelMs(t.basis)} />
                      </th>
                    ))}
                    <th className="text-right">Change</th>
                    <th>
                      <BiLabel en="Source" ms="Sumber" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <VoteRow
                      key={v.vote_code}
                      year={year}
                      url={source.url}
                      vote={v}
                      name={names.get(v.vote_code) ?? v.heading}
                      totals={totals}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Band>
        );
      })}

      {dropped.length > 0 && <Dropped year={year} url={source.url} rows={dropped} />}
    </>
  );
}

function Dropped({ year, url, rows }: { year: number; url: string; rows: DroppedProjectRow[] }) {
  const allocation = parseSen(rows.reduce((sum, r) => sum + r.allocation_sen, 0));
  const repeated = rows.filter((r) => r.printed_times > 1);
  return (
    <Band wide>
      <H2>Projects dropped from Budget {year}</H2>
      <p className="mt-3 max-w-xl text-charcoal-800">
        {rows.length} development projects of {year - 1} that this budget does not continue (Lampiran F), holding{" "}
        <Money sen={allocation} whole /> of {year - 1} allocation. None of them appears in the budget&apos;s project
        tables.
        {repeated.map((r) => (
          <span key={r.code}>
            {" "}
            The appendix prints {r.vote_code} {r.code} {r.printed_times === 2 ? "twice" : `${r.printed_times} times`}{" "}
            and counts it in its total each time; it is listed and counted once here.
          </span>
        ))}
      </p>
      <details className="group/drop mt-8 border-t-2 border-foreground">
        <summary className="flex items-baseline gap-4 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-linen-100">
          <LuChevronRight
            aria-hidden
            className="h-3 w-3 shrink-0 text-charcoal-700 motion-safe:transition-transform group-open/drop:rotate-90"
          />
          <span className="font-medium">Show the {rows.length} projects</span>
        </summary>
        <div className="table-scroll pb-4">
          <table>
            <thead>
              <tr>
                <th>Vote</th>
                <th>
                  <BiLabel en="Code" ms="Kod" />
                </th>
                <th>Project</th>
                <th className="text-right">Total cost</th>
                <th className="text-right">Allocation {year - 1}</th>
                <th>
                  <BiLabel en="Source" ms="Sumber" />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.vote_code}-${r.code}`}>
                  <td className="font-mono text-xs">{r.vote_code}</td>
                  <td className="font-mono text-xs">{r.code}</td>
                  <td lang="ms">{r.name_ms}</td>
                  <td className="num">{formatRinggit(r.total_cost_sen)}</td>
                  <td className="num">{formatRinggit(r.allocation_sen)}</td>
                  <td>
                    <CitationLink year={year} source="MOF" docUrl={url} pdfPage={r.pdf_page} bookPage={r.book_page} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Band>
  );
}

function VoteRow({
  year,
  url,
  vote,
  name,
  totals,
}: {
  year: number;
  url: string;
  vote: BudgetVoteRow;
  name: string;
  totals: BudgetYearTotal[];
}) {
  const [proposed, current] = [vote.amounts.at(-1) ?? parseSen(0), vote.amounts.at(-2) ?? parseSen(0)];
  const href = `/budget/${year}/vote/${voteCodeToSlug(vote.vote_code)}`;
  return (
    <tr>
      <td className="font-mono text-xs whitespace-nowrap">
        <Link href={href}>{vote.vote_code}</Link>
      </td>
      <td lang="ms">
        <Link href={href}>{titleCase(name)}</Link>
        {vote.vote_code === "P.70" && <span className="text-charcoal-700"> (contingency reserve)</span>}
        {vote.note && <span className="block text-xs mt-0.5 text-charcoal-700">Note: {vote.note}</span>}
      </td>
      {totals.map((t, i) => (
        <td key={t.fiscal_year} className={`num ${i === totals.length - 1 ? "font-semibold" : ""}`}>
          {vote.amounts[i] === undefined ? "–" : <Money sen={vote.amounts[i]} whole />}
        </td>
      ))}
      <td className="num">{change(proposed, current)}</td>
      <td>
        <CitationLink year={year} source="MOF" docUrl={url} pdfPage={vote.pdf_page} bookPage={vote.book_page} />
      </td>
    </tr>
  );
}
