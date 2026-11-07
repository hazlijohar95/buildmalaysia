// After CanadaSpends' department pages (MIT, Build Canada). Every sentence is computed from the loaded
// statements and budget book; nothing is written by hand per ministry.
import { notFound, permanentRedirect } from "@/lib/abort";
import { Band, H2, PageHeader, StatRow, kicker } from "@/components/Boxed";
import StackedBars from "@/components/StackedBars";
import Segments from "@/components/Segments";
import YearNav from "@/components/YearNav";
import SourceNotes from "@/components/SourceNotes";
import { getSourceNotes } from "@/lib/queries/gaps";
import { cn } from "@/lib/cn";
import { voteCodeToSlug } from "@/lib/citations";
import { formatDate } from "@/lib/dates";
import { formatSen, formatSenCompact, parseSen, type Sen } from "@/lib/money";
import {
  getBudgetForVotes,
  getDevelopmentGroups,
  getMinistriesForYear,
  getMinistry,
  getProgrammeSpending,
  getTopProjects,
  type BodyAlias,
  type Citation,
  type LineageLink,
  type VoteTenure,
} from "@/lib/queries/ministry";
import { titleCase } from "@/lib/queries/sankey";
import { getFederalSpending } from "@/lib/queries/spending";
import { slugify } from "@/lib/slug";
import { getLoadedYears } from "@/lib/years";
import { SERIES } from "@/styles/charts/series";
import { previews } from "@/lib/previews";
import type { Page, RouteContext } from "@/lib/route";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Compact figure with the exact one on hover. */
function Amount({ sen }: { sen: Sen }) {
  return (
    <span className="tabular-nums whitespace-nowrap" title={formatSen(sen)}>
      {formatSenCompact(sen)}
    </span>
  );
}

/** Acronyms are printed as given; other names are title-cased like the rest of the site. */
const aliasText = (a: Pick<BodyAlias, "name_ms" | "origin">) =>
  a.origin === "acronym" ? a.name_ms : titleCase(a.name_ms);

function Source({ citation }: { citation: Citation }) {
  return (
    <a href={citation.url} target="_blank" rel="noopener noreferrer" title={citation.title}>
      {citation.locator ?? citation.title}
    </a>
  );
}

const Confidence = ({ level }: { level: LineageLink["confidence"] }) =>
  level === "high" ? null : <span className="text-charcoal-700"> ({level} confidence)</span>;

function BodyLink({ body }: { body: LineageLink["body"] }) {
  return (
    <a href={`/ministries/${body.slug}`} lang="ms">
      {titleCase(body.name_ms)}
    </a>
  );
}

/** "since 10 Mar 2020", "before 2016 to 2 Jul 2018", "10 Mar 2020 to 3 Dec 2022". */
function aliasPeriod(a: BodyAlias, firstYear: number): string {
  const from = a.valid_from === null ? `before ${firstYear}` : formatDate(a.valid_from);
  return a.valid_to === null ? `since ${from}` : `${from} to ${formatDate(a.valid_to)}`;
}

/** "B/P.33 was held by Kementerian Alam Sekitar dan Air from 2020 to 2023, then by this ministry since 2024." */
function tenureSentence(number: string, tenures: VoteTenure[], ownId: string): React.ReactNode {
  const span = (t: VoteTenure) =>
    t.to_year === null
      ? `since ${t.from_year}`
      : t.from_year === t.to_year
        ? `in ${t.from_year}`
        : `from ${t.from_year} to ${t.to_year}`;
  const runs: { body: VoteTenure["body"]; spans: string[] }[] = [];
  for (const t of tenures) {
    const last = runs[runs.length - 1];
    if (last && last.body.id === t.body.id) last.spans.push(span(t));
    else runs.push({ body: t.body, spans: [span(t)] });
  }
  return (
    <>
      B/P.{number} was held by{" "}
      {runs.map((r, i) => (
        <span key={i}>
          {i > 0 && ", then by "}
          {r.body.id === ownId ? "this ministry" : <BodyLink body={r.body} />} {r.spans.join(" and ")}
        </span>
      ))}
      .
    </>
  );
}

