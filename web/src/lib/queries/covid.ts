import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";

export interface CovidFundRow {
  code: string | null; // null for the printed grand total
  name_ms: string;
  ceiling_sen: Sen;
  withdrawal_sen: Sen; // Tarik, negative as printed; zero in years that print no such column
  revised_sen: Sen;
  actual_sen: Sen;
  spent_to_date_sen: Sen;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

interface RawRow {
  code: string | null;
  name_ms: string;
  ceiling_sen: string;
  withdrawal_sen: string;
  revised_sen: string;
  actual_sen: string;
  spent_to_date_sen: string;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

function row(r: RawRow): CovidFundRow {
  return {
    ...r,
    ceiling_sen: parseSen(r.ceiling_sen),
    withdrawal_sen: parseSen(r.withdrawal_sen),
    revised_sen: parseSen(r.revised_sen),
    actual_sen: parseSen(r.actual_sen),
    spent_to_date_sen: parseSen(r.spent_to_date_sen),
  };
}

/** COVID-19 Fund programmes in print order, then the printed total; empty when the year has no fund. */
export async function getCovidFund(year: number): Promise<{ lines: CovidFundRow[]; total: CovidFundRow | null }> {
  const [lines, totals] = await Promise.all([
    sql<RawRow[]>`
      select l.code, l.name_ms, l.ceiling_sen, l.withdrawal_sen, l.revised_sen, l.actual_sen, l.spent_to_date_sen,
             l.pdf_page, l.book_page, sd.url as doc_url
      from covid_fund_line l join source_document sd on sd.id = l.document_id
      where l.fiscal_year = ${year}
      order by l.line_no
    `,
    sql<RawRow[]>`
      select null as code, 'Jumlah Keseluruhan' as name_ms, t.ceiling_sen, t.withdrawal_sen, t.revised_sen, t.actual_sen,
             t.spent_to_date_sen, t.pdf_page, t.book_page, sd.url as doc_url
      from covid_fund_total t join source_document sd on sd.id = t.document_id
      where t.fiscal_year = ${year}
    `,
  ]);
  return { lines: lines.map(row), total: totals[0] ? row(totals[0]) : null };
}

/** Fiscal years with a COVID-19 Fund statement, newest first. */
export async function getCovidYears(): Promise<number[]> {
  const rows = await sql<{ fiscal_year: number }[]>`select fiscal_year from covid_fund_total order by fiscal_year desc`;
  return rows.map((r) => r.fiscal_year);
}
