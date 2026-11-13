// Every loaded state side by side, after CanadaSpends' provincial pages (MIT, Build Canada): each state's revenue
// and operating spending from its own audited statement, every figure linked to its page, and the states not shown.
import { Band, H2, PageHeader, StatRow } from "@/components/Boxed";
import RankedList from "@/components/RankedList";
import StateCitation from "@/components/StateCitation";
import { formatSen, formatSenCompact, parseSen } from "@/lib/money";
import { getStateGaps, getStateSummaries, stateHref, transferNote, type StateGap } from "@/lib/states";
import type { Page } from "@/lib/route";

function GapList({ gaps }: { gaps: StateGap[] }) {
  return (
    <ul className="mt-6 grid gap-6 md:grid-cols-2 list-none p-0">
      {gaps.map((g) => (
        <li key={`${g.slug}-${g.year ?? "all"}`} className="border-t-2 border-foreground pt-3">
          <div className="font-semibold">
            {g.name}
            {g.year !== null ? ` ${g.year}` : ""}
          </div>
          <p className="mt-1 text-sm text-charcoal-800">{g.reason}</p>
          {g.sourceUrl && (
            <a href={g.sourceUrl} className="text-sm" rel="noopener noreferrer" target="_blank">
              Where the state publishes
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function statesPage(): Promise<Page> {
  const [states, gaps] = await Promise.all([getStateSummaries(), getStateGaps()]);
  const loaded = new Set(states.map((s) => s.slug));
  const missingStates = gaps.filter((g) => !loaded.has(g.slug));
  const missingYears = gaps.filter((g) => loaded.has(g.slug));
  const years = [...new Set(states.map((s) => s.year))].sort();
  const stateCount = states.length + new Set(missingStates.map((g) => g.slug)).size;
  const largest = states[0];
  return {
    head: {
      title: "State finances",
      description:
        "What Malaysia's state governments collected and spent, from each state's audited financial statements, with every figure linked to its page.",
    },
    body: (
      <>
        <PageHeader
          eyebrow="State finances"
          title="What the states collect and spend"
          intro={
            <>
              <p>
                Malaysia&apos;s {stateCount} states each keep their own accounts: land tax, royalties and other revenue
                on one side, the votes of the state assembly on the other. These figures come from each state&apos;s
                audited financial statement (Penyata Kewangan Kerajaan Negeri), read row by row and loaded only when
                every printed total adds up.
              </p>
              <p>
                {states.length} of {stateCount} states are shown. The others do not publish a statement this site can
                read; why is listed below.
              </p>
            </>
          }
        />
        {largest && (
          <StatRow
            stats={[
              { label: "States shown", value: `${states.length} of ${stateCount}`, sub: `Years ${years.join(", ")}` },
              {
                label: "Most revenue",
                value: formatSenCompact(parseSen(largest.revenue.actual ?? 0)),
                title: formatSen(parseSen(largest.revenue.actual ?? 0)),
                sub: `${largest.name}, ${largest.year}`,
              },
              { label: "States not shown", value: String(stateCount - states.length), sub: "See why below" },
            ]}
          />
        )}
        <Band wide>
          <H2>Side by side</H2>
          <p className="mt-3 max-w-2xl text-charcoal-800">
            Each state&apos;s latest statement. Revenue is the statement&apos;s JUMLAH HASIL; operating spending is the
            total of its operating votes as printed. Development spending is not yet loaded. Years differ where a state
            has not published its latest statement.
          </p>
          <div className="table-scroll mt-8">
            <table>
              <thead>
                <tr>
                  <th>State</th>
                  <th className="text-right">Year</th>
                  <th className="text-right">Revenue</th>
                  <th>Source</th>
                  <th className="text-right">Operating spending</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {states.map((s) => (
                  <tr key={s.slug}>
                    <td>
                      <a href={stateHref(s.slug)} className="font-medium">
                        {s.name}
                      </a>
                      {transferNote(s) && <span className="block text-xs text-charcoal-700">{transferNote(s)}</span>}
                    </td>
                    <td className="num">{s.year}</td>
                    <td className="num">{s.revenue.actual === null ? "–" : formatSen(s.revenue.actual)}</td>
                    <td>
                      <StateCitation name={s.name} year={s.year} docUrl={s.url} pdfPage={s.revenue.pdfPage} />
                    </td>
                    <td className="num">{s.operating.actual === null ? "–" : formatSen(s.operating.actual)}</td>
                    <td>
                      <StateCitation name={s.name} year={s.year} docUrl={s.url} pdfPage={s.operating.pdfPage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <H2 className="mt-16">Revenue</H2>
          <div className="mt-8">
            <RankedList
              items={states.map((s) => ({
                key: s.slug,
                name: s.name,
                href: stateHref(s.slug),
                amount_sen: parseSen(s.revenue.actual ?? 0),
                note: `${s.year}`,
              }))}
            />
          </div>
          <p className="mt-8 max-w-2xl text-sm text-charcoal-700">
            States move money from their operating account into their own Development Fund, which then pays for
            development projects. Some states count that transfer in their operating votes and some print it outside
            them; where the note prints it, the state&apos;s row says which. Revenue includes non-revenue receipts, such
            as grants from the federal government and its agencies. Per-person figures are not shown: no population
            source is loaded yet.
          </p>
        </Band>
        <Band>
          <H2>Not covered</H2>
          <p className="mt-3 max-w-2xl text-charcoal-800">
            States with no statement loaded, and the reason. Each was searched for on its treasury&apos;s site, with the
            Auditor-General&apos;s reports as a fallback.
          </p>
          <GapList gaps={missingStates} />
          {missingYears.length > 0 && (
            <>
              <h3 className="mt-12 font-display text-2xl font-semibold">Years not covered for states shown</h3>
              <GapList gaps={missingYears} />
            </>
          )}
        </Band>
      </>
    ),
  };
}
