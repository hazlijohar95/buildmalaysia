import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";
import type { SankeyNode } from "@/components/Sankey/SankeyChartD3";
import { SMALL_SHARE, groupSmall, titleCase } from "@/lib/queries/sankey";

interface CategoryRow {
  category: string;
  parent_category: string | null;
  name_ms: string;
}

interface LineRow {
  category: string;
  ordinal: number;
  name_ms: string;
  actual_sen: string;
}

/**
 * Revenue side of the year's Sankey, from JANM's Note 5(a) "Hasil mengikut penjenisan": HASIL, then
 * its printed categories, then the items. Amounts are in ringgit; the load has already reconciled
 * every category total against its items.
 */
export async function getRevenueTree(year: number): Promise<SankeyNode | null> {
  const [categories, lines] = await Promise.all([
    sql<CategoryRow[]>`
      select category::text as category, parent_category::text as parent_category, name_ms
      from revenue_total where fiscal_year = ${year}
    `,
    sql<LineRow[]>`
      select category::text as category, ordinal, name_ms, actual_sen
      from revenue_line where fiscal_year = ${year} order by ordinal
    `,
  ]);
  const root = categories.find((c) => c.parent_category === null);
  if (!root) return null;

  const build = (c: CategoryRow): SankeyNode => ({
    id: `revenue-${c.category}`,
    displayName: titleCase(c.name_ms),
    children: [
      ...categories.filter((child) => child.parent_category === c.category).map(build),
      ...lines
        .filter((l) => l.category === c.category && l.actual_sen !== "0")
        .map((l) => ({
          id: `revenue-line-${l.ordinal}`,
          displayName: l.name_ms,
          amount: Number(l.actual_sen) / 100,
        })),
    ],
  });
  const tree = build(root);
  const sum = lines.reduce((t, l) => t + Number(l.actual_sen) / 100, 0);
  return groupSmall(tree, sum * SMALL_SHARE, "Other revenue");
}

/** HASIL for a year as printed in Note 5(a), with its page. */
export async function getRevenueTotal(
  year: number,
): Promise<{ actual_sen: Sen; pdf_page: number; book_page: number; doc_url: string } | null> {
  const [row] = await sql<{ actual_sen: string; pdf_page: number; book_page: number; doc_url: string }[]>`
    select t.actual_sen, t.pdf_page, t.book_page, sd.url as doc_url
    from revenue_total t join source_document sd on sd.id = t.document_id
    where t.fiscal_year = ${year} and t.category = 'revenue'
  `;
  return row ? { ...row, actual_sen: parseSen(row.actual_sen) } : null;
}

/**
 * Revenue categories that hold items, in the order the note prints them, with an English name. Statements
 * up to FY2016 list tax items straight under HASIL CUKAI with no direct/indirect split; those show as "tax".
 */
export const REVENUE_CATEGORIES = [
  { category: "direct_tax", en: "Direct tax" },
  { category: "indirect_tax", en: "Indirect tax" },
  { category: "tax", en: "Tax, not split by type" },
  { category: "non_tax", en: "Non-tax revenue" },
  { category: "non_revenue_receipts", en: "Non-revenue receipts" },
  { category: "federal_territory", en: "Federal Territory revenue" },
] as const;
export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number]["category"];

interface TotalRow {
  fiscal_year: number;
  category: string;
  name_ms: string;
  original_estimate_sen: string | null;
  revised_estimate_sen: string | null;
  actual_sen: string | null;
  prior_year_actual_sen: string | null;
  pdf_page: number;
  book_page: number;
}

interface LineRow2 extends Omit<TotalRow, "actual_sen"> {
  ordinal: number;
  actual_sen: string;
}

/**
 * A category's figure for one year: the printed total, or, where the note prints only a heading with no
 * amount (FY2017's tax subtotals), the sum of the items printed under it. `printed` says which.
 */
function categoryActual(t: TotalRow | undefined, items: LineRow2[]): { sen: Sen; printed: boolean } | null {
  if (items.length === 0) return null; // a parent category such as HASIL CUKAI once it is split
  if (t?.actual_sen != null) return { sen: parseSen(t.actual_sen), printed: true };
  return { sen: parseSen(items.reduce((s, i) => s + Number(i.actual_sen), 0)), printed: false };
}

