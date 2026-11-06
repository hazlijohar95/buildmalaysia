import { LuChevronRight } from "react-icons/lu";
import SourceNotes from "@/components/SourceNotes";
import { getSourceNotes } from "@/lib/queries/gaps";
import { notFound } from "@/lib/abort";
import {
  getVoteHeader,
  getProgrammeTotals,
  getActivityTotals,
  getLeafLines,
  type ActivityTotal,
  type LeafLine,
} from "@/lib/queries/vote-detail";
import { formatSen, utilisation, type Sen } from "@/lib/money";
import { slugToVoteCode, voteCodeToSlug } from "@/lib/citations";
import { Band, BiLabel, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Money, Term, money } from "@/components/Figures";
import UtilBar from "@/components/UtilBar";
import { VoteCrumbs, VoteYears } from "@/components/VoteNav";
import { getDevelopmentPlan, getDevelopmentVote } from "@/lib/queries/development";
import { getPairedVote } from "@/lib/queries/spending";
import { titleCase } from "@/lib/queries/sankey";
import { getMinistryLink, getVoteYears } from "@/lib/queries/vote-nav";
import DevelopmentVote from "@/components/DevelopmentVote";
import { getLoadedYears, requireYear } from "@/lib/years";
import { getBudgetVotes, getBudgetYears } from "@/lib/queries/budget";
import { previews } from "@/lib/previews";
import Segments from "@/components/Segments";
import type { Page, RouteContext } from "@/lib/route";

