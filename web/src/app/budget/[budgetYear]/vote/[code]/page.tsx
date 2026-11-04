import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBudgetOperatingHeadings,
  getBudgetProjects,
  getBudgetSource,
  getBudgetTotals,
  getBudgetVotes,
  getBudgetYears,
  type BudgetHeadingRow,
  type BudgetProjectRow,
} from "@/lib/queries/budget";
import { getBudgetVoteYears, getMinistryLink } from "@/lib/queries/vote-nav";
import { titleCase } from "@/lib/queries/sankey";
import { getLoadedYears } from "@/lib/years";
import { parseSen } from "@/lib/money";
import { slugToVoteCode, voteCodeToSlug } from "@/lib/citations";
import { columnLabel, columnLabelMs, requireBudgetYear } from "@/lib/budgetYear";
import { Band, BiLabel, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Money, Term, change, formatRinggit, money } from "@/components/Figures";
import { VoteCrumbs, VoteYears } from "@/components/VoteNav";

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
  const [source, totals, votes, loadedYears, budgetYears, voteYears, ministry] = await Promise.all([
    getBudgetSource(year),
    getBudgetTotals(year),
    getBudgetVotes(year),
    getLoadedYears(),
    getBudgetYears(),
    getBudgetVoteYears(code),
    getMinistryLink(code, null),
  ]);
  const vote = votes.find((v) => v.vote_code === code);
  const name = voteYears.find((v) => v.year === year)?.name_ms ?? vote?.heading;
  if (!source || !vote || !name) notFound();
  const development = code.startsWith("P.");
  const [headings, projects] = await Promise.all([
    development ? Promise.resolve([]) : getBudgetOperatingHeadings(year, code),
    development ? getBudgetProjects(year, code) : Promise.resolve([]),
  ]);
  const spentYear = loadedYears.find((y) => totals.some((t) => t.fiscal_year === y && t.basis === "actual"));
  const prior = totals.at(-2)?.fiscal_year ?? year - 1;
  const kind = development
    ? "development (P) vote"
    : code.startsWith("T")
      ? "charged expenditure (T) vote"
      : "supply (B) vote";
  const amount = (i: number) => vote.amounts[i] ?? parseSen(0);

  return (
    <>
      <PageHeader
        wide
        eyebrow={
          <VoteCrumbs
            section={{ label: "Budget", href: `/budget/${budgetYears[0]}` }}
            year={{ label: year, href: `/budget/${year}` }}
            ministry={ministry}
            code={code}
          />
        }
        title={<span lang="ms">{titleCase(name)}</span>}
        intro={
          <p>
            A <Term id="vote-codes">{kind}</Term> in Budget {year}: what the Ministry of Finance&apos;s budget book sets
            aside for it in {year}, beside the {prior} budget and what it spent in the two years before.
          </p>
        }
      >
        <VoteYears year={year} years={voteYears} name={name} hrefFor={(y) => `/budget/${y}/vote/${slug}`} />
        <p className="mt-4 text-sm text-charcoal-700">
          <Link href={`/budget/${year}`}>All votes in Budget {year}</Link>
          {spentYear && (
            <>
              {" · "}
              <Link href={`/${spentYear}/vote/${voteCodeToSlug(code)}`}>What it spent in {spentYear}</Link>
            </>
          )}
        </p>
      </PageHeader>

      <StatRow
        stats={totals.map((t, i) => ({
          label: <BiLabel en={columnLabel(t.fiscal_year, t.basis)} ms={columnLabelMs(t.basis)} />,
          ...money(amount(i), true),
          sub:
            i === totals.length - 1 ? (
              <>
                {change(amount(i), amount(i - 1))} on the {prior} budget ·{" "}
                <CitationLink
                  year={year}
                  source="MOF"
                  docUrl={source.url}
                  pdfPage={vote.pdf_page}
                  bookPage={vote.book_page}
                />
              </>
            ) : undefined,
        }))}
      />

      {development ? (
        <Projects year={year} url={source.url} prior={prior} projects={projects} />
      ) : (
        <Headings year={year} url={source.url} prior={prior} headings={headings} />
      )}

      <Band wide>
        <p className="max-w-3xl text-sm text-charcoal-700">
          Vote figures as printed in the budget summary. Activities and projects are listed as the {year} budget defines
          them; codes are reused across years for different activities, so they are not matched to past spending line by
          line. Source: Kementerian Kewangan, <em lang="ms">Anggaran Perbelanjaan Persekutuan {year}</em>.
        </p>
      </Band>
    </>
  );
}

function HeadingCells({ year, url, h }: { year: number; url: string; h: BudgetHeadingRow }) {
  return (
    <>
      <td className="num">{formatRinggit(h.prior_estimate_sen)}</td>
      <td className="num">{formatRinggit(h.estimate_sen)}</td>
      <td className="num">{change(h.estimate_sen, h.prior_estimate_sen)}</td>
      <td className="num">{h.posts === null ? "–" : h.posts.toLocaleString("en-MY")}</td>
      <td>
        <CitationLink year={year} source="MOF" docUrl={url} pdfPage={h.pdf_page} bookPage={h.book_page} />
      </td>
    </>
  );
}

