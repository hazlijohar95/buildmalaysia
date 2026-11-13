import schedule2025 from "@/data/tax-schedule-2025.json";

/** A year of assessment's schedule, as `pipeline tax-schedule` reads it from LHDN and KWSP pages. */
export type TaxSchedule = typeof schedule2025;
export const SCHEDULE: TaxSchedule = schedule2025;

/** What the calculation reads from a schedule: the published one, or a reader's own bands on its reliefs. */
export type TaxRules = Pick<TaxSchedule, "reliefs" | "rebate" | "epf"> & {
  bands: { band: string; lower: number; upper: number | null; rate_pct: number }[];
};

export interface TaxInput {
  income: number; // annual employment income, RM
  epf: boolean; // contributes to KWSP at the employee rate
  otherReliefs: number; // RM, claimed on top of the individual and KWSP reliefs
}

export interface Relief {
  id: "individual" | "epf" | "other";
  label: string;
  amount: number;
}

export interface BandSlice {
  band: string;
  lower: number;
  upper: number | null;
  ratePct: number;
  taxable: number; // the part of chargeable income that falls in this band
  tax: number;
}

export interface TaxResult {
  income: number;
  epfContribution: number;
  reliefs: Relief[];
  chargeable: number;
  slices: BandSlice[];
  taxBeforeRebate: number;
  rebate: number;
  tax: number;
  effectiveRatePct: number;
  marginalRatePct: number;
  takeHome: number;
}

const sen = (rm: number) => Math.round(rm * 100) / 100;

/**
 * Resident individual's income tax on employment income: individual relief, KWSP relief (capped),
 * any other reliefs entered, the banded rates, then the rebate on low chargeable income.
 * KWSP is estimated at the employee rate on the whole income; KWSP's own wage-range table rounds it
 * up by a few ringgit a month.
 */
export function calculateTax(input: TaxInput, s: TaxRules = SCHEDULE): TaxResult {
  const income = Math.max(0, input.income);
  const epfContribution = input.epf ? sen((income * s.epf.employee_rate_pct) / 100) : 0;
  const reliefs: Relief[] = [
    { id: "individual", label: "Individual and dependent relatives", amount: s.reliefs.individual.amount },
    ...(input.epf
      ? [{ id: "epf" as const, label: "KWSP contributions", amount: Math.min(epfContribution, s.reliefs.epf.amount) }]
      : []),
    ...(input.otherReliefs > 0 ? [{ id: "other" as const, label: "Other reliefs", amount: input.otherReliefs }] : []),
  ];
  const chargeable = Math.max(0, income - reliefs.reduce((t, r) => t + r.amount, 0));

  const slices: BandSlice[] = s.bands.map((b) => {
    const top = b.upper === null ? chargeable : Math.min(chargeable, b.upper);
    const taxable = Math.max(0, top - b.lower);
    return {
      band: b.band,
      lower: b.lower,
      upper: b.upper,
      ratePct: b.rate_pct,
      taxable,
      tax: sen((taxable * b.rate_pct) / 100),
    };
  });
  const taxBeforeRebate = sen(slices.reduce((t, b) => t + b.tax, 0));
  const rebate = chargeable < s.rebate.chargeable_income_below ? Math.min(s.rebate.amount, taxBeforeRebate) : 0;
  const tax = sen(taxBeforeRebate - rebate);
  const marginal = [...slices].reverse().find((b) => b.taxable > 0);

  return {
    income,
    epfContribution,
    reliefs,
    chargeable,
    slices,
    taxBeforeRebate,
    rebate,
    tax,
    effectiveRatePct: income > 0 ? (tax / income) * 100 : 0,
    marginalRatePct: rebate > 0 && tax === 0 ? 0 : (marginal?.ratePct ?? 0),
    takeHome: sen(income - tax - epfContribution),
  };
}

