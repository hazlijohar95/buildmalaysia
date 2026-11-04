import Link from "next/link";
import type {
  DevelopmentAmounts,
  DevelopmentGroupTotal,
  DevelopmentProjectRow,
  DevelopmentVoteDetail,
  SpreadSource,
} from "@/lib/queries/development";
import { formatSen, utilisation } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import { titleCase } from "@/lib/queries/sankey";
import { planName } from "@/lib/plans";
import { Band, BiLabel, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Money, Term, money } from "@/components/Figures";
import UtilBar from "@/components/UtilBar";

/** A run of projects printed under one heading, or a parent total that sums the groups above it. */
type Section =
  | { kind: "projects"; group: DevelopmentGroupTotal | null; projects: DevelopmentProjectRow[] }
  | { kind: "parent"; group: DevelopmentGroupTotal; members: DevelopmentGroupTotal[] };

/** Sections in print order. Projects arrive in print order; a parent goes after its last member. */
function sections({ groups, projects }: DevelopmentVoteDetail): Section[] {
  const byOrdinal = new Map(groups.map((g) => [g.ordinal, g]));
  const out: Section[] = [];
  for (const project of projects) {
    const last = out.at(-1);
    if (last?.kind === "projects" && (last.group?.ordinal ?? null) === project.group_ordinal) {
      last.projects.push(project);
    } else {
      const group = project.group_ordinal === null ? null : (byOrdinal.get(project.group_ordinal) ?? null);
      out.push({ kind: "projects", group, projects: [project] });
    }
  }
  for (const parent of groups) {
    const members = groups.filter((g) => g.parent_ordinal === parent.ordinal);
    if (!members.length) continue;
    const after = out.findLastIndex((s) => s.kind === "projects" && s.group?.parent_ordinal === parent.ordinal);
    out.splice(after + 1, 0, { kind: "parent", group: parent, members });
  }
  return out;
}