async function revenueRows(year?: number): Promise<{ totals: TotalRow[]; lines: LineRow2[] }> {
  const [totals, lines] = await Promise.all([
    sql<TotalRow[]>`
      select fiscal_year, category::text as category, name_ms, original_estimate_sen, revised_estimate_sen,
             actual_sen, prior_year_actual_sen, pdf_page, book_page
      from revenue_total ${year === undefined ? sql`` : sql`where fiscal_year = ${year}`}
    `,
    sql<LineRow2[]>`
      select fiscal_year, category::text as category, ordinal, name_ms, original_estimate_sen, revised_estimate_sen,
             actual_sen, prior_year_actual_sen, pdf_page, book_page
      from revenue_line ${year === undefined ? sql`` : sql`where fiscal_year = ${year}`}
      order by fiscal_year, ordinal
    `,
  ]);
  return { totals, lines };
}

/** Every loaded year's HASIL and its item-holding categories (zero where a year has no such category). */
export async function getRevenueHistory(): Promise<{ year: number; total: Sen; byCategory: Record<RevenueCategory, Sen> }[]> {
  const { totals, lines } = await revenueRows();
  const years = [...new Set(totals.map((r) => r.fiscal_year))].sort((a, b) => a - b);
  return years.map((year) => {
    const of = (c: string) =>
      categoryActual(
        totals.find((r) => r.fiscal_year === year && r.category === c),
        lines.filter((l) => l.fiscal_year === year && l.category === c),
      )?.sen ?? parseSen(0);
    const byCategory = Object.fromEntries(REVENUE_CATEGORIES.map((c) => [c.category, of(c.category)])) as Record<
      RevenueCategory,
      Sen
    >;
    const hasil = totals.find((r) => r.fiscal_year === year && r.category === "revenue");
    return { year, total: parseSen(hasil?.actual_sen ?? 0), byCategory };
  });
}

export interface RevenueItem {
  ordinal: number;
  name_ms: string;
  original_sen: Sen | null;
  revised_sen: Sen | null;
  actual_sen: Sen;
  prior_sen: Sen | null;
  pdf_page: number;
  book_page: number;
}

export interface RevenueGroup {
  category: RevenueCategory;
  name_ms: string;
  actual_sen: Sen;
  printed: boolean; // false: the note prints only a heading, and the figure is the sum of its items
  revised_sen: Sen | null;
  prior_sen: Sen | null;
  pdf_page: number;
  book_page: number;
  items: RevenueItem[];
}

const senOrNull = (v: string | null) => (v === null ? null : parseSen(v));

/** One year's revenue note: the categories that hold items, with their items, as printed. */
export async function getRevenueDetail(year: number): Promise<{ doc_url: string; groups: RevenueGroup[] } | null> {
  const [{ totals, lines }, [doc]] = await Promise.all([
    revenueRows(year),
    sql<{ doc_url: string }[]>`
      select sd.url as doc_url from revenue_total t join source_document sd on sd.id = t.document_id
      where t.fiscal_year = ${year} and t.category = 'revenue'
    `,
  ]);
  if (!doc) return null;
  const groups = REVENUE_CATEGORIES.flatMap(({ category }): RevenueGroup[] => {
    const t = totals.find((r) => r.category === category);
    const items = lines.filter((l) => l.category === category);
    const actual = categoryActual(t, items);
    if (!t || !actual) return [];
    return [
      {
        category,
        name_ms: t.name_ms,
        actual_sen: actual.sen,
        printed: actual.printed,
        revised_sen: senOrNull(t.revised_estimate_sen),
        prior_sen: senOrNull(t.prior_year_actual_sen),
        pdf_page: t.pdf_page,
        book_page: t.book_page,
        items: items.map((l) => ({
          ordinal: l.ordinal,
          name_ms: l.name_ms,
          original_sen: senOrNull(l.original_estimate_sen),
          revised_sen: senOrNull(l.revised_estimate_sen),
          actual_sen: parseSen(l.actual_sen),
          prior_sen: senOrNull(l.prior_year_actual_sen),
          pdf_page: l.pdf_page,
          book_page: l.book_page,
        })),
      },
    ];
  });
  return { doc_url: doc.doc_url, groups };
}
