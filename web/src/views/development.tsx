import {
  getDevelopmentPlan,
  getDevelopmentStatementTotal,
  getDevelopmentVotes,
  type DevelopmentSortKey,
} from "@/lib/queries/development";
import { utilisation } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import { Band, BiLabel, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Money, Term, money } from "@/components/Figures";
import UtilBar from "@/components/UtilBar";
import { getLoadedYears, requireYear } from "@/lib/years";
import { planName } from "@/lib/plans";
import { getOriginalDevelopmentBudget } from "@/lib/queries/budget";
import { titleCase } from "@/lib/queries/sankey";
import YearNav from "@/components/YearNav";
import { cn } from "@/lib/cn";
import { previews } from "@/lib/previews";
import type { Page, RouteContext } from "@/lib/route";

function sortParam(raw: string | undefined): DevelopmentSortKey {
  return raw === "estimate_sen" || raw === "actual_sen" ? raw : "code";
}

function SortLink({
  year,
  col,
  current,
  label,
}: {
  year: number;
  col: DevelopmentSortKey;
  current: DevelopmentSortKey;
  label: string;
}) {
  const active = col === current;
  return (
    <a
      href={`/${year}/development?sort=${col}`}
      aria-current={active ? "true" : undefined}
      className={cn("no-underline hover:underline", active ? "text-foreground font-semibold" : "text-charcoal-700")}
    >
      {label}
      {active && " ↓"}
    </a>
  );
}

export default async function developmentPage({ params, searchParams }: RouteContext): Promise<Page> {
  const year = await requireYear(params.year ?? "");
  const sort = sortParam(searchParams.get("sort") ?? undefined);
  const [votes, total, years, plan, original] = await Promise.all([
    getDevelopmentVotes(year, sort),
    getDevelopmentStatementTotal(year),
    getLoadedYears(),
    getDevelopmentPlan(year),
    getOriginalDevelopmentBudget(year),
  ]);
  const planCode = plan ?? "Plan";

  const head = { title: `Development expenditure ${year}`, og: previews.year(year) };

  if (!total) {
    return {
      head,
      body: (
        <Band wide>
          <p>No development statement has been loaded for {year} yet.</p>
        </Band>
      ),
    };
  }

  return {
    head,
    body: (
      <>
        <PageHeader
          wide
          eyebrow={`Development expenditure · ${year}`}
          title={`Development spending ${year}`}
          intro={
            <p>
              Spending on projects under the{" "}
              {plan === "RMKe-12" ? (
                <Term id="rmke-12">{planName(plan)}</Term>
              ) : plan ? (
                planName(plan)
              ) : (
                "current Malaysia Plan"
              )}
              , by <Term id="vote-codes">development (P) vote</Term>. From the audited Statement of Development
              Expenditure (<span lang="ms">Perbelanjaan Pembangunan</span>, Lampiran 2).{" "}
              <a href="/methodology">How these numbers are checked.</a>
            </p>
          }
        >
          <YearNav year={year} years={years} suffix="/development" />
        </PageHeader>

        <StatRow
          stats={[
            { label: <BiLabel en={`Estimate ${year}`} ms="Anggaran" />, ...money(total.estimate_sen) },
            { label: <BiLabel en={`Spent ${year}`} ms="Sebenar" />, ...money(total.actual_sen) },
            {
              label: <BiLabel en="% used" ms="Prestasi" />,
              value: `${utilisation(total.estimate_sen, total.actual_sen).toFixed(1)}%`,
              sub: "of the estimate",
            },
            {
              label: <BiLabel en={`${planCode} spent to date`} ms={`Sebenar ${planCode}`} />,
              ...money(total.plan_actual_to_date_sen),
            },
          ]}
        />

        <Band wide>
          <p className="max-w-xl text-charcoal-800">
            Totals as printed (<span lang="ms">Jumlah Perbelanjaan Pembangunan</span>),{" "}
            <CitationLink
              year={year}
              docUrl={total.doc_url}
              pdfPage={total.pdf_page}
              bookPage={total.book_page}
              spread
            />
            .{" "}
            {original && (
              <>
                The estimate is the year&apos;s allocation as the statement prints it; Budget {year} first allocated{" "}
                <Money sen={original.development_sen} /> for development, including a{" "}
                <Money sen={original.contingency_sen} /> contingency reserve (
                <CitationLink
                  year={original.budget_year}
                  source="MOF"
                  docUrl={original.url}
                  pdfPage={original.pdf_page}
                  bookPage={original.book_page}
                />
                ).{" "}
              </>
            )}
            <Money sen={total.actual_loan_sen} /> of the year&apos;s spending was loan-funded (
            <span lang="ms">Pinjaman</span>); the rest was paid directly (<span lang="ms">Cara Langsung</span>). The
            total cost of all projects (<span lang="ms">Kos Keseluruhan</span>) is <Money sen={total.total_cost_sen} />.
            {total.footnote && (
              <>
                {" "}
                The statement notes: <q lang="ms">{total.footnote.replace(/^\*\s*/, "")}</q>
              </>
            )}
          </p>
        </Band>

        <Band wide>
          <H2>Every development vote</H2>
          <p className="mt-3 max-w-xl text-charcoal-800">Open a vote for every project to the sen.</p>
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-charcoal-700">Sort by:</span>
            <SortLink year={year} col="code" current={sort} label="Vote code" />
            <SortLink year={year} col="estimate_sen" current={sort} label="Estimate" />
            <SortLink year={year} col="actual_sen" current={sort} label="Spent" />
          </div>

          <div className="table-scroll mt-6">
            <table>
              <thead>
                <tr>
                  <th>
                    <BiLabel en="Code" ms="Kod" />
                  </th>
                  <th>
                    <BiLabel en="Vote" ms="Maksud Perbelanjaan" />
                  </th>
                  <th className="text-right">
                    <BiLabel en={`Estimate ${year}`} ms="Anggaran" />
                  </th>
                  <th className="text-right">
                    <BiLabel en={`Spent ${year}`} ms="Sebenar" />
                  </th>
                  <th>
                    <BiLabel en="% used" ms="Prestasi" />
                  </th>
                  <th className="text-right">
                    <BiLabel en={`${planCode} to date`} ms={`Sebenar ${planCode}`} />
                  </th>
                  <th>
                    <BiLabel en="Source" ms="Sumber" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {votes.map((v) => {
                  const over = v.actual_sen > v.estimate_sen;
                  const href = `/${year}/vote/${voteCodeToSlug(v.code)}`;
                  return (
                    <tr key={v.code}>
                      <td className="font-mono text-xs whitespace-nowrap">
                        <a href={href}>{v.code}</a>
                      </td>
                      <td lang="ms">
                        <a href={href}>{titleCase(v.name_ms)}</a>
                      </td>
                      <td className="num">
                        <Money sen={v.estimate_sen} />
                      </td>
                      <td className={`num ${over ? "over-budget" : ""}`}>
                        <Money sen={v.actual_sen} />
                      </td>
                      <td>
                        <UtilBar revised={v.estimate_sen} actual={v.actual_sen} />
                      </td>
                      <td className="num">
                        <Money sen={v.plan_actual_to_date_sen} />
                      </td>
                      <td>
                        <CitationLink
                          year={year}
                          docUrl={v.doc_url}
                          pdfPage={v.pdf_page}
                          bookPage={v.book_page}
                          spread
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Band>
      </>
    ),
  };
}
