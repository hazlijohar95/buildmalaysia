import schedule2025 from "@/data/tax-schedule-2025.json";

/** A year of assessment's schedule, as `pipeline tax-schedule` reads it from LHDN and KWSP pages. */
export type TaxSchedule = typeof schedule2025;
export const SCHEDULE: TaxSchedule = schedule2025;

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
export function calculateTax(input: TaxInput, s: TaxSchedule = SCHEDULE): TaxResult {
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
