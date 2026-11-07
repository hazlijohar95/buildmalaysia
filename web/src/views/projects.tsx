import {
  costRises,
  getProjectSummaries,
  largestRises,
  projectCounts,
  projectHref,
  steepestRises,
  type CostRise,
} from "@/lib/queries/projects";
import { parseSen } from "@/lib/money";
import { getLoadedYears } from "@/lib/years";
import { Band, BiLabel, H2, PageHeader, StatRow } from "@/components/Boxed";
import { Money } from "@/components/Figures";
import Segments from "@/components/Segments";
import type { Page } from "@/lib/route";

const LISTED = 50;
const PERCENT_FLOOR = parseSen(1_000_000_000); // RM 10 million

export default async function projectsPage(): Promise<Page> {
  const [summaries, years] = await Promise.all([getProjectSummaries(), getLoadedYears()]);
  const counts = projectCounts(summaries, years.length);
  const rises = costRises(summaries);

  return {
    head: {
      title: "Projects across the years",
      description:
        "Every federal development project followed from one audited statement to the next: how its printed total cost changed, and where two statements disagree.",
    },
    body: (
      <>
        <PageHeader
          wide
          eyebrow="Development projects"
          title="Projects across the years"
          intro={
            <p>
              Each development project in the Statements of Development Expenditure, followed from one year to the next.
              Open a project for every year as printed, where its printed total cost changed, and where two statements
              disagree. <a href="/methodology#projects">How projects are followed.</a>
            </p>
          }
        />
        <StatRow
          stats={[
            {
              label: <BiLabel en="Projects followed" ms="Projek" />,
              value: counts.projects.toLocaleString("en-MY"),
              sub: `across ${counts.statements} statements`,
            },
            {
              label: <BiLabel en="Three years or more" ms="Tiga tahun" />,
              value: counts.spanningThree.toLocaleString("en-MY"),
              sub: "projects printed in at least three statements",
            },
            {
              label: <BiLabel en={`All ${counts.statements} years`} ms="Setiap tahun" />,
              value: counts.spanningAll.toLocaleString("en-MY"),
              sub: "projects printed in every statement",
            },
            {
              label: <BiLabel en="Restatements" ms="Dinyatakan semula" />,
              value: counts.restatements.toLocaleString("en-MY"),
              sub: "a year's spending to date printed differently the next year",
            },
          ]}
        />
        <Band wide>
          <H2>Where the printed total cost rose</H2>
          <p className="mt-3 max-w-xl text-charcoal-800">
            Each statement prints a total cost for every project (<span lang="ms">Kos Keseluruhan</span>). These are the
            projects whose printed total cost rose most between the first and the latest statement that printed one. A
            rise can mean a project grew in scope, not only that it cost more than planned.
          </p>
        </Band>
        <Segments
          label="Ranked by"
          segments={[
            {
              id: "ringgit",
              label: "By ringgit",
              content: (
                <Band wide>
                  <h3 className="font-display text-xl font-semibold">By ringgit</h3>
                  <Rises rises={largestRises(rises, LISTED)} />
                </Band>
              ),
            },
            {
              id: "percent",
              label: "By percent",
              content: (
                <Band wide>
                  <h3 className="font-display text-xl font-semibold">By percent</h3>
                  <p className="mt-2 max-w-xl text-sm text-charcoal-700">
                    Projects whose first printed total cost was at least <Money sen={PERCENT_FLOOR} />, so a small
                    starting figure does not top the list.
                  </p>
                  <Rises rises={steepestRises(rises, LISTED, PERCENT_FLOOR)} />
                </Band>
              ),
            },
          ]}
        />
      </>
    ),
  };
}

function Rises({ rises }: { rises: CostRise[] }) {
  return (
    <div className="table-scroll mt-6">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>
              <BiLabel en="Project" ms="Maksud Perbelanjaan" />
            </th>
            <th className="text-right">
              <BiLabel en="First printed" ms="Kos Keseluruhan" />
            </th>
            <th className="text-right">
              <BiLabel en="Latest printed" ms="Kos Keseluruhan" />
            </th>
            <th className="text-right">
              <BiLabel en="Rise" ms="Kenaikan" />
            </th>
            <th className="text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rises.map((r, i) => {
            const { latest } = r.project;
            return (
              <tr key={r.project.chain_id}>
                <td className="text-charcoal-700">{i + 1}</td>
                <td>
                  <a href={projectHref(latest)} lang="ms">
                    {latest.name_ms}
                  </a>
                  <span className="block font-mono text-xs text-charcoal-700">
                    {latest.vote_code} {latest.code}
                  </span>
                </td>
                <td className="num">
                  <Money sen={r.first_sen} />
                  <span className="block text-xs text-charcoal-700">{r.first_year}</span>
                </td>
                <td className="num">
                  <Money sen={r.last_sen} />
                  <span className="block text-xs text-charcoal-700">{r.last_year}</span>
                </td>
                <td className="num">
                  <Money sen={r.rise_sen} />
                </td>
                <td className="num">{r.percent.toFixed(0)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
