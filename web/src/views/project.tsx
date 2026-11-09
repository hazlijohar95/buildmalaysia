import { notFound } from "@/lib/abort";
import { citationHref, citationLabel, slugToVoteCode, voteCodeToSlug } from "@/lib/citations";
import { formatSen, type Sen } from "@/lib/money";
import {
  costYears,
  getProjectHistories,
  latestRow,
  projectEvents,
  projectHref,
  type CostYear,
  type PageRef,
  type ProjectEvent,
  type ProjectHistory,
  type ProjectYear,
} from "@/lib/queries/projects";
import { requireYear } from "@/lib/years";
import { previews } from "@/lib/previews";
import { Band, BiLabel, H2, PageHeader, StatRow } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Breadcrumb, Money, money } from "@/components/Figures";
import type { Page, RouteContext } from "@/lib/route";

export default async function projectPage({ params }: RouteContext): Promise<Page> {
  const year = await requireYear(params.year ?? "");
  const vote = slugToVoteCode(params.vote ?? "");
  const code = params.code ?? "";
  if (!/^P\.\d{2}$/.test(vote) || !/^\d{5}$/.test(code)) notFound();
  const histories = await getProjectHistories(year, vote, code);
  const [only] = histories;
  if (!only) notFound();
  const latest = latestRow(only);
  const repeated = histories.length > 1;

  return {
    head: {
      title: repeated ? `${vote} ${code} (${year})` : `${latest.name_ms}, ${latest.vote_code} ${latest.code}`,
      description: `Development project ${latest.code} of vote ${latest.vote_code} in every statement that prints it, each figure linked to its page.`,
      og: previews.year(latest.fiscal_year),
      canonical: repeated ? projectHref({ fiscal_year: year, vote_code: vote, code }) : projectHref(latest),
    },
    body: (
      <>
        <PageHeader
          wide
          eyebrow={
            <Breadcrumb
              items={[
                { label: "Projects", href: "/projects" },
                { label: `${year}`, href: `/${year}/development` },
                { label: vote, href: `/${year}/vote/${voteCodeToSlug(vote)}` },
                { label: code },
              ]}
            />
          }
          title={<span lang="ms">{repeated ? `${vote} ${code}` : latest.name_ms}</span>}
          intro={
            repeated ? (
              <p>
                The {year} statement prints code {code} twice under {vote}, as {histories.length} different rows. Each
                is shown on its own. <a href="/methodology#projects">How projects are followed.</a>
              </p>
            ) : (
              <p>
                <Span history={only} /> Every figure as the Statement of Development Expenditure printed it, linked to
                its page. <a href="/methodology#projects">How projects are followed.</a>
              </p>
            )
          }
        />
        {!repeated && <Stats history={only} />}
        {histories.map((h) => (
          <History key={h.chain_id} history={h} heading={repeated ? latestRow(h).name_ms : null} />
        ))}
      </>
    ),
  };
}

function Span({ history }: { history: ProjectHistory }) {
  const latest = latestRow(history);
  const years = costYears(history).map((c) => c.fiscal_year);
  const votes = [...new Set(history.years.map((y) => y.vote_code))];
  const [first, last] = [years[0], years.at(-1)];
  return (
    <>
      Development project {latest.code}
      {votes.length > 1 ? ` under votes ${votes.join(" and ")}` : ` of vote ${latest.vote_code}`},{" "}
      {first === last
        ? `printed in ${first} only.`
        : `followed through ${years.length} statements, ${first} to ${last}.`}
    </>
  );
}

