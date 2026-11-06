"use client";

// "Where your taxes go", after CanadaSpends' tax visualiser (MIT, Build Canada), laid out in the
// buildcanada.com boxed style. Rates come from tax-schedule-2025.json; spending shares from the
// audited statement, passed in by the page.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { StatRow, kicker as label } from "@/components/Boxed";
import { calculateTax, SCHEDULE } from "@/lib/tax";
import type { SpendingShare } from "@/lib/queries/allocation";

/** Ringgit; sen are shown only when the amount has them, unless `digits` is given. */
const rm = (n: number, digits = Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2) =>
  `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
/** Whole ringgit typed by a person: separators ignored, anything after a decimal point dropped. */
const parseAmount = (text: string) => Number(text.split(".")[0].replace(/\D/g, "")) || 0;

const PRESETS = [30_000, 60_000, 100_000, 250_000];
const SLIDER_MAX = 500_000;
const SEGMENTS = [
  "var(--color-merah-600)",
  "var(--color-lake-700)",
  "var(--color-kuning)",
  "var(--color-pine-700)",
  "var(--color-merah-400)",
  "var(--color-lake-400)",
  "var(--color-biru-400)",
  "var(--color-charcoal-700)",
];
const REST = "var(--color-charcoal-300)";
const SHOWN = 12;

interface Props {
  year: number;
  totalSpentSen: number;
  shares: SpendingShare[];
  initial: { income: number; epf: boolean; otherReliefs: number };
}

function AmountInput({
  value,
  onChange,
  className,
  label: ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  label: string;
}) {
  const [text, setText] = useState(value.toLocaleString("en-MY"));
  useEffect(() => {
    if (parseAmount(text) !== value) setText(value.toLocaleString("en-MY"));
  }, [value, text]);
  // The invisible copy sizes the field to its text, so the sentence closes up around the number.
  return (
    <span className="inline-grid">
      <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre tabular-nums">
        {text || "0"}
      </span>
      <input
        aria-label={ariaLabel}
        inputMode="numeric"
        size={1}
        value={text}
        onChange={(e) => {
          const n = parseAmount(e.target.value);
          setText(e.target.value === "" ? "" : n.toLocaleString("en-MY"));
          onChange(n);
        }}
        className={cn("col-start-1 row-start-1 w-full min-w-0 bg-transparent tabular-nums", className)}
      />
    </span>
  );
}

export default function TaxCalculator({ year, totalSpentSen, shares, initial }: Props) {
  const [income, setIncome] = useState(initial.income);
  const [epf, setEpf] = useState(initial.epf);
  const [otherReliefs, setOtherReliefs] = useState(initial.otherReliefs);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ income: String(income), epf: epf ? "1" : "0" });
    if (otherReliefs > 0) params.set("other", String(otherReliefs));
    window.history.replaceState(null, "", `?${params}`);
  }, [income, epf, otherReliefs]);

  const t = useMemo(() => calculateTax({ income, epf, otherReliefs }), [income, epf, otherReliefs]);
  // With no tax to spread, the same breakdown is shown per RM 100 of spending.
  const perHundred = t.tax <= 0;
  const base = perHundred ? 100 : t.tax;
  const yours = shares.map((s) => ({
    ...s,
    share: s.amount_sen / totalSpentSen,
    amount: (base * s.amount_sen) / totalSpentSen,
  }));
  const noTaxReason =
    t.chargeable === 0
      ? "Your reliefs bring your chargeable income to RM 0, so you owe no income tax."
      : t.rebate > 0
        ? `The ${rm(t.rebate)} rebate cancels the ${rm(t.taxBeforeRebate)} tax on your chargeable income, so you owe no income tax.`
        : `Your chargeable income of ${rm(t.chargeable)} falls in the 0% band, so you owe no income tax.`;
  const max = yours[0]?.amount ?? 0;
  const top = yours.slice(0, SEGMENTS.length);
  const restShare = 1 - top.reduce((s, i) => s + i.share, 0);
  const figure = (name: string, amount: number) => `${name}: ${rm(amount, perHundred ? 2 : 0)}`;
  const restFigure = figure("Everything else", base * restShare);
  const visible = showAll ? yours : yours.slice(0, SHOWN);
  const rates = SCHEDULE.sources.find((s) => s.id === "lhdn-kadar-cukai");
  const reliefsPage = SCHEDULE.sources.find((s) => s.id === "lhdn-pelepasan-cukai");
  const rebatePage = SCHEDULE.sources.find((s) => s.id === "lhdn-rebat");
  const epfPage = SCHEDULE.sources.find((s) => s.id === "kwsp-mandatory-contribution");

  return (
    <>
      <section className="p-2 md:p-4 border-b-2 border-foreground">
        <div className="relative overflow-hidden bg-charcoal-1000 text-linen-50 [--focus-ring:var(--color-kuning)] px-6 py-14 md:px-16 md:py-20">
          <div aria-hidden className="absolute inset-y-0 left-[5%] w-px bg-linen-50/10" />
          <div aria-hidden className="absolute inset-y-0 right-[5%] w-px bg-linen-50/10" />
          <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-linen-50/15" />
          <div className="relative max-w-5xl mx-auto">
            <div className={cn(label, "text-linen-300")}>
              Where your taxes go · Year of assessment {SCHEDULE.year_of_assessment}
            </div>
            <h1 className="mt-6 m-0 font-display font-medium tracking-tight leading-[1.1] text-4xl sm:text-6xl lg:text-7xl">
              I earn{" "}
              <span className="inline-flex items-baseline border-b-2 border-merah-500 focus-within:border-linen-50">
                RM&nbsp;
                <AmountInput
                  value={income}
                  onChange={setIncome}
                  label="Your annual income in ringgit"
                  className="text-linen-50"
                />
              </span>{" "}
              a year.
            </h1>
            <input
              type="range"
              min={0}
              max={SLIDER_MAX}
              step={1_000}
              value={Math.min(income, SLIDER_MAX)}
              onChange={(e) => setIncome(Number(e.target.value))}
              aria-label="Annual income"
              className="mt-10 w-full accent-merah-500"
            />
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setIncome(p)}
                  className={cn(
                    label,
                    "border border-linen-50/40 px-3 py-2 transition-colors",
                    income === p ? "bg-linen-50 text-charcoal-1000" : "hover:bg-linen-50/10",
                  )}
                >
                  RM {p / 1000}k
                </button>
              ))}
              <span className="flex-1" />
              <label className="flex min-h-11 items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={epf}
                  onChange={(e) => setEpf(e.target.checked)}
                  className="h-5 w-5 accent-merah-500"
                />
                <span className="text-sm text-linen-100">I contribute {SCHEDULE.epf.employee_rate_pct}% to KWSP</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-linen-100">
                Other reliefs
                <span className="border-b border-linen-50/40 px-1">
                  RM <AmountInput value={otherReliefs} onChange={setOtherReliefs} label="Other reliefs in ringgit" />
                </span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <StatRow
        stats={[
          { label: "Income tax", value: rm(t.tax), sub: t.tax > 0 ? `${rm(t.tax / 12, 0)} a month` : "Nothing to pay" },
          { label: "Effective rate", value: pct(t.effectiveRatePct), sub: "of your income" },
          { label: "Marginal rate", value: pct(t.marginalRatePct, 0), sub: "on your next ringgit" },
          { label: "Take-home", value: rm(t.takeHome, 0), sub: epf ? "after tax and KWSP" : "after tax" },
        ]}
      />

      <section className="border-b-2 border-foreground px-6 py-14 md:px-16 md:py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="m-0 font-display text-3xl md:text-5xl font-semibold tracking-tight">
            {perHundred ? "Where every RM 100 of federal spending goes" : `Where your ${rm(t.tax)} goes`}
          </h2>
          <p className="mt-3 max-w-3xl text-lg text-charcoal-800">
            {perHundred
              ? `${noTaxReason} You still pay for government through indirect taxes such as sales and service tax, which this page does not estimate. Here is how the federal government spent each RM 100 in ${year}.`
              : `Your income tax, spread across the federal government's ${year} spending in proportion to what each ministry and charge actually spent.`}
          </p>

          <div className="mt-10">
            <div
              className="flex h-14 w-full overflow-hidden border-2 border-foreground"
              role="img"
              aria-label={`${perHundred ? "Each RM 100 of spending" : "Your tax"} by destination. ${[
                ...top.map((s) => figure(s.name, s.amount)),
                restFigure,
              ].join("; ")}.`}
            >
              {top.map((s, i) => (
                <div
                  key={s.id}
                  title={figure(s.name, s.amount)}
                  style={{ width: `${s.share * 100}%`, background: SEGMENTS[i] }}
                  className="h-full border-r border-linen-50/60 last:border-r-0"
                />
              ))}
              <div title={restFigure} style={{ width: `${restShare * 100}%`, background: REST }} className="h-full" />
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {top.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0" style={{ background: SEGMENTS[i] }} />
                  {s.name}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0" style={{ background: REST }} />
                Everything else
              </li>
            </ul>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 border-2 border-foreground">
            {yours.slice(0, 3).map((s, i) => (
              <div
                key={s.id}
                className="p-6 md:p-8 border-b-2 md:border-b-0 md:border-r-2 last:border-0 border-foreground"
                style={{ borderTopWidth: 6, borderTopColor: SEGMENTS[i] }}
              >
                <div className="font-display text-4xl font-semibold tracking-tight tabular-nums">
                  {rm(s.amount, perHundred ? 2 : 0)}
                </div>
                <div className="mt-2 font-medium">{s.name}</div>
                {s.gloss && <div className="mt-1 text-sm text-charcoal-700">{s.gloss}</div>}
                {!perHundred && (
                  <div className={cn(label, "mt-4 text-charcoal-600")}>
                    RM {(s.share * 100).toFixed(2)} of every RM 100
                  </div>
                )}
              </div>
            ))}
          </div>

          <ol className="mt-12 border-t-2 border-foreground">
            {visible.map((s, i) => (
              <li
                key={s.id}
                className="grid grid-cols-[2.5rem_1fr_auto] md:grid-cols-[3rem_minmax(0,1.2fr)_minmax(0,1fr)_8rem] items-center gap-x-4 gap-y-2 py-4 border-b border-foreground/15"
              >
                <span className={cn(label, "text-charcoal-600")}>{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  {s.href ? (
                    <Link href={s.href} className="font-medium text-foreground no-underline hover:underline">
                      {s.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{s.name}</span>
                  )}
                  {s.gloss && <span className="block text-sm text-charcoal-700">{s.gloss}</span>}
                </span>
                <span className="hidden md:block h-3 bg-linen-200">
                  <span
                    className="block h-full"
                    style={{
                      width: `${max > 0 ? (s.amount / max) * 100 : 0}%`,
                      background: SEGMENTS[i] ?? "var(--color-merah-600)",
                    }}
                  />
                </span>
                <span className="text-right">
                  <span className="block font-display text-xl font-semibold tabular-nums">
                    {rm(s.amount, perHundred ? 2 : 0)}
                  </span>
                  <span className="block text-xs text-charcoal-600 tabular-nums">{pct(s.share * 100)}</span>
                </span>
              </li>
            ))}
          </ol>
          {yours.length > SHOWN && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className={cn(label, "mt-6 border-2 border-foreground px-5 py-3 hover:bg-linen-200")}
            >
              {showAll ? "Show fewer" : `Show all ${yours.length}`}
            </button>
          )}
        </div>
      </section>

      <section className="border-b-2 border-foreground grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="px-6 py-14 md:px-16 lg:border-r-2 border-foreground">
          <h2 className="m-0 font-display text-3xl font-semibold tracking-tight">How your tax is worked out</h2>
          <dl className="mt-8 space-y-3 text-base">
            <div className="flex justify-between gap-4">
              <dt>Employment income</dt>
              <dd className="tabular-nums whitespace-nowrap">{rm(t.income)}</dd>
            </div>
            {t.reliefs.map((r) => (
              <div key={r.id} className="flex justify-between gap-4 text-charcoal-800">
                <dt>
                  less {r.label}
                  {r.id === "epf" && (
                    <span className="block text-xs text-charcoal-600">
                      {SCHEDULE.epf.employee_rate_pct}% of income is {rm(t.epfContribution)}; relief capped at{" "}
                      {rm(SCHEDULE.reliefs.epf.amount)}
                    </span>
                  )}
                </dt>
                <dd className="tabular-nums whitespace-nowrap">−{rm(r.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t-2 border-foreground pt-3 font-semibold">
              <dt>Chargeable income</dt>
              <dd className="tabular-nums whitespace-nowrap">{rm(t.chargeable)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Tax on chargeable income</dt>
              <dd className="tabular-nums whitespace-nowrap">{rm(t.taxBeforeRebate)}</dd>
            </div>
            {t.rebate > 0 && (
              <div className="flex justify-between gap-4 text-charcoal-800">
                <dt>less rebate (chargeable income under {rm(SCHEDULE.rebate.chargeable_income_below)})</dt>
                <dd className="tabular-nums whitespace-nowrap">−{rm(t.rebate)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t-2 border-foreground pt-3 font-display text-2xl font-semibold">
              <dt>Income tax</dt>
              <dd className="tabular-nums whitespace-nowrap">{rm(t.tax)}</dd>
            </div>
          </dl>
        </div>
        <div className="px-6 py-14 md:px-12">
          <div className={cn(label, "text-charcoal-700")}>{SCHEDULE.rate_table}</div>
          <div className="table-scroll mt-4">
            <table>
              <thead>
                <tr>
                  <th>Band</th>
                  <th>Chargeable income</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Yours in band</th>
                  <th className="text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {t.slices.map((b) => (
                  <tr key={b.band} className={b.taxable > 0 ? "font-semibold" : "text-charcoal-600"}>
                    <td className="font-mono">{b.band}</td>
                    <td className="tabular-nums whitespace-nowrap">
                      {b.upper === null
                        ? `Over ${rm(b.lower)}`
                        : `${rm(b.lower === 0 ? 0 : b.lower + 1)} – ${rm(b.upper)}`}
                    </td>
                    <td className="num">{b.ratePct}%</td>
                    <td className="num">{b.taxable > 0 ? rm(b.taxable) : "–"}</td>
                    <td className="num">{b.taxable > 0 ? rm(b.tax, 2) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-foreground px-6 py-14 md:px-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 text-base leading-relaxed">
          <div>
            <h2 className="m-0 font-display text-2xl font-semibold tracking-tight">What this assumes</h2>
            <ul className="mt-4 space-y-3 list-disc pl-5">
              <li>You are a Malaysian tax resident under 60, and all your income is employment income.</li>
              <li>
                KWSP is estimated at {SCHEDULE.epf.employee_rate_pct}% of income. KWSP&apos;s wage-range table rounds
                each month up, so the real figure is a few ringgit higher.
              </li>
              <li>
                Only the individual and KWSP reliefs are applied unless you enter others, such as PERKESO (up to{" "}
                {rm(SCHEDULE.reliefs.perkeso.amount)}), lifestyle or children.
              </li>
              <li>
                Your tax is spread in proportion to {year} spending. That year the government spent more than it raised,
                and borrowed the difference; see the <Link href={`/spending?year=${year}`}>spending chart</Link>.
              </li>
            </ul>
          </div>
          <div>
            <h2 className="m-0 font-display text-2xl font-semibold tracking-tight">Sources</h2>
            <ul className="mt-4 space-y-3">
              {[
                { s: rates, what: "Rates and bands, checked against the tax LHDN prints for each band" },
                { s: reliefsPage, what: `Reliefs for year of assessment ${SCHEDULE.year_of_assessment}` },
                { s: rebatePage, what: "Rebate on chargeable income under RM35,000" },
                { s: epfPage, what: "KWSP employee contribution rate" },
              ].map(({ s, what }) =>
                s ? (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                    <span className="block text-sm text-charcoal-700">
                      {what}. Retrieved {s.retrieved}.
                    </span>
                  </li>
                ) : null,
              )}
              <li>
                <Link href={`/spending?year=${year}`}>
                  Jabatan Akauntan Negara, Penyata Kewangan Kerajaan Persekutuan {year}
                </Link>
                <span className="block text-sm text-charcoal-700">Spending by ministry and charged expenditure.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
