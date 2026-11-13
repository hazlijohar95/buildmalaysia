// "Try your own rates": the reader changes the bands and rates and sees their tax, and others', under both the
// published schedule and their own. Everything is worked out in the browser; the schedule lives only in the URL.
import { useState } from "react";
import { H2, kicker as label } from "@/components/Boxed";
import { cn } from "@/lib/cn";
import {
  MAX_BANDS,
  SCHEDULE,
  bandsProblem,
  calculateTax,
  compare,
  currentBands,
  sameBands,
  scenarioRules,
  type ScenarioBand,
} from "@/lib/tax";

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const signed = (n: number) => (n === 0 ? "No change" : `${n > 0 ? "+" : "−"}${rm(Math.abs(n))}`);
const pct = (n: number) => `${n.toFixed(1)}%`;
const COMPARE_AT = [30_000, 60_000, 100_000, 250_000, 500_000, 1_000_000, 3_000_000];
const field = "w-full min-w-0 border-2 border-foreground bg-background px-2 py-2 font-mono text-sm tabular-nums";

interface Row {
  lower: string;
  rate: string;
}

const toRows = (bands: ScenarioBand[]): Row[] =>
  bands.map((b) => ({ lower: String(b.lower), rate: String(b.ratePct) }));
const parse = (text: string) => (text.trim() === "" ? NaN : Number(text.replaceAll(",", "")));

interface Props {
  income: number;
  epf: boolean;
  otherReliefs: number;
  bands: ScenarioBand[];
  onBands: (bands: ScenarioBand[]) => void;
}

export default function TaxSimulator({ income, epf, otherReliefs, bands, onBands }: Props) {
  const [rows, setRows] = useState<Row[]>(() => toRows(bands));
  const [copied, setCopied] = useState(false);
  const drafted = rows.map((r) => ({ lower: parse(r.lower), ratePct: parse(r.rate) }));
  const problem = bandsProblem(drafted);
  const published = currentBands();
  const changed = !sameBands(bands, published);

  const edit = (next: Row[]) => {
    setRows(next);
    setCopied(false);
    const parsed = next.map((r) => ({ lower: parse(r.lower), ratePct: parse(r.rate) }));
    if (bandsProblem(parsed) === null) onBands(parsed);
  };
  const setCell = (i: number, key: keyof Row, value: string) =>
    edit(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  const input = { income, epf, otherReliefs };
  const now = calculateTax(input);
  const yours = calculateTax(input, scenarioRules(bands));
  const difference = Math.round((yours.tax - now.tax) * 100) / 100;
  const table = compare(COMPARE_AT, { epf, otherReliefs }, bands);

  return (
    <section
      id="simulator"
      className="border-b-2 border-foreground grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
    >
      <div className="px-6 py-14 md:px-16 lg:border-r-2 border-foreground">
        <H2>Try your own rates</H2>
        <p className="mt-4 max-w-xl text-charcoal-800">
          Change where each band starts and what it charges, add or remove bands, and see what you and others would pay.
          Reliefs, the rebate and KWSP stay as published. The link to this page carries your schedule, so you can share
          it.
        </p>
        <div className="table-scroll mt-8">
          <table>
            <thead>
              <tr>
                <th>Band</th>
                <th>From chargeable income (RM)</th>
                <th className="text-right">Rate (%)</th>
                <th>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="font-mono">{i + 1}</td>
                  <td>
                    <input
                      aria-label={`Band ${i + 1} starts at, in ringgit`}
                      inputMode="numeric"
                      value={r.lower}
                      disabled={i === 0}
                      onChange={(e) => setCell(i, "lower", e.target.value)}
                      className={cn(field, i === 0 && "opacity-60")}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Band ${i + 1} rate, percent`}
                      inputMode="decimal"
                      value={r.rate}
                      onChange={(e) => setCell(i, "rate", e.target.value)}
                      className={cn(field, "text-right")}
                    />
                  </td>
                  <td>
                    {i > 0 && (
                      <button
                        type="button"
                        aria-label={`Remove band ${i + 1}`}
                        onClick={() => edit(rows.filter((_, j) => j !== i))}
                        className="min-h-11 px-3 text-charcoal-700 hover:text-foreground"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {problem && (
          <p role="alert" className="mt-4 text-merah-700">
            {problem} The results show the last schedule that worked.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={rows.length >= MAX_BANDS}
            onClick={() => {
              const last = drafted[drafted.length - 1];
              const start = Number.isFinite(last?.lower) ? last.lower * 2 || 10_000 : 10_000;
              edit([...rows, { lower: String(start), rate: rows[rows.length - 1]?.rate ?? "0" }]);
            }}
            className={cn(label, "border-2 border-foreground px-4 py-3 hover:bg-linen-200 disabled:opacity-50")}
          >
            Add a band
          </button>
          <button
            type="button"
            disabled={!changed && !problem}
            onClick={() => edit(toRows(published))}
            className={cn(label, "border-2 border-foreground px-4 py-3 hover:bg-linen-200 disabled:opacity-50")}
          >
            Back to LHDN&apos;s rates
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true));
            }}
            className={cn(label, "border-2 border-foreground px-4 py-3 hover:bg-linen-200")}
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      </div>

      <div className="px-6 py-14 md:px-12">
        <div className={cn(label, "text-charcoal-700")}>
          {changed ? "Your schedule against the published one" : "Change a rate to compare"}
        </div>
        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 border-2 border-foreground">
          {[
            {
              term: `Year of assessment ${SCHEDULE.year_of_assessment}`,
              value: rm(now.tax),
              sub: pct(now.effectiveRatePct),
            },
            { term: "Your schedule", value: rm(yours.tax), sub: pct(yours.effectiveRatePct) },
            { term: "Difference", value: signed(difference), sub: "a year, on your income" },
          ].map((s) => (
            <div key={s.term} className="p-5 border-b-2 sm:border-b-0 sm:border-r-2 last:border-0 border-foreground">
              <dt className={cn(label, "text-charcoal-700")}>{s.term}</dt>
              <dd className="m-0 mt-2 font-display text-2xl font-semibold tabular-nums">{s.value}</dd>
              <dd className="m-0 text-sm text-charcoal-700">{s.sub}</dd>
            </div>
          ))}
        </dl>
        <p role="status" className="sr-only">
          {`Under your schedule: ${rm(yours.tax)}, ${signed(difference)} against the published schedule.`}
        </p>

        <div className="table-scroll mt-10">
          <table>
            <caption className="text-left font-medium pb-3">
              At other incomes, {epf ? "contributing to KWSP" : "without KWSP"}
              {otherReliefs > 0 ? `, with ${rm(otherReliefs)} of other reliefs` : ""}
            </caption>
            <thead>
              <tr>
                <th>Income</th>
                <th className="text-right">Published schedule</th>
                <th className="text-right">Your schedule</th>
                <th className="text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {table.map((c) => (
                <tr key={c.income}>
                  <td className="tabular-nums whitespace-nowrap">{rm(c.income)}</td>
                  <td className="num">{rm(c.current)}</td>
                  <td className="num">{rm(c.scenario)}</td>
                  <td className={cn("num", c.difference > 0 && "text-merah-700", c.difference < 0 && "text-pine-700")}>
                    {signed(c.difference)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-10 font-semibold">What would it raise?</h3>
        <p className="mt-2 text-charcoal-800">
          This page does not estimate what a schedule would raise in total. That needs the number of taxpayers at each
          level of chargeable income, and this site has found no current count of that from LHDN to load and cite. Any
          total here would be a guess, so there is none.
        </p>
      </div>
    </section>
  );
}
