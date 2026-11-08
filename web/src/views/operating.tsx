import { getVoteSummaries, getFiscalTotals, type SortKey } from "@/lib/queries/overview";
import { utilisation, type Sen } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import { Band, BiLabel, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Money, Term, money } from "@/components/Figures";
import { getFederalSpending } from "@/lib/queries/spending";
import { titleCase } from "@/lib/queries/sankey";
import { getLoadedYears, requireYear } from "@/lib/years";
import YearNav from "@/components/YearNav";
import UtilBar from "@/components/UtilBar";
import SourceNotes from "@/components/SourceNotes";
import { getSourceNotes } from "@/lib/queries/gaps";
import { cn } from "@/lib/cn";
import { previews } from "@/lib/previews";
import type { Page, RouteContext } from "@/lib/route";

function sortParam(raw: string | undefined): SortKey {
  if (raw === "revised_sen" || raw === "actual_sen") return raw;
  return "code";
}

function SortLink({ year, col, current, label }: { year: number; col: SortKey; current: SortKey; label: string }) {
  const active = col === current;
  return (
    <a
      href={`/${year}/operating?sort=${col}`}
      aria-current={active ? "true" : undefined}
      className={cn("no-underline hover:underline", active ? "text-foreground font-semibold" : "text-charcoal-700")}
    >
      {label}
      {active && " ↓"}
    </a>
  );
}

export default async function operatingPage({ params, searchParams }: RouteContext): Promise<Page> {
  const year = await requireYear(params.year ?? "");
  const sort = sortParam(searchParams.get("sort") ?? undefined);
  const [votes, totals, spending, years, notes] = await Promise.all([
    getVoteSummaries(year, sort),
    getFiscalTotals(year),
    getFederalSpending(year),
    getLoadedYears(),
    getSourceNotes(year),
  ]);

  const head = {
    title: `Operating expenditure ${year}`,
    description: `What it cost to run the Malaysian federal government in ${year}, vote by vote: the approved budget, the revised budget and what was spent, from the audited statement.`,
    og: previews.year(year),
  };

  if (!totals || !spending) {
    return {
      head,
      body: (
        <Band wide>
          <p>No statement has been loaded for {year} yet.</p>
        </Band>
      ),
    };
  }

  const pct = utilisation(totals.total_revised_sen, totals.total_actual_sen);

  return {
    head,
    body: (
      <>
        <PageHeader
          wide
          eyebrow={`Operating expenditure · ${year}`}
          title={`Operating spending ${year}`}
          intro={
            <p>
              What it cost to run the government in {year}, <Term id="vote">vote</Term> by vote: the budget Parliament
              approved, the budget as revised during the year, and what was spent. From the audited Statement of
              Operating Expenditure (<span lang="ms">Perbelanjaan Mengurus</span>, Lampiran 1).{" "}
              <a href="/methodology">How these numbers are checked.</a>
            </p>
          }
        >
          <YearNav year={year} years={years} suffix="/operating" />
        </PageHeader>
        <SourceNotes notes={notes} />

        <StatRow
          stats={[
            { label: <BiLabel en="Original budget" ms="Anggaran Asal" />, ...money(totals.total_original_sen) },
            {
              label: <BiLabel en="Revised budget" ms="Jumlah" />,
              ...money(totals.total_revised_sen),
              sub: <Term id="original-revised">after changes during the year</Term>,
            },
            { label: <BiLabel en="Spent" ms="Sebenar" />, ...money(totals.total_actual_sen) },
            { label: <BiLabel en="% used" ms="Prestasi" />, value: `${pct.toFixed(1)}%`, sub: "of the revised budget" },
          ]}
        />

        {(totals.charged_revised_sen > 0 || totals.supply_revised_sen > 0) && (
          <StatRow
            stats={[
              {
                label: <BiLabel en="Supply votes (B), spent" ms="Bekalan" />,
                ...money(totals.supply_actual_sen),
                sub: (
                  <>
                    of a revised <Money sen={totals.supply_revised_sen} />; voted by Parliament each year
                  </>
                ),
              },
              {
                label: <BiLabel en="Charged votes (T), spent" ms="Tanggungan" />,
                ...money(totals.charged_actual_sen),
                sub: (
                  <>
                    of a revised <Money sen={totals.charged_revised_sen} />; charged by law, such as debt service and
                    pensions
                  </>
                ),
              },
            ]}
          />
        )}

        <Band wide>
          <p className="max-w-xl text-charcoal-800">
            Totals as printed in the statement (<span lang="ms">Jumlah Keseluruhan Mengurus</span>),{" "}
            <CitationLink year={year} docUrl={totals.doc_url} pdfPage={totals.pdf_page} bookPage={totals.book_page} />.
            Spending here includes the <Money sen={spending.development_fund_transfer_sen} /> transfer to the
            Development Fund (<span lang="ms">Kumpulan Wang Pembangunan</span>,{" "}
            <CitationLink
              year={year}
              docUrl={spending.doc_url}
              pdfPage={spending.transfer_pdf_page}
              bookPage={spending.transfer_book_page}
            />
            ), which pays for <Term id="operating-development">development</Term> spending; the{" "}
            <a href={`/${year}`}>year&apos;s total</a> counts that money once. data.gov.my reports operating expenditure
            without it.
          </p>
        </Band>

        <Band wide>
          <H2>Every operating vote</H2>
          <p className="mt-3 max-w-xl text-charcoal-800">
            <Term id="vote-codes">B votes</Term> are ministries&apos; supply votes; T votes are charged expenditure.
            Open a vote for every line to the sen.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-charcoal-700">Sort by:</span>
            <SortLink year={year} col="code" current={sort} label="Vote code" />
            <SortLink year={year} col="revised_sen" current={sort} label="Revised budget" />
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
                {votes.map((v) => {
                  const over = v.actual_sen > v.revised_sen;
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
                        <Money sen={v.original_sen} />
                      </td>
                      <td className="num">
                        <Money sen={v.revised_sen} />
                      </td>
                      <td className={`num ${over ? "over-budget" : ""}`}>
                        <Money sen={v.actual_sen} />
                      </td>
                      <td>
                        <UtilBar revised={v.revised_sen} actual={v.actual_sen} />
                      </td>
                      <td className={`num ${over ? "over-budget" : ""}`}>
                        <Money sen={(v.revised_sen - v.actual_sen) as Sen} />
                      </td>
                      <td>
                        <CitationLink year={year} docUrl={v.doc_url} pdfPage={v.pdf_page} bookPage={v.book_page} />
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
