import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";

/** Whole-year spending from the federal_spending view: the transfer to the Development Fund counted once. */
export interface FederalSpending {
  operating_actual_sen: Sen;
  development_fund_transfer_sen: Sen;
  operating_net_actual_sen: Sen;
  development_actual_sen: Sen;
  covid_fund_actual_sen: Sen | null;
  total_actual_sen: Sen;
  operating_pdf_page: number;
  operating_book_page: number;
  transfer_pdf_page: number;
  transfer_book_page: number;
  development_pdf_page: number;
  development_book_page: number;
  covid_fund_pdf_page: number | null;
  covid_fund_book_page: number | null;
  doc_url: string;
}

interface RawFederalSpending {
  operating_actual_sen: string;
  development_fund_transfer_sen: string;
  operating_net_actual_sen: string;
  development_actual_sen: string;
  covid_fund_actual_sen: string | null;
  total_actual_sen: string;
  operating_pdf_page: number;
  operating_book_page: number;
  transfer_pdf_page: number;
  transfer_book_page: number;
  development_pdf_page: number;
  development_book_page: number;
  covid_fund_pdf_page: number | null;
  covid_fund_book_page: number | null;
  doc_url: string;
}

export async function getFederalSpending(year: number): Promise<FederalSpending | null> {
  const [row] = await sql<RawFederalSpending[]>`
    select operating_actual_sen, development_fund_transfer_sen, operating_net_actual_sen,
           development_actual_sen, covid_fund_actual_sen, total_actual_sen, operating_pdf_page,
           operating_book_page, transfer_pdf_page, transfer_book_page, development_pdf_page,
           development_book_page, covid_fund_pdf_page, covid_fund_book_page, doc_url
    from federal_spending
    where fiscal_year = ${year}
  `;
  if (!row) return null;
  return {
    ...row,
    operating_actual_sen: parseSen(row.operating_actual_sen),
    development_fund_transfer_sen: parseSen(row.development_fund_transfer_sen),
    operating_net_actual_sen: parseSen(row.operating_net_actual_sen),
    development_actual_sen: parseSen(row.development_actual_sen),
    covid_fund_actual_sen: row.covid_fund_actual_sen === null ? null : parseSen(row.covid_fund_actual_sen),
    total_actual_sen: parseSen(row.total_actual_sen),
  };
}

/** One row per ministry: its supply vote (B.nn) and development vote (P.nn), as printed. */
export interface MinistrySpending {
  number: string;
  name_ms: string;
  operating_vote_code: string | null;
  operating_actual_sen: Sen | null;
  development_vote_code: string | null;
  development_actual_sen: Sen | null;
  actual_sen: Sen;
}

interface RawMinistrySpending {
  number: string;
  name_ms: string;
  operating_vote_code: string | null;
  operating_actual_sen: string | null;
  development_vote_code: string | null;
  development_actual_sen: string | null;
  actual_sen: string;
}

export async function getMinistrySpending(year: number): Promise<MinistrySpending[]> {
  const rows = await sql<RawMinistrySpending[]>`
    select number, name_ms, operating_vote_code, operating_actual_sen,
           development_vote_code, development_actual_sen, actual_sen
    from ministry_spending
    where fiscal_year = ${year}
    order by actual_sen desc, number
  `;
  return rows.map((r) => ({
    ...r,
    operating_actual_sen: r.operating_actual_sen === null ? null : parseSen(r.operating_actual_sen),
    development_actual_sen: r.development_actual_sen === null ? null : parseSen(r.development_actual_sen),
    actual_sen: parseSen(r.actual_sen),
  }));
}

/** The other half of a ministry: B.nn for a development vote P.nn, and P.nn for B.nn. */
export async function getPairedVote(year: number, code: string): Promise<string | null> {
  const [row] = await sql<{ paired: string | null }[]>`
    select case when operating_vote_code = ${code} then development_vote_code else operating_vote_code end as paired
    from ministry_spending
    where fiscal_year = ${year} and ${code} in (operating_vote_code, development_vote_code)
  `;
  return row?.paired ?? null;
}

export interface YearSpending {
  fiscal_year: number;
  operating_net_actual_sen: Sen;
  development_actual_sen: Sen;
  covid_fund_actual_sen: Sen;
  total_actual_sen: Sen;
}

/** Total spending for every loaded year, oldest first. */
export async function getSpendingByYear(): Promise<YearSpending[]> {
  const rows = await sql<
    {
      fiscal_year: number;
      operating_net_actual_sen: string;
      development_actual_sen: string;
      covid_fund_actual_sen: string;
      total_actual_sen: string;
    }[]
  >`
    select fiscal_year, operating_net_actual_sen, development_actual_sen,
           coalesce(covid_fund_actual_sen, 0) as covid_fund_actual_sen, total_actual_sen
    from federal_spending
    order by fiscal_year
  `;
  return rows.map((r) => ({
    fiscal_year: r.fiscal_year,
    operating_net_actual_sen: parseSen(r.operating_net_actual_sen),
    development_actual_sen: parseSen(r.development_actual_sen),
    covid_fund_actual_sen: parseSen(r.covid_fund_actual_sen),
    total_actual_sen: parseSen(r.total_actual_sen),
  }));
}