export default async function ministryPage({ params, searchParams }: RouteContext): Promise<Page> {
  const slug = params.slug ?? "";
  const yearParam = searchParams.get("year") ?? undefined;
  const ministry = await getMinistry(slug);
  if (!ministry) notFound();
  if (slug !== ministry.canonical) {
    permanentRedirect(`/ministries/${ministry.canonical}${yearParam ? `?year=${yearParam}` : ""}`);
  }

  const { body, years, aliases, lineage, tenures } = ministry;
  const current = years.find((y) => y.fiscal_year === Number(yearParam)) ?? ministry.latest;
  const year = current.fiscal_year;
  const name = titleCase(body.name_ms);
  const printedName = titleCase(current.name_ms);
  const codes = [current.operating_vote_code, current.development_vote_code].filter((c): c is string => c !== null);
  const devCode = current.development_vote_code;
  const latestCodes = [ministry.latest.operating_vote_code, ministry.latest.development_vote_code].filter(
    (c): c is string => c !== null,
  );

  const [spending, programmes, groups, budget, peers, loadedYears, notes] = await Promise.all([
    getFederalSpending(year),
    current.operating_vote_code ? getProgrammeSpending(year, current.operating_vote_code) : [],
    devCode ? getDevelopmentGroups(year, devCode) : [],
    getBudgetForVotes(latestCodes),
    getMinistriesForYear(year),
    getLoadedYears(),
    // Only its operating figures come from the statement the caveats are about.
    current.operating_vote_code ? getSourceNotes(year, current.operating_vote_code) : null,
  ]);
  if (!spending) notFound();
  const ungrouped = groups.length === 1 && groups[0].name === "Other projects";
  const projects = devCode && ungrouped ? await getTopProjects(year, devCode) : [];

  const history = [...years].sort((a, b) => a.fiscal_year - b.fiscal_year);
  const first = history[0];
  const firstLoadedYear = loadedYears[loadedYears.length - 1] ?? first.fiscal_year;
  const numbers = [...new Set(tenures.map((t) => t.number))];
  const sharedNumbers = numbers.filter((n) => tenures.filter((t) => t.number === n).length > 1);
  const budgetFor = (fy: number) =>
    budget?.rows.filter((r) => r.fiscal_year === fy).reduce((s, r) => s + r.total_sen, 0) ?? 0;
  const tabled = budget ? budgetFor(budget.budget_year) : 0;
  const rankIndex = peers.findIndex((p) => p.body_id === body.id);
  const prev = rankIndex > 0 ? peers[rankIndex - 1] : null;
  const next = rankIndex >= 0 && rankIndex < peers.length - 1 ? peers[rankIndex + 1] : null;
  const neighbourClass =
    "bg-background px-6 py-8 md:px-10 no-underline text-foreground hover:bg-linen-200 sm:[&:nth-child(2)]:text-right";

  return {
    head: { title: titleCase(body.name_ms), og: previews.ministry(slug) },
    body: (
      <>
        <PageHeader
          eyebrow={
            <>
              <a href={`/ministries?year=${year}`} className="text-charcoal-700 no-underline hover:underline">
                Ministries
              </a>{" "}
              · {codes.join(" · ")}
            </>
          }
          title={<span lang="ms">{name}</span>}
          intro={
            <p>
              {current.operating_vote_code && devCode
                ? `Its operating spending is supply vote ${current.operating_vote_code} and its projects development vote ${devCode}.`
                : current.operating_vote_code
                  ? `Its spending is supply vote ${current.operating_vote_code}; it has no development vote.`
                  : `Its spending is development vote ${devCode}.`}
              {printedName !== name && ` In ${year} it was printed as ${printedName}.`}
            </p>
          }
        >
          <YearNav
            year={year}
            years={years.map((y) => y.fiscal_year)}
            hrefFor={(y) => `/ministries/${ministry.canonical}?year=${y}`}
          />
        </PageHeader>
        {notes && <SourceNotes notes={notes} />}

        <StatRow
          stats={[
            {
              label: `Spent in ${year}`,
              value: formatSenCompact(current.actual_sen),
              title: formatSen(current.actual_sen),
            },
            {
              label: "Share of federal spending",
              value: `${(current.share * 100).toFixed(1)}%`,
              sub: `of ${formatSenCompact(spending.total_actual_sen)}`,
            },
            { label: "Rank", value: ordinal(current.rank), sub: `of ${peers.length} ministries and departments` },
            ...(first && first.fiscal_year !== year && first.actual_sen > 0
              ? [
                  {
                    label: `Change since ${first.fiscal_year}`,
                    value: `${current.actual_sen >= first.actual_sen ? "+" : ""}${(((current.actual_sen - first.actual_sen) / first.actual_sen) * 100).toFixed(1)}%`,
                    sub: "before inflation",
                  },
                ]
              : []),
          ]}
        />

        <Band>
          <p className="max-w-3xl text-lg">
            <span lang="ms">{printedName}</span> spent <Amount sen={current.actual_sen} /> in {year}
            {current.operating_vote_code && devCode && (
              <>
                : <Amount sen={current.operating_actual_sen} /> on operating spending and{" "}
                <Amount sen={current.development_actual_sen} /> on development projects
              </>
            )}
            . That was {(current.share * 100).toFixed(1)}% of federal spending.
            {ministry.residual.map((r) => (
              <span key={r.fiscal_year}>
                {" "}
                {[r.operating_vote_code, r.development_vote_code].filter((c) => c !== null).join(" and ")} was still
                printed, with nothing spent, in {r.fiscal_year}.
              </span>
            ))}
          </p>
          <div className="mt-10">
            <StackedBars
              label={`${name} spending by year`}
              series={[
                { label: "Operating", color: SERIES[0].hex },
                { label: "Development", color: SERIES[1].hex },
              ]}
              rows={history.map((h) => ({
                year: h.fiscal_year,
                values: [h.operating_actual_sen, h.development_actual_sen],
                title: `${h.fiscal_year}: ${titleCase(h.name_ms)}, ${formatSenCompact(h.actual_sen)}`,
              }))}
            />
          </div>
        </Band>

        <Segments
          label="This ministry"
          segments={[
            ...((programmes.length > 0 && current.operating_vote_code) ||
            (devCode && (groups.length > 0 || projects.length > 0))
              ? [
                  {
                    id: "spending",
                    label: "Spending",
                    content: (
                      <>
                        {programmes.length > 0 && current.operating_vote_code && (
                          <Band>
                            <H2>Where its operating budget went in {year}</H2>
                            <div className="table-scroll mt-8">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Programme</th>
                                    <th className="text-right">Revised budget</th>
                                    <th className="text-right">Spent</th>
                                    <th className="text-right">Share</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {programmes.map((p) => (
                                    <tr key={p.code}>
                                      <td lang="ms">{titleCase(p.name_ms)}</td>
                                      <td className="num">
                                        <Amount sen={p.revised_sen} />
                                      </td>
                                      <td className="num">
                                        <Amount sen={p.actual_sen} />
                                      </td>
                                      <td className="num">
                                        {current.operating_actual_sen > 0
                                          ? `${((p.actual_sen / current.operating_actual_sen) * 100).toFixed(1)}%`
                                          : "–"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <p className="mt-4 text-sm">
                              <a href={`/${year}/vote/${voteCodeToSlug(current.operating_vote_code)}`}>
                                Every activity and spending category in {current.operating_vote_code}, with sources
                              </a>
                            </p>
                          </Band>
                        )}

                        {devCode && (groups.length > 0 || projects.length > 0) && (
                          <Band>
                            <H2>
                              {projects.length > 0
                                ? `Largest development projects in ${year}`
                                : `Development spending in ${year}`}
                            </H2>
                            <div className="table-scroll mt-8">
                              <table>
                                <thead>
                                  <tr>
                                    <th>{projects.length > 0 ? "Project" : "Agency or programme"}</th>
                                    <th className="text-right">Budget</th>
                                    <th className="text-right">Spent</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(projects.length > 0
                                    ? projects.map((p, i) => ({
                                        key: `${p.code}-${i}`,
                                        name: p.name_ms,
                                        estimate: p.estimate_sen,
                                        actual: p.actual_sen,
                                      }))
                                    : groups.map((g) => ({
                                        key: g.name,
                                        name: titleCase(g.name),
                                        estimate: g.estimate_sen,
                                        actual: g.actual_sen,
                                      }))
                                  ).map((r) => (
                                    <tr key={r.key}>
                                      <td lang="ms">{r.name}</td>
                                      <td className="num">
                                        <Amount sen={r.estimate} />
                                      </td>
                                      <td className="num">
                                        <Amount sen={r.actual} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <p className="mt-4 text-sm">
                              <a href={`/${year}/vote/${voteCodeToSlug(devCode)}`}>
                                Every project in {devCode}, with sources
                              </a>
                            </p>
                          </Band>
                        )}
                      </>
                    ),
                  },
                ]
              : []),
            {
              id: "history",
              label: "History",
              content: (
                <>
                  <Band>
                    <H2>Names</H2>
                    <ul className="mt-6 max-w-3xl list-none m-0 p-0 divide-y divide-border">
                      {aliases.map((a, i) => (
                        <li key={i} className="py-3">
                          <span lang="ms" className="font-medium">
                            {aliasText(a)}
                          </span>
                          <span className="block mt-0.5 text-sm text-charcoal-700">
                            {aliasPeriod(a, firstLoadedYear)} · {a.origin}
                            <Confidence level={a.confidence} /> · <Source citation={a.citation} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Band>

                  {(lineage.length > 0 || sharedNumbers.length > 0) && (
                    <Band>
                      <H2>Lineage</H2>
                      {lineage.length > 0 && (
                        <ul className="mt-6 max-w-3xl list-none m-0 p-0 divide-y divide-border">
                          {lineage.map((e, i) => (
                            <li key={i} className="py-3">
                              {e.whole ? (
                                e.direction === "predecessor" ? (
                                  <>
                                    All of <BodyLink body={e.body} /> became part of this ministry
                                  </>
                                ) : (
                                  <>
                                    All of this ministry became part of <BodyLink body={e.body} />
                                  </>
                                )
                              ) : (
                                <>
                                  <span lang="ms">{e.functions}</span> moved{" "}
                                  {e.direction === "predecessor" ? "from" : "to"} <BodyLink body={e.body} />
                                </>
                              )}{" "}
                              on {formatDate(e.effective)}
                              <Confidence level={e.confidence} />.
                              <span className="block mt-0.5 text-sm text-charcoal-700">
                                <Source citation={e.citation} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {sharedNumbers.map((n) => (
                        <p key={n} className="mt-6 max-w-xl">
                          {tenureSentence(
                            n,
                            tenures.filter((t) => t.number === n),
                            body.id,
                          )}
                        </p>
                      ))}
                    </Band>
                  )}
                </>
              ),
            },
            ...(budget && tabled > 0 && latestCodes[0]
              ? [
                  {
                    id: "budget",
                    label: `Budget ${budget.budget_year}`,
                    content: (
                      <Band>
                        <H2>Budget {budget.budget_year}</H2>
                        <p className="mt-4 max-w-3xl text-lg">
                          Budget {budget.budget_year} as tabled allocates <Amount sen={parseSen(tabled)} /> to{" "}
                          <span lang="ms">{name}</span>, against{" "}
                          <Amount sen={parseSen(budgetFor(budget.budget_year - 1))} /> in the {budget.budget_year - 1}{" "}
                          budget.{" "}
                          <a href={`/budget/${budget.budget_year}/vote/${voteCodeToSlug(latestCodes[0])}`}>
                            See the budget by programme
                          </a>
                          .
                        </p>
                      </Band>
                    ),
                  },
                ]
              : []),
          ]}
        />

        <nav
          className="grid grid-cols-1 sm:grid-cols-2 border-b-2 border-foreground bg-foreground gap-[2px]"
          aria-label="Other ministries"
        >
          {[prev, next].map((m, i) =>
            m ? (
              <a key={i} href={`/ministries/${slugify(m.body_name_ms)}?year=${year}`} className={neighbourClass}>
                <span className={cn(kicker, "text-charcoal-700")}>
                  {i === 0 ? `← Larger · ${ordinal(m.rank)}` : `Smaller · ${ordinal(m.rank)} →`}
                </span>
                <span lang="ms" className="mt-2 block font-display text-2xl font-semibold tracking-tight">
                  {titleCase(m.name_ms)}
                </span>
                <span className="text-sm text-charcoal-700">{formatSenCompact(m.actual_sen)}</span>
              </a>
            ) : (
              <a key={i} href={`/ministries?year=${year}`} className={neighbourClass}>
                <span className={cn(kicker, "text-charcoal-700")}>All ministries</span>
                <span className="mt-2 block font-display text-2xl font-semibold tracking-tight">See the full list</span>
              </a>
            ),
          )}
        </nav>
      </>
    ),
  };
}