function HeadingHead({ year, prior, label }: { year: number; prior: number; label: React.ReactNode }) {
  return (
    <thead>
      <tr>
        <th>
          <BiLabel en="Code" ms="Kod" />
        </th>
        <th>{label}</th>
        <th className="text-right">
          <BiLabel en={`Budget ${prior}`} ms="Anggaran" />
        </th>
        <th className="text-right">
          <BiLabel en={`Budget ${year}`} ms="Anggaran" />
        </th>
        <th className="text-right">Change</th>
        <th className="text-right">
          <BiLabel en={`Posts ${year}`} ms="Bil. Jawatan" />
        </th>
        <th>
          <BiLabel en="Source" ms="Sumber" />
        </th>
      </tr>
    </thead>
  );
}

function Headings({
  year,
  url,
  prior,
  headings,
}: {
  year: number;
  url: string;
  prior: number;
  headings: BudgetHeadingRow[];
}) {
  const programmes = headings.filter((h) => h.code.endsWith("0000"));
  const activities = (p: BudgetHeadingRow) =>
    headings.filter((h) => h.programme_code === p.code && !h.code.endsWith("0000"));
  return (
    <>
      <Band wide>
        <H2>By programme</H2>
        <p className="mt-3 max-w-3xl text-charcoal-800">
          Each <Term id="programme-activity">programme</Term>&apos;s total as the book prints it, in whole ringgit, with
          its established <Term id="posts">posts</Term>. Open a programme below for its activities.
        </p>
        <div className="table-scroll mt-8">
          <table>
            <HeadingHead year={year} prior={prior} label={<BiLabel en="Programme" ms="Program" />} />
            <tbody>
              {programmes.map((p) => (
                <tr key={p.code}>
                  <td className="font-mono text-xs">{p.code}</td>
                  <td lang="ms">
                    <a href={`#p${p.code}`}>{titleCase(p.name_ms)}</a>
                  </td>
                  <HeadingCells year={year} url={url} h={p} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>

      <Band wide>
        <H2>Every activity</H2>
        <div className="mt-8 border-t-2 border-foreground">
          {programmes.map((p) => {
            const acts = activities(p);
            return (
              <details key={p.code} id={`p${p.code}`} className="group/prog border-b border-border scroll-mt-4">
                <summary className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-linen-100">
                  <span
                    aria-hidden="true"
                    className="font-mono text-charcoal-700 group-open/prog:rotate-90 transition-transform"
                  >
                    ›
                  </span>
                  <span className="flex-1 min-w-[16rem]">
                    <span className="font-mono text-xs text-charcoal-700 mr-2">{p.code}</span>
                    <span lang="ms" className="font-medium">
                      {titleCase(p.name_ms)}
                    </span>
                  </span>
                  <span className="text-sm text-charcoal-700">
                    {acts.length} activit{acts.length === 1 ? "y" : "ies"}
                  </span>
                  <span className="text-sm">
                    Budget {year} <Money sen={p.estimate_sen} whole />
                  </span>
                </summary>
                <div className="table-scroll pb-8">
                  <table>
                    <HeadingHead year={year} prior={prior} label={<BiLabel en="Activity" ms="Aktiviti" />} />
                    <tbody>
                      {acts.map((h) => (
                        <tr key={h.code}>
                          <td className="font-mono text-xs">{h.code}</td>
                          <td lang="ms">{titleCase(h.name_ms)}</td>
                          <HeadingCells year={year} url={url} h={h} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      </Band>
    </>
  );
}

function Projects({
  year,
  url,
  prior,
  projects,
}: {
  year: number;
  url: string;
  prior: number;
  projects: BudgetProjectRow[];
}) {
  let lastGroup: number | null = null;
  return (
    <Band wide>
      <H2>Every project</H2>
      <p className="mt-3 max-w-3xl text-charcoal-800">Each project as the book prints it, in whole ringgit.</p>
      <div className="table-scroll mt-8">
        <table>
          <thead>
            <tr>
              <th>
                <BiLabel en="Code" ms="Kod" />
              </th>
              <th>
                <BiLabel en="Project" ms="Tajuk" />
              </th>
              <th className="text-right">
                <BiLabel en="Total cost" ms="Jumlah Anggaran Harga Projek" />
              </th>
              <th className="text-right">
                <BiLabel en={`Revised budget ${prior}`} ms="Anggaran Dipinda" />
              </th>
              <th className="text-right">
                <BiLabel en={`Budget ${year}`} ms="Anggaran" />
              </th>
              <th>
                <BiLabel en="Source" ms="Sumber" />
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.flatMap((p) => {
              const rows = [];
              if (p.group_ordinal !== lastGroup && p.group_name) {
                rows.push(
                  <tr key={`g${p.group_ordinal}`} className="bg-linen-200">
                    <td colSpan={6} className="font-semibold" lang="ms">
                      {titleCase(p.group_name)}
                    </td>
                  </tr>,
                );
              }
              lastGroup = p.group_ordinal;
              rows.push(
                <tr key={p.code}>
                  <td className="font-mono text-xs">{p.code}</td>
                  <td lang="ms">
                    {p.name_ms}
                    {p.estimate_loan_sen > 0 && (
                      <span lang="en" className="block text-xs text-charcoal-700">
                        {formatRinggit(p.estimate_loan_sen)} loan-funded
                      </span>
                    )}
                  </td>
                  <td className="num">{formatRinggit(p.total_cost_sen)}</td>
                  <td className="num">{formatRinggit(p.revised_sen)}</td>
                  <td className="num">{formatRinggit(p.estimate_sen)}</td>
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
    </Band>
  );
}
