// Layout adapted from CanadaSpends' department pages (MIT, Build Canada). Every sentence here is
// computed from the loaded statements and budget book; nothing is written by hand per ministry.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartContainer, H1, H2, InternalLink, Intro, P, Page, PageContent, Section } from "@/components/Layout";
import { StatCard, StatCardContainer } from "@/components/StatCard";
import YearBars from "@/components/YearBars";
import {
  getBudgetForVotes,
  getDevelopmentGroups,
  getLatestMinistries,
  getMinistry,
  getProgrammeSpending,
} from "@/lib/queries/ministry";
import { getFederalSpending } from "@/lib/queries/spending";
import { titleCase } from "@/lib/queries/sankey";
import { formatSen, formatSenCompact, parseSen } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import { slugify } from "@/lib/slug";

interface Props {
  params: Promise<{ slug: string }>;
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

export default async function MinistryPage({ params }: Props) {
  const ministry = await getMinistry((await params).slug);
  if (!ministry) notFound();
  const { latest, years } = ministry;
  const year = latest.fiscal_year;
  const name = titleCase(latest.name_ms);
  const codes = [latest.operating_vote_code, latest.development_vote_code].filter((c): c is string => c !== null);

  const [spending, programmes, groups, budget, others] = await Promise.all([
    getFederalSpending(year),
    latest.operating_vote_code ? getProgrammeSpending(year, latest.operating_vote_code) : [],
    latest.development_vote_code ? getDevelopmentGroups(year, latest.development_vote_code) : [],
    getBudgetForVotes(codes),
    getLatestMinistries(),
  ]);
  if (!spending) notFound();

  const history = [...years].sort((a, b) => a.fiscal_year - b.fiscal_year);
  const first = history[0];
  const renamed = history.filter((h) => h.name_ms !== latest.name_ms);
  const budgetByYear = (fy: number) =>
    budget?.rows.filter((r) => r.fiscal_year === fy).reduce((s, r) => s + r.total_sen, 0) ?? 0;
  const tabled = budget ? budgetByYear(budget.budget_year) : 0;

  return (
    <Page>
      <PageContent>
        <Section>
          <div className="mb-2 font-mono text-sm text-gray-500">{codes.join(" · ")}</div>
          <H1>{name}</H1>
          <Intro>
            {latest.operating_vote_code && latest.development_vote_code
              ? `Its operating spending is vote ${latest.operating_vote_code} and its development spending vote ${latest.development_vote_code} in the federal accounts.`
              : latest.operating_vote_code
                ? `Its spending is vote ${latest.operating_vote_code} (operating) in the federal accounts; it has no development vote.`
                : `Its spending is vote ${latest.development_vote_code} (development) in the federal accounts.`}
          </Intro>
        </Section>

        <Section>
          <StatCardContainer>
            <StatCard title={`In ${year},`} value={formatSenCompact(latest.actual_sen)} subtitle={`was spent by ${name}`} />
            <StatCard title={`In ${year},`} value={`${(latest.share * 100).toFixed(1)}%`} subtitle={`of federal spending was by ${name}`} />
          </StatCardContainer>
        </Section>

        <Section>
          <P>
            {name} spent {formatSen(latest.actual_sen)} in {year}
            {latest.operating_vote_code && latest.development_vote_code && (
              <>
                : {formatSen(latest.operating_actual_sen)} on operating and {formatSen(latest.development_actual_sen)} on
                development
              </>
            )}
            . This was {(latest.share * 100).toFixed(1)}% of the {formatSen(spending.total_actual_sen)} in overall federal
            spending. It ranked {ordinal(latest.rank)} of {others.length} ministries and departments in total spending.
          </P>
          {first && first.fiscal_year !== year && first.actual_sen > 0 && (
            <P>
              Since {first.fiscal_year}, its spending has{" "}
              {latest.actual_sen >= first.actual_sen ? "risen" : "fallen"}{" "}
              {Math.abs(((latest.actual_sen - first.actual_sen) / first.actual_sen) * 100).toFixed(1)}%, from{" "}
              {formatSenCompact(first.actual_sen)}, before adjusting for inflation.
              {renamed.length > 0 &&
                ` Under the same vote number it was printed as ${[...new Set(renamed.map((r) => titleCase(r.name_ms)))].join(", ")} in ${renamed.map((r) => r.fiscal_year).join(", ")}; reorganisations can move programmes between ministries.`}
            </P>
          )}
          <ChartContainer>
            <YearBars
              rows={history.map((h) => ({
                year: h.fiscal_year,
                operating: h.operating_actual_sen,
                development: h.development_actual_sen,
                name: titleCase(h.name_ms),
              }))}
            />
          </ChartContainer>
        </Section>

        {programmes.length > 0 && latest.operating_vote_code && (
          <Section>
            <H2>How did {name} spend its operating budget in {year}?</H2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Programme</th>
                    <th className="text-right">Budget (revised)</th>
                    <th className="text-right">Spent</th>
                    <th className="text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {programmes.map((p) => (
                    <tr key={p.code}>
                      <td>{titleCase(p.name_ms)}</td>
                      <td className="num">{formatSen(p.revised_sen)}</td>
                      <td className="num">{formatSen(p.actual_sen)}</td>
                      <td className="num">
                        {latest.operating_actual_sen > 0 ? `${((p.actual_sen / latest.operating_actual_sen) * 100).toFixed(1)}%` : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P className="mt-3 text-sm">
              <InternalLink href={`/${year}/vote/${voteCodeToSlug(latest.operating_vote_code)}`}>
                Every activity and spending category, with sources
              </InternalLink>
            </P>
          </Section>
        )}

        {groups.length > 0 && latest.development_vote_code && (
          <Section>
            <H2>Development projects in {year}</H2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Agency or programme</th>
                    <th className="text-right">Estimate</th>
                    <th className="text-right">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.name}>
                      <td>{titleCase(g.name)}</td>
                      <td className="num">{formatSen(g.estimate_sen)}</td>
                      <td className="num">{formatSen(g.actual_sen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P className="mt-3 text-sm">
              <InternalLink href={`/${year}/vote/${voteCodeToSlug(latest.development_vote_code)}`}>
                Every project, with sources
              </InternalLink>
            </P>
          </Section>
        )}

        {budget && tabled > 0 && (
          <Section>
            <H2>Budget {budget.budget_year}</H2>
            <P>
              Budget {budget.budget_year} as tabled allocates {formatSen(parseSen(tabled))} to{" "}
              {codes.join(" and ")}, against {formatSen(parseSen(budgetByYear(budget.budget_year - 1)))} in the{" "}
              {budget.budget_year - 1} budget and {formatSen(latest.actual_sen)} spent in {year}.{" "}
              <Link href={`/budget/${budget.budget_year}/vote/${voteCodeToSlug(codes[0])}`}>See the budget by programme</Link>.
            </P>
          </Section>
        )}

        <Section>
          <H2>Other ministries</H2>
          <div className="leading-relaxed mb-4">
            {others
              .filter((m) => m.number !== latest.number)
              .map((m) => (
                <div key={m.number} className="py-3 border-b border-gray-200">
                  <InternalLink href={`/ministries/${slugify(m.name_ms)}`} className="font-medium text-gray-600">
                    {titleCase(m.name_ms)}
                  </InternalLink>
                </div>
              ))}
          </div>
        </Section>
      </PageContent>
    </Page>
  );
}
