// After CanadaSpends' department pages (MIT, Build Canada). Every sentence is computed from the loaded
// statements and budget book; nothing is written by hand per ministry.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Band, H2, PageHeader, StatRow, kicker } from "@/components/Boxed";
import StackedBars from "@/components/StackedBars";
import YearNav from "@/components/YearNav";
import SourceNotes from "@/components/SourceNotes";
import { getSourceNotes } from "@/lib/queries/gaps";
import { cn } from "@/lib/cn";
import { voteCodeToSlug } from "@/lib/citations";
import { formatSen, formatSenCompact, parseSen, type Sen } from "@/lib/money";
import {
  getBudgetForVotes,
  getDevelopmentGroups,
  getMinistriesForYear,
  getMinistry,
  getMinistrySlugs,
  getProgrammeSpending,
  getTopProjects,
} from "@/lib/queries/ministry";
import { titleCase } from "@/lib/queries/sankey";
import { getFederalSpending } from "@/lib/queries/spending";
import { colours } from "@/styles/colours";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ year?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ministry = await getMinistry((await params).slug);
  return { title: ministry ? titleCase(ministry.latest.name_ms) : "Ministry not found" };
}

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

export default async function MinistryPage({ params, searchParams }: Props) {
  const [{ slug }, { year: yearParam }] = await Promise.all([params, searchParams]);
  const ministry = await getMinistry(slug);
  if (!ministry) notFound();
  if (slug !== ministry.canonical) {
    permanentRedirect(`/ministries/${ministry.canonical}${yearParam ? `?year=${yearParam}` : ""}`);
  }

  const { years } = ministry;
  const current = years.find((y) => y.fiscal_year === Number(yearParam)) ?? ministry.latest;
  const year = current.fiscal_year;
  const name = titleCase(ministry.latest.name_ms);
  const printedName = titleCase(current.name_ms);
  const codes = [current.operating_vote_code, current.development_vote_code].filter((c): c is string => c !== null);
  const devCode = current.development_vote_code;
  const latestCodes = [ministry.latest.operating_vote_code, ministry.latest.development_vote_code].filter(
    (c): c is string => c !== null,
  );

  const [spending, programmes, groups, budget, peers, slugs, notes] = await Promise.all([
    getFederalSpending(year),
    current.operating_vote_code ? getProgrammeSpending(year, current.operating_vote_code) : [],
    devCode ? getDevelopmentGroups(year, devCode) : [],
    getBudgetForVotes(latestCodes),
    getMinistriesForYear(year),
    getMinistrySlugs(),
    // Only its operating figures come from the statement the caveats are about.
    current.operating_vote_code ? getSourceNotes(year, current.operating_vote_code) : null,
  ]);
  if (!spending) notFound();
  const ungrouped = groups.length === 1 && groups[0].name === "Other projects";
  const projects = devCode && ungrouped ? await getTopProjects(year, devCode) : [];

  const history = [...years].sort((a, b) => a.fiscal_year - b.fiscal_year);
  const first = history[0];
  const renamed = [
    ...new Set(history.filter((h) => h.name_ms !== ministry.latest.name_ms).map((h) => titleCase(h.name_ms))),
  ];
  const budgetFor = (fy: number) =>
    budget?.rows.filter((r) => r.fiscal_year === fy).reduce((s, r) => s + r.total_sen, 0) ?? 0;
  const tabled = budget ? budgetFor(budget.budget_year) : 0;
  const rankIndex = peers.findIndex((p) => p.number === current.number);
  const prev = rankIndex > 0 ? peers[rankIndex - 1] : null;
  const next = rankIndex >= 0 && rankIndex < peers.length - 1 ? peers[rankIndex + 1] : null;
  const neighbourClass =
    "bg-background px-6 py-8 md:px-10 no-underline text-foreground hover:bg-linen-200 sm:[&:nth-child(2)]:text-right";

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Link href={`/ministries?year=${year}`} className="text-charcoal-700 no-underline hover:underline">
              Ministries
            </Link>{" "}
            · {codes.join(" · ")}
          </>
        }
        title={<span lang="ms">{name}</span>}
        intro={
          <p>
            {current.operating_vote_code && devCode
              ? `Its running costs are supply vote ${current.operating_vote_code} and its projects development vote ${devCode}.`
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
              : <Amount sen={current.operating_actual_sen} /> on running costs and{" "}
              <Amount sen={current.development_actual_sen} /> on development projects
            </>
          )}
          . That was {(current.share * 100).toFixed(1)}% of federal spending.
          {renamed.length > 0 &&
            ` Under the same vote number it has also been printed as ${renamed.join(", ")}; reorganisations can move programmes between ministries.`}
        </p>
        <div className="mt-10">
          <StackedBars
            label={`${name} spending by year`}
            series={[
              { label: "Operating", color: colours.auburn[800] },
              { label: "Development", color: colours.lake[700] },
            ]}
            rows={history.map((h) => ({
              year: h.fiscal_year,
              values: [h.operating_actual_sen, h.development_actual_sen],
              title: `${h.fiscal_year}: ${titleCase(h.name_ms)}, ${formatSenCompact(h.actual_sen)}`,
            }))}
          />
        </div>
      </Band>

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
            <Link href={`/${year}/vote/${voteCodeToSlug(current.operating_vote_code)}`}>
              Every activity and spending category in {current.operating_vote_code}, with sources
            </Link>
          </p>
        </Band>
      )}

      {devCode && (groups.length > 0 || projects.length > 0) && (
        <Band>
          <H2>{projects.length > 0 ? `Largest development projects in ${year}` : `Development spending in ${year}`}</H2>
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
            <Link href={`/${year}/vote/${voteCodeToSlug(devCode)}`}>Every project in {devCode}, with sources</Link>
          </p>
        </Band>
      )}

      {budget && tabled > 0 && latestCodes[0] && (
        <Band>
          <H2>Budget {budget.budget_year}</H2>
          <p className="mt-4 max-w-3xl text-lg">
            Budget {budget.budget_year} as tabled allocates <Amount sen={parseSen(tabled)} /> to{" "}
            <span lang="ms">{name}</span>, against <Amount sen={parseSen(budgetFor(budget.budget_year - 1))} /> in the{" "}
            {budget.budget_year - 1} budget.{" "}
            <Link href={`/budget/${budget.budget_year}/vote/${voteCodeToSlug(latestCodes[0])}`}>
              See the budget by programme
            </Link>
            .
          </p>
        </Band>
      )}

      <nav
        className="grid grid-cols-1 sm:grid-cols-2 border-b-2 border-foreground bg-foreground gap-[2px]"
        aria-label="Other ministries"
      >
        {[prev, next].map((m, i) =>
          m ? (
            <Link key={i} href={`/ministries/${slugs.get(m.number)}?year=${year}`} className={neighbourClass}>
              <span className={cn(kicker, "text-charcoal-700")}>
                {i === 0 ? `← Larger · ${ordinal(m.rank)}` : `Smaller · ${ordinal(m.rank)} →`}
              </span>
              <span lang="ms" className="mt-2 block font-display text-2xl font-semibold tracking-tight">
                {titleCase(m.name_ms)}
              </span>
              <span className="text-sm text-charcoal-700">{formatSenCompact(m.actual_sen)}</span>
            </Link>
          ) : (
            <Link key={i} href={`/ministries?year=${year}`} className={neighbourClass}>
              <span className={cn(kicker, "text-charcoal-700")}>All ministries</span>
              <span className="mt-2 block font-display text-2xl font-semibold tracking-tight">See the full list</span>
            </Link>
          ),
        )}
      </nav>
    </>
  );
}
