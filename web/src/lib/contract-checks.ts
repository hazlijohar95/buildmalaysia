// The checks the contract and company pages run on MyProcurement's award results, and the limits they compare
// against. specs/contracts-commentary.md says why each exists; /contracts/method explains them to readers. A check
// raises a question for a reader to ask; it is not a finding of wrongdoing, and the pages say so.
import type { Sen } from "@/lib/money";

/** A quotation within this share of the tender limit, and not over it, counts as priced just under the limit. */
export const NEAR_LIMIT_SHARE = 0.95;
/** Quotations from one buyer to one company this many days either side of each other are read together. */
export const SPLIT_WINDOW_DAYS = 30;
/** A buyer's market is what it awarded in the same category over the years up to the contract's date. */
export const MARKET_YEARS = 3;
/** The fewest contracts a buyer's market needs before shares and concentration are given. */
export const MARKET_MIN_CONTRACTS = 10;
/** One company holding this share of a buyer's market dominates it. */
export const DOMINANT_SHARE = 0.5;
/** Herfindahl-Hirschman Index bands, from the 2023 US Merger Guidelines. */
export const HHI_MODERATE = 1000;
export const HHI_HIGH = 1800;
/** The fewest contracts a percentage is given on, and the fewest a rank is given among. */
export const MIN_FOR_SHARE = 5;
export const MIN_FOR_RANK = 10;

export const CIRCULARS = {
  pk21: {
    short: "PK 2.1",
    name: "PK 2.1 Kaedah Perolehan Kerajaan",
    url: "https://www.doa.gov.my/doa/resources/aktiviti_sumber/sumber_warga/jpict/PK2.1_kaedah_perolehan_kerajaan_pindaan01102024.pdf",
  },
  pk221of2023: {
    short: "PK 2.21 (2023–2024)",
    name: "PK 2.21 Kaedah Pelaksanaan Perolehan/Projek Kerajaan Tahun 2022, 2023 dan 2024",
    url: "http://www.mdbg.gov.my/images/pdf/pekeliling/PK_221_20062023.pdf",
  },
  pk221of2026: {
    short: "PK 2.21 (2026)",
    name: "PK 2.21 Kaedah Pelaksanaan Perolehan Kerajaan Tahun 2026",
    url: "https://jbrepository.ukm.my/ukm/reference/circulars/303/Pekeliling%20Perbendaharaan%20PK2.21%20Kaedah%20Pelaksanaan%20Perolehan%20Kerajaan%20Tahun%202026.pdf",
  },
} as const;
export type CircularId = keyof typeof CIRCULARS;

/** Works follow the works limits; supplies and non-consultancy services share theirs. Consultancy follows PK 2.4. */
export type ProcurementClass = "works" | "goods";

export function procurementClass(category: string): ProcurementClass | null {
  const c = category.trim().toLowerCase();
  if (c === "kerja") return "works";
  if (c.includes("bukan perunding") || c.startsWith("bekalan")) return "goods";
  return null;
}

export interface QuotationLimit {
  class: ProcurementClass;
  from: string; // ISO date, inclusive
  to: string | null; // ISO date, inclusive; null while in force
  sen: Sen;
  circular: CircularId;
}

const rm = (ringgit: number) => (ringgit * 100) as Sen;

/** The most a quotation may be before the purchase must go to open tender. Works in 2025 are left out: PK 2.21 for
 * 2025 was amended partway through the year, and the date the higher limit took effect is not settled. */
export const QUOTATION_LIMITS: readonly QuotationLimit[] = [
  { class: "goods", from: "2013-01-01", to: null, sen: rm(500_000), circular: "pk21" },
  { class: "works", from: "2013-01-01", to: "2023-06-30", sen: rm(500_000), circular: "pk21" },
  { class: "works", from: "2023-07-01", to: "2024-12-31", sen: rm(1_000_000), circular: "pk221of2023" },
  { class: "works", from: "2026-01-01", to: "2026-12-31", sen: rm(3_000_000), circular: "pk221of2026" },
];

export function quotationLimit(category: string, dated: string): QuotationLimit | null {
  const cls = procurementClass(category);
  if (!cls) return null;
  return QUOTATION_LIMITS.find((l) => l.class === cls && l.from <= dated && (l.to === null || dated <= l.to)) ?? null;
}

/** Priced within 5% under the limit: the band where a price set to avoid a tender would sit. */
export function isNearLimit(value: Sen | null, limit: Sen): boolean {
  return value !== null && value > limit * NEAR_LIMIT_SHARE && value <= limit;
}

export interface SplitReading {
  count: number;
  total: Sen;
  raised: boolean;
}

/** Quotations one buyer gave one company within the window: raised when there are several and together they pass
 * the tender limit, though each is under it. */
export function readSplitting(values: (Sen | null)[], limit: Sen): SplitReading {
  const priced = values.filter((v): v is Sen => v !== null);
  const total = priced.reduce((s, v) => s + v, 0) as Sen;
  const eachUnder = priced.every((v) => v <= limit);
  return { count: priced.length, total, raised: priced.length >= 2 && eachUnder && total > limit };
}

/** The Herfindahl-Hirschman Index of a market: the sum of the squared percentage shares, 0 to 10,000. */
export function hhi(values: number[]): number {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return 0;
  return values.reduce((s, v) => s + ((Math.max(0, v) / total) * 100) ** 2, 0);
}

export type Concentration = "low" | "moderate" | "high";

export function concentration(index: number): Concentration {
  return index > HHI_HIGH ? "high" : index >= HHI_MODERATE ? "moderate" : "low";
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n.toLocaleString("en-MY")}${suffix}`;
}

/** A share as a percentage for prose: one decimal under 10%, whole numbers above. */
export function percent(share: number): string {
  const p = share * 100;
  if (p > 0 && p < 0.1) return "under 0.1%";
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** The ISO date `days` from `iso`. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The ISO date `years` before `iso`, the start of a market window (exclusive). */
export function yearsBefore(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}