export default async function voteDetailPage({ params }: RouteContext): Promise<Page> {
  const yearSegment = params.year ?? "";
  const slug = params.code ?? "";
  const year = await requireYear(yearSegment);
  const voteCode = slugToVoteCode(slug);
  const [paired, budget, ministry, voteYears, [latestYear]] = await Promise.all([
    getPairedVote(year, voteCode),
    budgetFor(voteCode),
    getMinistryLink(voteCode, year),
    getVoteYears(voteCode),
    getLoadedYears(),
  ]);
  const crumbs = (
    <VoteCrumbs
      section={{ label: "By year", href: `/${latestYear}` }}
      year={{ label: year, href: `/${year}` }}
      ministry={ministry}
      code={voteCode}
    />
  );
  const hrefFor = (y: number) => `/${y}/vote/${slug}`;

  if (voteCode.startsWith("P.")) {
    const [detail, plan] = await Promise.all([getDevelopmentVote(year, voteCode), getDevelopmentPlan(year)]);
    if (!detail) notFound();
    return {
      head: {
        title: `${voteCode} ${titleCase(detail.vote.name_ms)} (${year})`,
        og: previews.year(year),
      },
      body: (
        <DevelopmentVote
          detail={detail}
          year={year}
          plan={plan ?? "Plan"}
          operatingVoteCode={paired}
          budgetYear={budget}
          crumbs={crumbs}
          years={<VoteYears year={year} years={voteYears} name={detail.vote.name_ms} hrefFor={hrefFor} />}
        />
      ),
    };
  }

  const [header, programmes, activities, lines, notes] = await Promise.all([
    getVoteHeader(year, voteCode),
    getProgrammeTotals(year, voteCode),
    getActivityTotals(year, voteCode),
    getLeafLines(year, voteCode),
    getSourceNotes(year, voteCode),
  ]);
  if (!header) notFound();

  const charged = header.section === "charged";
  const varian = (header.revised_sen - header.actual_sen) as Sen;
  const pct = utilisation(header.revised_sen, header.actual_sen);
  const over = header.actual_sen > header.revised_sen;
  const spent = money(header.actual_sen);
  const actsByProg = groupBy(activities, (a) => a.programme_code);
  const linesByActivity = groupBy(lines, (l) => l.activity_code);
  // Statements before FY2021 print no supplementary or virement columns.
  const printsExtras = lines.some((l) => l.supplementary_sen !== null || l.virement_sen !== null);

  return {
    head: {
      title: `${header.code} ${titleCase(header.name_ms)} (${year})`,
      og: previews.year(year),
    },
    body: (
      <>
        <PageHeader
          wide
          eyebrow={crumbs}
          title={<span lang="ms">{titleCase(header.name_ms)}</span>}
          intro={
            <p>
              {charged ? (
                <>
                  A <Term id="vote-codes">charged expenditure (T) vote</Term>: spending charged on the Consolidated Fund
                  by law, not voted each year.
                </>
              ) : (
                <>
                  A <Term id="vote-codes">supply (B) vote</Term>: the <Term id="operating-development">operating</Term>{" "}
                  spending Parliament voted for this ministry.
                </>
              )}{" "}
              What it was given and what it spent in {year}, by{" "}
              <Term id="programme-activity">programme and activity</Term>, from the audited Statement of Operating
              Expenditure.
            </p>
          }
        >
          <VoteYears year={year} years={voteYears} name={header.name_ms} hrefFor={hrefFor} />
          <p className="mt-4 text-sm text-charcoal-700">
            <a href={`/${year}/operating`}>All operating votes in {year}</a>
            {paired && (
              <>
                {" · "}
                <a href={`/${year}/vote/${voteCodeToSlug(paired)}`}>Development vote {paired}</a>
              </>
            )}
            {budget && (
              <>
                {" · "}
                <a href={`/budget/${budget}/vote/${voteCodeToSlug(voteCode)}`}>
                  {voteCode} in Budget {budget}
                </a>
              </>
            )}
          </p>
        </PageHeader>
        <SourceNotes notes={notes} />

        <StatRow
          stats={[
            { label: <BiLabel en="Original budget" ms="Asal" />, ...money(header.original_sen) },
            {
              label: <BiLabel en="Revised budget" ms="Jumlah" />,
              ...money(header.revised_sen),
              sub: <Term id="original-revised">after changes during the year</Term>,
            },
            {
              label: <BiLabel en="Spent" ms="Sebenar" />,
              value: <span className={over ? "over-budget" : undefined}>{spent.value}</span>,
              title: spent.title,
              sub: `${pct.toFixed(1)}% of the revised budget`,
            },
            {
              label: <BiLabel en="Unspent" ms="Varian" />,
              ...money(varian),
              sub: (
                <>
                  Totals as printed,{" "}
                  <CitationLink
                    year={year}
                    docUrl={header.doc_url}
                    pdfPage={header.pdf_page}
                    bookPage={header.book_page}
                  />
                </>
              ),
            },
          ]}
        />

        <Segments
          label="This vote's spending"
          segments={[
            {
              id: "programmes",
              label: "By programme",
              content: (
                <Band wide>
                  <H2>By programme</H2>
                  <p className="mt-3 max-w-xl text-charcoal-800">
                    Each programme&apos;s totals as the statement prints them. Open an activity below for every line to
                    the sen.
                  </p>
                  <div className="table-scroll mt-8">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            <BiLabel en="Code" ms="Kod" />
                          </th>
                          <th>
                            <BiLabel en="Programme" ms="Program" />
                          </th>
                          <th className="text-right">
                            <BiLabel en="Original budget" ms="Asal" />
                          </th>
                          <th className="text-right">
                            <BiLabel en="Revised budget" ms="Jumlah" />
                          </th>
                          <th className="text-right">
                            <BiLabel en="Spent" ms="Sebenar" />
                          </th>
                          <th>
                            <BiLabel en="% used" ms="Prestasi" />
                          </th>
                          <th className="text-right">
                            <BiLabel en="Unspent" ms="Varian" />
                          </th>
                          <th>
                            <BiLabel en="Source" ms="Sumber" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {programmes.map((p) => {
                          const pOver = p.actual_sen > p.revised_sen;
                          return (
                            <tr key={p.programme_code}>
                              <td className="font-mono text-xs">{p.programme_code}</td>
                              <td>
                                <a href={`#p${p.programme_code}`}>
                                  <ProgrammeName name={p.programme_name_ms} />
                                </a>
                              </td>
                              <td className="num">
                                <Money sen={p.original_sen} />
                              </td>
                              <td className="num">
                                <Money sen={p.revised_sen} />
                              </td>
                              <td className={`num ${pOver ? "over-budget" : ""}`}>
                                <Money sen={p.actual_sen} />
                              </td>
                              <td>
                                <UtilBar revised={p.revised_sen} actual={p.actual_sen} />
                              </td>
                              <td className={`num ${pOver ? "over-budget" : ""}`}>
                                <Money sen={(p.revised_sen - p.actual_sen) as Sen} />
                              </td>
                              <td>
                                <CitationLink
                                  year={year}
                                  docUrl={p.doc_url}
                                  pdfPage={p.pdf_page}
                                  bookPage={p.book_page}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Band>
              ),
            },
            {
              id: "activities",
              label: "Every activity",
              content: (
                <Band wide className="group/cols">
                  <H2>Every activity, line by line</H2>
                  <p className="mt-3 max-w-xl text-charcoal-800">
                    Open an activity to see its <Term id="objects">spending categories</Term> exactly as printed, to the
                    sen, each with the page it was read from.
                  </p>
                  {printsExtras ? (
                    <label className="mt-6 inline-flex min-h-11 items-center gap-3 text-sm cursor-pointer">
                      <input type="checkbox" className="h-5 w-5 accent-foreground" />
                      Show the supplementary (Tambahan) and virement (Viremen) columns
                    </label>
                  ) : (
                    <p className="mt-6 text-sm text-charcoal-700">
                      The {year} statement prints the original budget, the revised budget and actual spending only, with
                      no supplementary or virement columns.
                    </p>
                  )}
                  {programmes.map((prog) => (
                    <section key={prog.programme_code} id={`p${prog.programme_code}`} className="mt-12">
                      <h3 className="m-0 font-display text-2xl font-semibold tracking-tight">
                        <span className="font-mono text-sm font-normal text-charcoal-700 mr-3">
                          {prog.programme_code}
                        </span>
                        <ProgrammeName name={prog.programme_name_ms} />
                      </h3>
                      <ActivityHead />
                      {(actsByProg[prog.programme_code] ?? []).map((act) => (
                        <Activity
                          key={act.activity_code}
                          year={year}
                          act={act}
                          lines={linesByActivity[act.activity_code] ?? []}
                        />
                      ))}
                    </section>
                  ))}
                  <p className="mt-12 text-sm text-charcoal-700 max-w-lg">
                    Source: Jabatan Akauntan Negara, <em lang="ms">Penyata Kewangan Kerajaan Persekutuan {year}</em>,
                    Statement of Operating Expenditure (Lampiran 1). % used and unspent are worked out from the printed
                    columns.
                  </p>
                </Band>
              ),
            },
          ]}
        />
      </>
    ),
  };
}

/** The latest budget year whose book has this vote, for a link from the spending page. */
async function budgetFor(voteCode: string): Promise<number | null> {
  const [latest] = await getBudgetYears();
  if (latest === undefined) return null;
  return (await getBudgetVotes(latest)).some((v) => v.vote_code === voteCode) ? latest : null;
}

// Activity rows share one grid so their figures line up like a table's columns.
const ROW = "grid grid-cols-[1.25rem_minmax(0,1fr)] lg:grid-cols-[1.25rem_minmax(0,1fr)_10rem_10rem_9rem] gap-x-4";

function ActivityHead() {
  return (
    <div
      className={`${ROW} mt-4 pb-2 border-b-2 border-foreground font-display text-xs uppercase tracking-[0.04em] text-charcoal-600 max-lg:hidden`}
    >
      <span />
      <BiLabel en="Activity" ms="Aktiviti" />
      <span className="text-right">
        <BiLabel en="Revised budget" ms="Jumlah" />
      </span>
      <span className="text-right">
        <BiLabel en="Spent" ms="Sebenar" />
      </span>
      <BiLabel en="% used" ms="Prestasi" />
    </div>
  );
}

function Activity({ year, act, lines }: { year: number; act: ActivityTotal; lines: LeafLine[] }) {
  const over = act.actual_sen > act.revised_sen;
  return (
    <details id={`a${act.activity_code}`} className="group/act border-b border-border">
      <summary
        className={`${ROW} items-center py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-linen-100`}
      >
        <LuChevronRight
          aria-hidden
          className="h-3 w-3 shrink-0 text-charcoal-700 motion-safe:transition-transform group-open/act:rotate-90"
        />
        <span>
          <span className="font-mono text-xs text-charcoal-700 mr-2">{act.activity_code}</span>
          <span lang="ms">{titleCase(act.activity_name_ms)}</span>
        </span>
        <span className="col-start-2 lg:col-start-auto flex flex-wrap gap-x-4 text-sm lg:contents">
          <span className="lg:text-right">
            <span className="lg:hidden text-charcoal-700">Revised </span>
            <Money sen={act.revised_sen} />
          </span>
          <span className={`lg:text-right ${over ? "over-budget" : ""}`}>
            <span className="lg:hidden text-charcoal-700">Spent </span>
            <Money sen={act.actual_sen} />
          </span>
          <span className="max-lg:w-28">
            <UtilBar revised={act.revised_sen} actual={act.actual_sen} />
          </span>
        </span>
      </summary>
      <div className="pb-8 pt-2">
        <p className="text-sm text-charcoal-700">
          Activity total as printed: revised {formatSen(act.revised_sen)}, spent {formatSen(act.actual_sen)} (
          <CitationLink year={year} docUrl={act.doc_url} pdfPage={act.pdf_page} bookPage={act.book_page} />
          ).
        </p>
        <Lines year={year} lines={lines} />
      </div>
    </details>
  );
}

const EXTRA = "hidden group-has-checked/cols:table-cell";

function Lines({ year, lines }: { year: number; lines: LeafLine[] }) {
  return (
    <div className="table-scroll mt-4">
      <table>
        <thead>
          <tr>
            <th>
              <BiLabel en="Code" ms="Kod" />
            </th>
            <th>
              <BiLabel en="Spending category" ms="Maksud Perbelanjaan" />
            </th>
            <th className="text-right">
              <BiLabel en="Original budget" ms="Asal" />
            </th>
            <th className={`text-right ${EXTRA}`}>
              <BiLabel en="Supplementary" ms="Tambahan/(Kurangan)" />
            </th>
            <th className={`text-right ${EXTRA}`}>
              <BiLabel en="Virement" ms="Viremen" />
            </th>
            <th className="text-right">
              <BiLabel en="Revised budget" ms="Jumlah" />
            </th>
            <th className="text-right">
              <BiLabel en="Spent" ms="Sebenar" />
            </th>
            <th>
              <BiLabel en="% used" ms="Prestasi" />
            </th>
            <th className="text-right">
              <BiLabel en="Unspent" ms="Varian" />
            </th>
            <th>
              <BiLabel en="Source" ms="Sumber" />
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const over = l.actual_sen > l.revised_sen;
            return (
              <tr key={l.object_code}>
                <td className="font-mono text-xs">{l.object_code}</td>
                <td>
                  {l.object_name_en}
                  <span lang="ms" className="block text-xs text-charcoal-600">
                    {l.object_name_ms}
                  </span>
                </td>
                <td className="num">{formatSen(l.original_sen)}</td>
                <td className={`num ${EXTRA}`}>
                  {l.supplementary_sen === null ? "–" : formatSen(l.supplementary_sen)}
                </td>
                <td className={`num ${EXTRA}`}>{l.virement_sen === null ? "–" : formatSen(l.virement_sen)}</td>
                <td className="num">{formatSen(l.revised_sen)}</td>
                <td className={`num ${over ? "over-budget" : ""}`}>{formatSen(l.actual_sen)}</td>
                <td>
                  <UtilBar revised={l.revised_sen} actual={l.actual_sen} />
                </td>
                <td className={`num ${over ? "over-budget" : ""}`}>
                  {formatSen((l.revised_sen - l.actual_sen) as Sen)}
                </td>
                <td>
                  <CitationLink year={year} docUrl={l.doc_url} pdfPage={l.pdf_page} bookPage={l.book_page} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}

/** A few programmes have no heading in the statement; say so rather than invent one. */
function ProgrammeName({ name }: { name: string | null }) {
  return name ? (
    <span lang="ms">{titleCase(name)}</span>
  ) : (
    <span className="text-charcoal-700">Name not printed in the statement</span>
  );
}