function Stats({ history }: { history: ProjectHistory }) {
  const latest = latestRow(history);
  const costed = costYears(history).filter((c) => c.total_cost_sen > 0);
  const cost = costed.at(-1);
  return (
    <StatRow
      stats={[
        cost
          ? {
              label: <BiLabel en={`Total cost (${cost.fiscal_year})`} ms="Kos Keseluruhan" />,
              ...money(cost.total_cost_sen),
              sub: <CostCites cost={cost} />,
            }
          : { label: <BiLabel en="Total cost" ms="Kos Keseluruhan" />, value: "Not printed" },
        {
          label: <BiLabel en={`Spent ${latest.fiscal_year}`} ms="Sebenar" />,
          ...money(latest.actual_sen),
          sub: (
            <>
              of <Money sen={latest.estimate_sen} /> estimated, <Cite row={latest} page={latest.right} />
            </>
          ),
        },
        {
          label: <BiLabel en={`${latest.plan} spent to date`} ms={`Sebenar ${latest.plan}`} />,
          ...money(latest.plan_actual_to_date_sen),
          sub: <Cite row={latest} page={latest.right} />,
        },
      ]}
    />
  );
}

function History({ history, heading }: { history: ProjectHistory; heading: string | null }) {
  const events = projectEvents(history);
  return (
    <Band wide>
      {heading && (
        <H2>
          <span lang="ms">{heading}</span>
        </H2>
      )}
      {heading && (
        <p className="mt-3 max-w-xl text-charcoal-800">
          <Span history={history} />
        </p>
      )}
      {events.length > 0 && (
        <>
          <h3 className="mt-8 font-display text-xl font-semibold">What changed between statements</h3>
          <ul className="mt-4 max-w-2xl space-y-3 text-charcoal-800">
            {events.map((e, i) => (
              <li key={i}>
                <Event event={e} />
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="mt-10 font-display text-xl font-semibold">Every year as printed</h3>
      <div className="table-scroll mt-4">
        <table>
          <thead>
            <tr>
              <th>
                <BiLabel en="Year" ms="Tahun" />
              </th>
              <th>
                <BiLabel en="Vote" ms="Maksud" />
              </th>
              <th>
                <BiLabel en="Project as printed" ms="Maksud Perbelanjaan" />
              </th>
              <th className="text-right">
                <BiLabel en="Total cost" ms="Kos Keseluruhan" />
              </th>
              <th className="text-right">
                <BiLabel en="Estimate" ms="Anggaran" />
              </th>
              <th className="text-right">
                <BiLabel en="Spent" ms="Sebenar" />
              </th>
              <th className="text-right">
                <BiLabel en="Plan spent to date" ms="Sebenar Rancangan" />
              </th>
              <th>
                <BiLabel en="Source" ms="Sumber" />
              </th>
            </tr>
          </thead>
          <tbody>
            {history.years.map((y) => (
              <tr key={y.key}>
                <td>
                  <a href={`/${y.fiscal_year}/vote/${voteCodeToSlug(y.vote_code)}#d${y.code}`}>{y.fiscal_year}</a>
                </td>
                <td className="font-mono text-xs whitespace-nowrap">{y.vote_code}</td>
                <td lang="ms">{y.name_ms}</td>
                <td className="num">
                  <Figure row={y} page={y.left} sen={y.total_cost_sen} />
                </td>
                <td className="num">
                  <Figure row={y} page={y.right} sen={y.estimate_sen} />
                </td>
                <td className="num">
                  <Figure row={y} page={y.right} sen={y.actual_sen} />
                </td>
                <td className="num">
                  <Figure row={y} page={y.right} sen={y.plan_actual_to_date_sen} />
                  <span className="block text-xs text-charcoal-700">{y.plan}</span>
                </td>
                <td>
                  <CitationLink
                    year={y.fiscal_year}
                    docUrl={y.doc_url}
                    pdfPage={y.left.pdf_page}
                    bookPage={y.left.book_page}
                    spread
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 max-w-xl text-sm text-charcoal-700">
        Each figure links to the page it was read from: total cost to the left page of the spread, the year&apos;s
        figures to the right. A total cost of RM 0.00 is printed as &ldquo;-&rdquo;.
      </p>
    </Band>
  );
}

function Event({ event }: { event: ProjectEvent }) {
  switch (event.kind) {
    case "cost":
      return <CostEvent event={event} />;
    case "restated": {
      const { current, previous, difference_sen } = event;
      const before = current.fiscal_year - 1;
      return (
        <>
          <strong>{current.fiscal_year}.</strong> The {current.fiscal_year} statement prints{" "}
          <Money sen={current.plan_actual_prior_sen} /> as spent under {current.prior_plan} to the end of {before} (
          <Cite row={current} page={current.left} />
          ). The {before} statement printed <Money sen={sumOf(previous)} /> for the same figure (
          <Cites rows={previous} side="right" />
          ), {differs(difference_sen)}.
        </>
      );
    }
    case "merged": {
      const { current, previous } = event;
      const before = current.fiscal_year - 1;
      return (
        <>
          <strong>{current.fiscal_year}.</strong> The {before} statement printed this project as {previous.length} rows:{" "}
          {previous.map((p, i) => (
            <span key={p.key}>
              {i > 0 && (i === previous.length - 1 ? " and " : ", ")}
              under {p.vote_code} as <q lang="ms">{p.name_ms}</q>, <Money sen={p.plan_actual_to_date_sen} /> spent to
              date (<Cite row={p} page={p.right} />)
            </span>
          ))}
          . The {current.fiscal_year} statement prints one row under {current.vote_code}, with{" "}
          <Money sen={current.plan_actual_prior_sen} /> spent to the end of {before} (
          <Cite row={current} page={current.left} />
          ), their sum.
        </>
      );
    }
    case "moved": {
      const { current, previous } = event;
      return (
        <>
          <strong>{current.fiscal_year}.</strong> Printed under {current.vote_code} (
          <Cite row={current} page={current.left} />
          ), after {previous.vote_code} in {previous.fiscal_year} (<Cite row={previous} page={previous.left} />
          ). The spending carried over is the same in both statements.
        </>
      );
    }
  }
}

function CostEvent({ event }: { event: Extract<ProjectEvent, { kind: "cost" }> }) {
  const { from, to, change_sen, percent } = event;
  const rose = change_sen > 0;
  return (
    <>
      <strong>{to.fiscal_year}.</strong> Printed total cost {rose ? "rose" : "fell"} from{" "}
      <Money sen={from.total_cost_sen} /> in {from.fiscal_year} (<CostCites cost={from} />) to{" "}
      <Money sen={to.total_cost_sen} /> (<CostCites cost={to} />
      ), {rose ? "up" : "down"} <Money sen={Math.abs(change_sen) as Sen} /> ({Math.abs(percent).toFixed(1)}%).
    </>
  );
}

function differs(difference_sen: Sen) {
  return (
    <>
      <Money sen={Math.abs(difference_sen) as Sen} /> {difference_sen > 0 ? "less" : "more"}
    </>
  );
}

function sumOf(rows: ProjectYear[]): Sen {
  return rows.reduce((a, r) => a + r.plan_actual_to_date_sen, 0) as Sen;
}

function CostCites({ cost }: { cost: CostYear }) {
  return (
    <>
      {cost.rows.length > 1 && `${cost.rows.length} rows: `}
      <Cites rows={cost.rows} side="left" />
    </>
  );
}

function Cites({ rows, side }: { rows: ProjectYear[]; side: "left" | "right" }) {
  return (
    <>
      {rows.map((r, i) => (
        <span key={r.key}>
          {i > 0 && "; "}
          <Cite row={r} page={r[side]} />
        </span>
      ))}
    </>
  );
}

function Cite({ row, page }: { row: ProjectYear; page: PageRef }) {
  return <CitationLink year={row.fiscal_year} docUrl={row.doc_url} pdfPage={page.pdf_page} bookPage={page.book_page} />;
}

/** An exact figure that is itself the link to the page it was printed on. */
function Figure({ row, page, sen }: { row: ProjectYear; page: PageRef; sen: Sen }) {
  return (
    <a
      href={citationHref(row.doc_url, page.pdf_page)}
      target="_blank"
      rel="noopener noreferrer"
      title={citationLabel(row.fiscal_year, page.book_page)}
      className="text-foreground no-underline hover:underline"
    >
      {formatSen(sen)}
    </a>
  );
}
