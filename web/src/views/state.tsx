// One state's audited statement: revenue by type and operating expenditure by vote, every row linked to the page
// it was read from, with the printed totals the load recomputed from those rows.
import { notFound } from "@/lib/abort";
import { Band, BiLabel, H2, NoteBand, PageHeader, StatRow } from "@/components/Boxed";
import Segments from "@/components/Segments";
import StateCitation from "@/components/StateCitation";
import YearNav from "@/components/YearNav";
import { formatSen, formatSenCompact, type Sen } from "@/lib/money";
import {
  STATE_OPERATING_CATEGORIES,
  STATE_REVENUE_CATEGORIES,
  categoryTotal,
  getStateDetail,
  getStateGaps,
  percentOf,
  stateHref,
  transferNote,
  type PrintedFigure,
  type StateLine,
} from "@/lib/states";
import type { Page, RouteContext } from "@/lib/route";

const cell = (sen: Sen | null) => (sen === null ? "–" : formatSen(sen));

const SCOPE_NOTE: Record<string, string> = {
  statement_less_transfer: "Total less the transfer to the Development Fund, as printed",
  statement_plus_transfer: "Total with the transfer to the Development Fund, as printed",
  transfer: "Moved to the state's Development Fund",
};

export default async function statePage({ params, searchParams }: RouteContext): Promise<Page> {
  const slug = params.slug ?? "";
  const requested = searchParams.get("year");
  const year = requested && /^\d{4}$/.test(requested) ? Number(requested) : undefined;
  const [detail, gaps] = await Promise.all([getStateDetail(slug, year), getStateGaps()]);
  if (!detail) notFound();
  const { summary: s, lines, totals } = detail;
  const cite = (page: number, text?: string) => (
    <StateCitation name={s.name} year={s.year} docUrl={s.url} pdfPage={page} title={text} />
  );
  const revenueTotal = s.revenue.actual ?? 0;
  const tax = categoryTotal(totals.revenue, "hasil_cukai")?.actual ?? null;
  const biggestVote = [...lines.operating].sort((a, b) => b.actual - a.actual)[0];
  const stateGaps = gaps.filter((g) => g.slug === s.slug);

  const totalRow = (t: PrintedFigure, label: string, withPrior: boolean) => (
    <tr className="font-semibold border-t-2 border-foreground" key={`${t.scope}-${t.label}`}>
      <td>
        {label}
        <span lang="ms" className="block text-xs font-normal text-charcoal-700">
          {t.label}
        </span>
      </td>
      <td className="num">{cell(t.original)}</td>
      <td className="num">{cell(t.revised)}</td>
      <td className="num">{cell(t.actual)}</td>
      <td className="num">{withPrior ? cell(t.prior) : percentOf(t.actual, t.revised)}</td>
      <td>{cite(t.pdfPage)}</td>
    </tr>
  );
  const lineRow = (l: StateLine, withPrior: boolean) => (
    <tr key={l.position}>
      <td className="pl-8" lang="ms">
        {l.code && <span className="mr-2 font-mono text-xs text-charcoal-700">{l.code}</span>}
        {l.name}
      </td>
      <td className="num">{cell(l.original)}</td>
      <td className="num">{cell(l.revised)}</td>
      <td className="num">{formatSen(l.actual)}</td>
      <td className="num">{withPrior ? cell(l.prior) : percentOf(l.actual, l.revised)}</td>
      <td>{cite(l.pdfPage, l.sourceText)}</td>
    </tr>
  );
  const head = (fifth: React.ReactNode) => (
    <thead>
      <tr>
        <th>Item</th>
        <th className="text-right">
          <BiLabel en="Original estimate" ms="Anggaran Asal" />
        </th>
        <th className="text-right">
          <BiLabel en="Revised estimate" ms="Anggaran Disemak" />
        </th>
        <th className="text-right">
          <BiLabel en="Actual" ms="Sebenar" />
        </th>
        <th className="text-right">{fifth}</th>
        <th>Source</th>
      </tr>
    </thead>
  );
  const statementTotals = (section: "revenue" | "operating") =>
    totals[section].filter((t) => t.scope !== "category" && t.scope !== "transfer");
  const transfers = totals.operating.filter((t) => t.scope === "transfer");

  return {
    head: {
      title: `${s.name} state finances, ${s.year}`,
      description: `What the ${s.name} state government collected and spent in ${s.year}, from its audited financial statement, with every figure linked to its page.`,
      canonical: stateHref(s.slug, year === undefined || year === detail.years[0] ? undefined : s.year),
    },
    body: (
      <>
        <PageHeader
          eyebrow={
            <>
              <a href="/states">State finances</a> · {s.year}
            </>
          }
          title={s.name}
          intro={
            <p>
              From <em lang="ms">{s.title}</em>, published by {s.publisher}:{" "}
              <a href={s.url} rel="noopener noreferrer" target="_blank">
                the statement (PDF)
              </a>
              . Each row below links to the page it was read from; every category and statement total was recomputed
              from its rows before loading.
            </p>
          }
        >
          {detail.years.length > 1 && (
            <YearNav year={s.year} years={detail.years} hrefFor={(y) => stateHref(s.slug, y)} />
          )}
        </PageHeader>
        <StatRow
          stats={[
            {
              label: `Revenue, ${s.year}`,
              value: s.revenue.actual === null ? "–" : formatSenCompact(s.revenue.actual),
              title: s.revenue.actual === null ? undefined : formatSen(s.revenue.actual),
              sub: cite(s.revenue.pdfPage),
            },
            {
              label: "Operating spending",
              value: s.operating.actual === null ? "–" : formatSenCompact(s.operating.actual),
              title: s.operating.actual === null ? undefined : formatSen(s.operating.actual),
              sub: transferNote(s) ?? cite(s.operating.pdfPage),
            },
            ...(tax !== null && revenueTotal > 0
              ? [{ label: "From taxes", value: `${((tax / revenueTotal) * 100).toFixed(1)}%`, sub: "of revenue" }]
              : []),
            ...(biggestVote
              ? [
                  {
                    label: "Largest vote",
                    value: formatSenCompact(biggestVote.actual),
                    title: formatSen(biggestVote.actual),
                    sub: [biggestVote.code, biggestVote.name].filter(Boolean).join(" "),
                  },
                ]
              : []),
          ]}
        />
        {detail.misprints.map((m) => (
          <NoteBand
            key={`${m.section}-${m.label}-${m.column}`}
            title="A printed total that does not add up"
            tone="copper"
          >
            The statement prints the {m.column} of {m.label} (PDF p. {m.pdfPage}) as {formatSen(m.printed)}; the rows
            above it add up to {formatSen(m.rows)}. Both are shown as printed.
          </NoteBand>
        ))}
        <Segments
          label={s.name}
          segments={[
            {
              id: "revenue",
              label: "Revenue",
              content: (
                <Band wide>
                  <H2>Revenue by type, {s.year}</H2>
                  <p className="mt-3 max-w-2xl text-charcoal-800">
                    The note on revenue by type (Hasil mengikut penjenisannya), with the previous year&apos;s actual
                    from the same page.
                  </p>
                  <div className="table-scroll mt-8">
                    <table>
                      {head(<BiLabel en={String(s.year - 1)} ms="Sebenar" />)}
                      {STATE_REVENUE_CATEGORIES.map((c) => {
                        const rows = lines.revenue.filter((l) => l.category === c.category);
                        const total = categoryTotal(totals.revenue, c.category);
                        if (rows.length === 0) return null;
                        return (
                          <tbody key={c.category}>
                            <tr className="bg-linen-200 font-semibold">
                              <td colSpan={6}>
                                {c.en}{" "}
                                <span lang="ms" className="font-normal text-charcoal-700">
                                  ({c.ms})
                                </span>
                              </td>
                            </tr>
                            {rows.map((l) => lineRow(l, true))}
                            {total && totalRow(total, `${c.en}, total`, true)}
                          </tbody>
                        );
                      })}
                      <tfoot>{statementTotals("revenue").map((t) => totalRow(t, "Total revenue", true))}</tfoot>
                    </table>
                  </div>
                </Band>
              ),
            },
            {
              id: "operating",
              label: "Operating spending",
              content: (
                <Band wide>
                  <H2>Operating spending by vote, {s.year}</H2>
                  <p className="mt-3 max-w-2xl text-charcoal-800">
                    The note on operating expenditure by vote (Perbelanjaan Mengurus mengikut Maksud Perbelanjaan).
                    Charged expenditure is paid under state law without a yearly vote; supply votes are approved by the
                    state assembly.
                  </p>
                  <div className="table-scroll mt-8">
                    <table>
                      {head("Of revised")}
                      {STATE_OPERATING_CATEGORIES.map((c) => {
                        const rows = lines.operating.filter((l) => l.category === c.category);
                        const total = categoryTotal(totals.operating, c.category);
                        if (rows.length === 0) return null;
                        return (
                          <tbody key={c.category}>
                            <tr className="bg-linen-200 font-semibold">
                              <td colSpan={6}>
                                {c.en}{" "}
                                <span lang="ms" className="font-normal text-charcoal-700">
                                  ({c.ms})
                                </span>
                              </td>
                            </tr>
                            {rows.map((l) => lineRow(l, false))}
                            {total && totalRow(total, `${c.en}, total`, false)}
                          </tbody>
                        );
                      })}
                      <tfoot>
                        {[...statementTotals("operating"), ...transfers].map((t) =>
                          totalRow(t, SCOPE_NOTE[t.scope] ?? "Operating spending, every vote", false),
                        )}
                      </tfoot>
                    </table>
                  </div>
                </Band>
              ),
            },
          ]}
        />
        <Band>
          <H2>Not covered</H2>
          <p className="mt-3 max-w-2xl text-charcoal-800">
            Development spending (Lampiran 2) is not yet loaded for any state, and neither is the statement of financial
            position.
          </p>
          {stateGaps.map((g) => (
            <p key={`${g.year}`} className="mt-3 max-w-2xl text-charcoal-800">
              {g.year !== null ? <strong>{g.year}: </strong> : null}
              {g.reason}
            </p>
          ))}
          <p className="mt-6">
            <a href="/states">Every state, side by side</a>
          </p>
        </Band>
      </>
    ),
  };
}
