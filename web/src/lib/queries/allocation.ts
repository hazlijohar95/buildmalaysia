import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";
import { titleCase } from "@/lib/queries/sankey";
import { slugify } from "@/lib/slug";

/** One destination of the year's federal spending, as a share of the whole. */
export interface SpendingShare {
  id: string;
  name: string; // as printed, title-cased
  gloss: string | null; // English gloss for charged expenditure, which has no ministry page
  amount_sen: Sen;
  href: string | null;
}

/** Charged votes shown on their own; the rest are grouped. Glosses translate the printed names. */
const CHARGED: Record<string, string> = {
  "T.13": "Interest and other charges on government debt",
  "T.14": "Pensions, retirement allowances and gratuities",
  "T.12": "Grants to states and other Treasury payments",
};

/**
 * The year's federal spending split into ministries and charged expenditure, summing to the
 * federal_spending total. B.12's transfer to the Development Fund is left out, as on the spending
 * page, because the development spending it pays for is already counted under each ministry.
 */
export async function getSpendingShares(year: number): Promise<{ total_sen: Sen; items: SpendingShare[] } | null> {
  const [[total], ministries, charged] = await Promise.all([
    sql<{ total_actual_sen: string; development_fund_transfer_sen: string }[]>`
      select total_actual_sen, development_fund_transfer_sen from federal_spending where fiscal_year = ${year}
    `,
    sql<{ number: string; name_ms: string; operating_vote_code: string | null; actual_sen: string }[]>`
      select number, name_ms, operating_vote_code, actual_sen from ministry_spending where fiscal_year = ${year}
    `,
    sql<{ code: string; name_ms: string; actual_sen: string }[]>`
      select v.code, v.name_ms, sum(t.actual_sen) as actual_sen
      from printed_total t
      join vote v on v.fiscal_year = t.fiscal_year and v.code = t.vote_code
      where t.fiscal_year = ${year} and v.section = 'charged' and t.scope = 'programme' and t.object_code is null
      group by 1, 2
    `,
  ]);
  if (!total) return null;
  const transfer = Number(total.development_fund_transfer_sen);

  const items: SpendingShare[] = ministries.map((m) => ({
    id: `m-${m.number}`,
    name: titleCase(m.name_ms),
    gloss: null,
    amount_sen: parseSen(Number(m.actual_sen) - (m.operating_vote_code === "B.12" ? transfer : 0)),
    href: `/ministries/${slugify(m.name_ms)}`,
  }));
  const other = charged.filter((c) => !(c.code in CHARGED));
  items.push(
    ...charged
      .filter((c) => c.code in CHARGED)
      .map((c) => ({
        id: c.code,
        name: titleCase(c.name_ms),
        gloss: CHARGED[c.code],
        amount_sen: parseSen(c.actual_sen),
        href: `/${year}/vote/${c.code.replace(".", "")}`,
      })),
    {
      id: "T.other",
      name: "Perbelanjaan Tanggungan lain",
      gloss: `Other charged expenditure: ${other.map((c) => titleCase(c.name_ms)).join(", ")}`,
      amount_sen: parseSen(other.reduce((s, c) => s + Number(c.actual_sen), 0)),
      href: null,
    },
  );

  const sum = items.reduce((s, i) => s + i.amount_sen, 0);
  const totalSen = Number(total.total_actual_sen);
  if (Math.abs(sum - totalSen) > 100) {
    throw new Error(`spending shares for ${year} sum to ${sum} sen, federal_spending prints ${totalSen}`);
  }
  return { total_sen: parseSen(totalSen), items: items.filter((i) => i.amount_sen > 0).sort((a, b) => b.amount_sen - a.amount_sen) };
}
