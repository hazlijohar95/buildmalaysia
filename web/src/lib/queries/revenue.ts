import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";
import type { SankeyNode } from "@/components/Sankey/SankeyChartD3";
import { titleCase } from "@/lib/queries/sankey";

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
  return build(root);
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
