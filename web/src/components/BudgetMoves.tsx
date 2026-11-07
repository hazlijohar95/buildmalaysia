import { Band, H2, kicker } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import { Money, change, formatRinggit, money } from "@/components/Figures";
import { MIN_PERCENT_BASE, reorganisationWindow, type BudgetMove, type BudgetMoves } from "@/lib/budget-moves";
import { voteCodeToSlug } from "@/lib/citations";
import { cn } from "@/lib/cn";
import { titleCase } from "@/lib/queries/sankey";

const KIND: Record<string, string> = { T: "charged", B: "supply", P: "development" };

/** The votes Budget `year` raises and lowers most against the current year's budget, as the book prints both. */
export default function BudgetMovesBand({ year, url, moves }: { year: number; url: string; moves: BudgetMoves }) {
  const { from, to } = reorganisationWindow(year);
  const leftOut = moves.reorganised;
  const lists = { year, url };
  return (
    <Band wide id="moves">
      <H2>Biggest increases and cuts</H2>
      <p className="mt-3 max-w-2xl text-charcoal-800">
        Each vote in Budget {year} as tabled against the {year - 1} budget, both as this book prints them (
        <span lang="ms">Anggaran {year}</span> beside <span lang="ms">Anggaran Asal {year - 1}</span>). The book&apos;s{" "}
        {year - 1} figures can differ by vote from what Budget {year - 1} tabled.
      </p>
      <p className="mt-3 max-w-2xl text-charcoal-800">
        {leftOut.length === 0
          ? `No vote is left out: the ministry lineage records no reorganisation, setting up or dissolution behind any vote from ${from} to ${to}.`
          : `${leftOut.length === 1 ? "1 vote is" : `${leftOut.length} votes are`} left out because their ministry was reorganised, set up or dissolved, or their number passed to another ministry, from ${from} to ${to}: ${leftOut.join(", ")}.`}
      </p>

      <h3 className="mt-10 m-0 font-display text-xl font-semibold">By ringgit</h3>
      <div className="mt-4 grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <MoveList {...lists} title="Rose" moves={moves.byAmount.rose} by="amount" />
        <MoveList {...lists} title="Fell" moves={moves.byAmount.fell} by="amount" />
      </div>

      <h3 className="mt-12 m-0 font-display text-xl font-semibold">By percentage</h3>
      <p className="mt-2 max-w-2xl text-sm text-charcoal-700">
        Only votes of at least {formatRinggit(MIN_PERCENT_BASE)} in the {year - 1} budget; below that the votes are
        constitutional offices and small commissions, where a small sum is a large percentage.
      </p>
      <div className="mt-4 grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <MoveList {...lists} title="Rose" moves={moves.byPercent.rose} by="percent" />
        <MoveList {...lists} title="Fell" moves={moves.byPercent.fell} by="percent" />
      </div>
    </Band>
  );
}

function signedRinggit(m: BudgetMove): string {
  return `${m.change > 0 ? "+" : ""}${money(m.change, true).value}`;
}

function MoveList({
  year,
  url,
  title,
  moves,
  by,
}: {
  year: number;
  url: string;
  title: string;
  moves: BudgetMove[];
  by: "amount" | "percent";
}) {
  const size = (m: BudgetMove) => Math.abs(by === "amount" ? m.change : (m.percent ?? 0));
  const max = Math.max(1, ...moves.map(size));
  return (
    <div className="min-w-0">
      <div className={cn(kicker, "text-charcoal-700")}>{title}</div>
      {moves.length === 0 ? (
        <p className="mt-3 border-t-2 border-foreground pt-3 text-charcoal-700">No vote {title.toLowerCase()}.</p>
      ) : (
        <ol className="m-0 mt-3 p-0 list-none border-t-2 border-foreground">
          {moves.map((m, i) => {
            const href = `/budget/${year}/vote/${voteCodeToSlug(m.voteCode)}`;
            const exact = `${m.change > 0 ? "+" : ""}${formatRinggit(m.change)}`;
            return (
              <li
                key={m.voteCode}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-4 py-3.5 border-b border-foreground/15"
              >
                <span className={cn(kicker, "pt-1 text-charcoal-600")}>{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <a href={href} lang="ms" className="font-medium text-foreground no-underline hover:underline">
                    {titleCase(m.name)}
                  </a>
                  <span className="block text-sm text-charcoal-700">
                    {m.voteCode}, {KIND[m.voteCode[0]]} · <Money sen={m.base} whole /> to{" "}
                    <Money sen={m.proposed} whole /> ·{" "}
                    {by === "amount" ? (
                      change(m.proposed, m.base)
                    ) : (
                      <span title={exact} className="tabular-nums whitespace-nowrap">
                        {signedRinggit(m)}
                      </span>
                    )}{" "}
                    · <CitationLink year={year} source="MOF" docUrl={url} pdfPage={m.pdfPage} bookPage={m.bookPage} />
                  </span>
                  <span className="mt-2 block h-1.5 bg-linen-200" aria-hidden>
                    <span className="block h-full bg-merah-600" style={{ width: `${(size(m) / max) * 100}%` }} />
                  </span>
                </span>
                <span className="text-right font-display text-lg font-semibold tabular-nums whitespace-nowrap">
                  {by === "amount" ? (
                    <span title={exact} className="relative">
                      <span aria-hidden="true">{signedRinggit(m)}</span>
                      <span className="sr-only">{exact}</span>
                    </span>
                  ) : (
                    change(m.proposed, m.base)
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