export default function DevelopmentVote({
  detail,
  year,
  plan,
  operatingVoteCode,
  budgetYear,
  crumbs,
  years,
}: {
  detail: DevelopmentVoteDetail;
  year: number;
  plan: string;
  operatingVoteCode: string | null;
  budgetYear: number | null;
  crumbs: React.ReactNode;
  years: React.ReactNode;
}) {
  const { vote } = detail;
  const over = vote.actual_sen > vote.estimate_sen;
  const spent = money(vote.actual_sen);
  const all = sections(detail);
  const grouped = detail.groups.length > 0;
  const planTerm =
    plan === "RMKe-12" ? (
      <Term id="rmke-12">{planName(plan)}</Term>
    ) : plan === "Plan" ? (
      "current Malaysia Plan"
    ) : (
      planName(plan)
    );

  return (
    <>
      <PageHeader
        wide
        eyebrow={crumbs}
        title={<span lang="ms">{titleCase(vote.name_ms)}</span>}
        intro={
          <p>
            A <Term id="vote-codes">development (P) vote</Term>: spending on this ministry&apos;s projects under the{" "}
            {planTerm}. What each project was allocated and spent in {year}, from the audited Statement of Development
            Expenditure.
          </p>
        }
      >
        {years}
        <p className="mt-4 text-sm text-charcoal-700">
          <Link href={`/${year}/development`}>All development votes in {year}</Link>
          {operatingVoteCode && (
            <>
              {" · "}
              <Link href={`/${year}/vote/${voteCodeToSlug(operatingVoteCode)}`}>
                Operating vote {operatingVoteCode}
              </Link>
            </>
          )}
          {budgetYear && (
            <>
              {" · "}
              <Link href={`/budget/${budgetYear}/vote/${voteCodeToSlug(vote.code)}`}>
                {vote.code} in Budget {budgetYear}
              </Link>
            </>
          )}
        </p>
      </PageHeader>

      <StatRow
        stats={[
          { label: <BiLabel en={`Estimate ${year}`} ms="Anggaran" />, ...money(vote.estimate_sen) },
          {
            label: <BiLabel en={`Spent ${year}`} ms="Sebenar" />,
            value: <span className={over ? "over-budget" : undefined}>{spent.value}</span>,
            title: spent.title,
            sub: (
              <>
                {utilisation(vote.estimate_sen, vote.actual_sen).toFixed(1)}% of the estimate
                {vote.actual_loan_sen > 0 && (
                  <>
                    ; <Money sen={vote.actual_loan_sen} /> loan-funded
                  </>
                )}
              </>
            ),
          },
          { label: <BiLabel en="Total cost of projects" ms="Kos Keseluruhan" />, ...money(vote.total_cost_sen) },
          {
            label: <BiLabel en={`${plan} spent to date`} ms={`Sebenar ${plan}`} />,
            ...money(vote.plan_actual_to_date_sen),
            sub: (
              <>
                Totals as printed, <Cite year={year} source={vote} />
              </>
            ),
          },
        ]}
      />

      {grouped && (
        <Band wide>
          <H2>By group</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            The statement prints the vote&apos;s projects under these headings, each with its own total. Hover a figure
            for the exact amount, or open a group below for every project to the sen.
          </p>
          <div className="table-scroll mt-8">
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th className="!text-right">
                    <BiLabel en={`Estimate ${year}`} ms="Anggaran" />
                  </th>
                  <th className="!text-right">
                    <BiLabel en={`Spent ${year}`} ms="Sebenar" />
                  </th>
                  <th>
                    <BiLabel en="% used" ms="Prestasi" />
                  </th>
                  <th className="!text-right">
                    <BiLabel en={`${plan} to date`} ms={`Sebenar ${plan}`} />
                  </th>
                  <th>
                    <BiLabel en="Source" ms="Sumber" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {all.map((s, i) =>
                  s.group === null ? null : (
                    <tr key={i} className={s.kind === "parent" ? "font-semibold" : undefined}>
                      <td lang="ms">
                        {s.kind === "parent" ? (
                          <>
                            Jumlah {titleCase(s.group.name_ms)}
                            <span className="block text-xs font-normal text-charcoal-700">
                              sums {s.members.map((m) => titleCase(m.name_ms)).join(", ")}
                            </span>
                          </>
                        ) : (
                          <a href={`#g${s.group.ordinal}`}>{titleCase(s.group.name_ms)}</a>
                        )}
                      </td>
                      <GroupFigures year={year} amounts={s.group} source={s.group} />
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </Band>
      )}

      <Band wide>
        <H2>Every project</H2>
        <p className="mt-3 max-w-3xl text-charcoal-800">
          Each project exactly as printed, to the sen, with the two-page spread it was read from.
        </p>
        {grouped ? (
          <div className="mt-8 border-t-2 border-foreground">
            {all.map((s, i) =>
              s.kind === "projects" ? (
                <details
                  key={i}
                  id={s.group ? `g${s.group.ordinal}` : undefined}
                  className="group/sec border-b border-border scroll-mt-4"
                >
                  <summary className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-linen-100">
                    <span
                      aria-hidden="true"
                      className="font-mono text-charcoal-700 group-open/sec:rotate-90 transition-transform"
                    >
                      ›
                    </span>
                    <span lang="ms" className="font-medium flex-1 min-w-[16rem]">
                      {s.group ? titleCase(s.group.name_ms) : "Projects printed without a group subtotal"}
                    </span>
                    <span className="text-sm text-charcoal-700">
                      {s.projects.length} project{s.projects.length === 1 ? "" : "s"}
                    </span>
                    {s.group && (
                      <span className="text-sm">
                        Estimate <Money sen={s.group.estimate_sen} /> · Spent <Money sen={s.group.actual_sen} />
                      </span>
                    )}
                  </summary>
                  <div className="pb-8">
                    {s.group === null && (
                      <p className="text-sm text-charcoal-700">
                        These projects count toward the vote total but are not printed under a group heading.
                      </p>
                    )}
                    <Projects year={year} plan={plan} projects={s.projects} />
                  </div>
                </details>
              ) : null,
            )}
          </div>
        ) : (
          <Projects year={year} plan={plan} projects={detail.projects} />
        )}
        <p className="mt-12 text-sm text-charcoal-700 max-w-3xl">
          Source: Jabatan Akauntan Negara, <em lang="ms">Penyata Kewangan Kerajaan Persekutuan {year}</em>, Statement of
          Development Expenditure (Lampiran 2).
        </p>
      </Band>
    </>
  );
}

function GroupFigures({ year, amounts, source }: { year: number; amounts: DevelopmentAmounts; source: SpreadSource }) {
  const over = amounts.actual_sen > amounts.estimate_sen;
  return (
    <>
      <td className="num">
        <Money sen={amounts.estimate_sen} />
      </td>
      <td className={`num ${over ? "over-budget" : ""}`}>
        <Money sen={amounts.actual_sen} />
      </td>
      <td>
        {amounts.estimate_sen > 0 || amounts.actual_sen > 0 ? (
          <UtilBar revised={amounts.estimate_sen} actual={amounts.actual_sen} />
        ) : null}
      </td>
      <td className="num">
        <Money sen={amounts.plan_actual_to_date_sen} />
      </td>
      <td>
        <Cite year={year} source={source} />
      </td>
    </>
  );
}

function Projects({ year, plan, projects }: { year: number; plan: string; projects: DevelopmentProjectRow[] }) {
  return (
    <div className="table-scroll mt-4">
      <table>
        <thead>
          <tr>
            <th>
              <BiLabel en="Code" ms="Kod" />
            </th>
            <th>
              <BiLabel en="Project" ms="Maksud Perbelanjaan" />
            </th>
            <th className="!text-right">
              <BiLabel en="Total cost" ms="Kos Keseluruhan" />
            </th>
            <th className="!text-right">
              <BiLabel en={`Estimate ${year}`} ms="Anggaran" />
            </th>
            <th className="!text-right">
              <BiLabel en={`Spent ${year}`} ms="Sebenar" />
            </th>
            <th>
              <BiLabel en="% used" ms="Prestasi" />
            </th>
            <th className="!text-right">
              <BiLabel en={`${plan} to date`} ms={`Sebenar ${plan}`} />
            </th>
            <th>
              <BiLabel en="Source" ms="Sumber" />
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const over = p.actual_sen > p.estimate_sen;
            return (
              <tr key={p.code}>
                <td className="font-mono text-xs">{p.code}</td>
                <td lang="ms">
                  {p.name_ms}
                  {p.footnote && (
                    <span className="block text-xs mt-0.5 text-charcoal-700">
                      Note: {p.footnote.replace(/^\*/, "")}
                    </span>
                  )}
                </td>
                <td className="num">{formatSen(p.total_cost_sen)}</td>
                <td className="num">{formatSen(p.estimate_sen)}</td>
                <td className={`num ${over ? "over-budget" : ""}`}>{formatSen(p.actual_sen)}</td>
                <td>
                  {p.estimate_sen > 0 || p.actual_sen > 0 ? (
                    <UtilBar revised={p.estimate_sen} actual={p.actual_sen} />
                  ) : null}
                </td>
                <td className="num">{formatSen(p.plan_actual_to_date_sen)}</td>
                <td>
                  <Cite year={year} source={p} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cite({ year, source }: { year: number; source: SpreadSource }) {
  return (
    <CitationLink year={year} docUrl={source.doc_url} pdfPage={source.pdf_page} bookPage={source.book_page} spread />
  );
}