// ── A reader's own schedule ────────────────────────────────────────────────────────────────────────────────────
// The simulator changes only the bands and their rates; the reliefs, the rebate and KWSP stay as LHDN and KWSP
// publish them. A schedule travels in the URL as `bands=0:0,5000:1,20000:3`: each band's lower bound in ringgit of
// chargeable income and its rate in percent, the last band open-ended. Nothing is stored anywhere else.

export interface ScenarioBand {
  lower: number; // whole ringgit of chargeable income; the band runs to the next band's lower bound
  ratePct: number;
}

export const MAX_BANDS = 15;
export const MAX_LOWER = 100_000_000;

// 1.1 * 100 is 110.00000000000001 in floating point, so compare with a tolerance rather than exactly.
const twoPlaces = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

/** The published bands, in the simulator's form. */
export function currentBands(s: TaxRules = SCHEDULE): ScenarioBand[] {
  return s.bands.map((b) => ({ lower: b.lower, ratePct: b.rate_pct }));
}

/** Why a set of bands cannot be a schedule, or null when it can. */
export function bandsProblem(bands: ScenarioBand[]): string | null {
  if (bands.length === 0) return "A schedule needs at least one band.";
  if (bands.length > MAX_BANDS) return `A schedule can have at most ${MAX_BANDS} bands.`;
  if (bands[0].lower !== 0) return "The first band must start at RM 0.";
  for (const [i, b] of bands.entries()) {
    if (!Number.isInteger(b.lower) || b.lower < 0 || b.lower > MAX_LOWER) {
      return `Band ${i + 1} must start at a whole number of ringgit up to RM ${MAX_LOWER.toLocaleString("en-MY")}.`;
    }
    if (i > 0 && b.lower <= bands[i - 1].lower) return `Band ${i + 1} must start above band ${i}.`;
    if (!Number.isFinite(b.ratePct) || b.ratePct < 0 || b.ratePct > 100 || !twoPlaces(b.ratePct)) {
      return `Band ${i + 1}'s rate must be between 0% and 100%, to two decimal places.`;
    }
  }
  return null;
}

/** "0:0,5000:1,…": the bands as the `bands` URL parameter carries them. */
export function formatBands(bands: ScenarioBand[]): string {
  return bands.map((b) => `${b.lower}:${b.ratePct}`).join(",");
}

/** The bands in a `bands` URL parameter, or null when it is missing or does not describe a schedule. */
export function parseBands(text: string | null): ScenarioBand[] | null {
  if (!text || text.length > 400) return null;
  const bands: ScenarioBand[] = [];
  for (const part of text.split(",")) {
    const found = /^(\d{1,9}):(\d{1,3}(?:\.\d{1,2})?)$/.exec(part);
    if (!found) return null;
    bands.push({ lower: Number(found[1]), ratePct: Number(found[2]) });
  }
  return bandsProblem(bands) === null ? bands : null;
}

export function sameBands(a: ScenarioBand[], b: ScenarioBand[]): boolean {
  return a.length === b.length && a.every((x, i) => x.lower === b[i].lower && x.ratePct === b[i].ratePct);
}

/** A schedule with the reader's bands and the published reliefs, rebate and KWSP rate. */
export function scenarioRules(bands: ScenarioBand[], s: TaxRules = SCHEDULE): TaxRules {
  return {
    reliefs: s.reliefs,
    rebate: s.rebate,
    epf: s.epf,
    bands: bands.map((b, i) => ({
      band: String(i + 1),
      lower: b.lower,
      upper: i + 1 < bands.length ? bands[i + 1].lower : null,
      rate_pct: b.ratePct,
    })),
  };
}

export interface Comparison {
  income: number;
  current: number;
  scenario: number;
  difference: number; // scenario less current: positive pays more
}

/** Tax at each income under the published schedule and under the reader's bands. */
export function compare(incomes: number[], input: Omit<TaxInput, "income">, bands: ScenarioBand[]): Comparison[] {
  const rules = scenarioRules(bands);
  return incomes.map((income) => {
    const current = calculateTax({ ...input, income }).tax;
    const scenario = calculateTax({ ...input, income }, rules).tax;
    return { income, current, scenario, difference: sen(scenario - current) };
  });
}
