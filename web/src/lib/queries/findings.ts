import sql from "@/lib/db";
import { reorganisedBetween } from "@/lib/lineage";
import { parseSen, type Sen } from "@/lib/money";
import { getBodyLineage } from "@/lib/queries/lineage";

/** Raw data for the debt-service (T.13) finding. */
export interface DebtServiceData {
  year: number;
  actual: Sen;
  totalFederal: Sen;
  earliestYear: number;
  earliestActual: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

/**
 * Returns null when T.13 is absent for the year, or when its printed name differs from
 * PERBELANJAAN KERANA HUTANG NEGARA (a name change would invalidate the cross-year
 * comparison and signals the vote has been restructured).
 */
export async function getDebtServiceData(year: number): Promise<DebtServiceData | null> {
  const EXPECTED_NAME = "PERBELANJAAN KERANA HUTANG NEGARA";
  const [row] = await sql<
    {
      actual_sen: string;
      total_sen: string;
      pdf_page: number;
      book_page: number;
      doc_url: string;
      name_ms: string;
    }[]
  >`
    select v.name_ms, pt.actual_sen, fs.total_actual_sen as total_sen,
           pt.pdf_page, pt.book_page, sd.url as doc_url
    from vote v
    join printed_total pt
      on pt.fiscal_year = v.fiscal_year and pt.vote_code = v.code
     and pt.scope = 'vote' and pt.object_code is null
    join federal_spending fs on fs.fiscal_year = v.fiscal_year
    join source_document sd on sd.id = pt.document_id
    where v.fiscal_year = ${year} and v.code = 'T.13'
  `;
  if (!row || row.name_ms !== EXPECTED_NAME) return null;

  const [earliest] = await sql<{ fiscal_year: number; actual_sen: string }[]>`
    select v.fiscal_year, pt.actual_sen
    from vote v
    join printed_total pt
      on pt.fiscal_year = v.fiscal_year and pt.vote_code = v.code
     and pt.scope = 'vote' and pt.object_code is null
    where v.code = 'T.13' and v.name_ms = ${EXPECTED_NAME}
    order by v.fiscal_year asc limit 1
  `;
  if (!earliest) return null;

  return {
    year,
    actual: parseSen(row.actual_sen),
    totalFederal: parseSen(row.total_sen),
    earliestYear: earliest.fiscal_year,
    earliestActual: parseSen(earliest.actual_sen),
    pdfPage: row.pdf_page,
    bookPage: row.book_page,
    docUrl: row.doc_url,
  };
}

/** Raw data for the Emolumen (object group 10000) finding. */
export interface EmolumenData {
  year: number;
  actual: Sen;
  operatingActual: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export async function getEmolumenData(year: number): Promise<EmolumenData | null> {
  const [row] = await sql<
    {
      actual_sen: string;
      operating_actual_sen: string;
      pdf_page: number;
      book_page: number;
      doc_url: string;
    }[]
  >`
    select pt.actual_sen, fs.operating_actual_sen, pt.pdf_page, pt.book_page, sd.url as doc_url
    from printed_total pt
    join source_document sd on sd.id = pt.document_id
    join federal_spending fs on fs.fiscal_year = pt.fiscal_year
    where pt.fiscal_year = ${year} and pt.scope = 'statement' and pt.object_code = '10000'
  `;
  if (!row) return null;
  return {
    year,
    actual: parseSen(row.actual_sen),
    operatingActual: parseSen(row.operating_actual_sen),
    pdfPage: row.pdf_page,
    bookPage: row.book_page,
    docUrl: row.doc_url,
  };
}

/** Raw data for the development-delivery finding. */
export interface DevelopmentDeliveryData {
  year: number;
  actual: Sen;
  estimate: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export async function getDevelopmentDeliveryData(year: number): Promise<DevelopmentDeliveryData | null> {
  const [row] = await sql<
    {
      actual_sen: string;
      estimate_sen: string;
      pdf_page: number;
      book_page: number;
      doc_url: string;
    }[]
  >`
    select t.actual_sen, t.estimate_sen, t.pdf_page, t.book_page, sd.url as doc_url
    from development_printed_total t
    join source_document sd on sd.id = t.document_id
    where t.fiscal_year = ${year} and t.scope = 'statement'
  `;
  if (!row) return null;
  return {
    year,
    actual: parseSen(row.actual_sen),
    estimate: parseSen(row.estimate_sen),
    pdfPage: row.pdf_page,
    bookPage: row.book_page,
    docUrl: row.doc_url,
  };
}

/** Raw data for the largest-development-project finding. */
export interface LargestProjectData {
  year: number;
  projectName: string;
  voteCode: string;
  voteName: string;
  actual: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export async function getLargestProjectData(year: number): Promise<LargestProjectData | null> {
  const [row] = await sql<
    {
      project_name: string;
      vote_code: string;
      vote_name: string;
      actual_sen: string;
      pdf_page: number;
      book_page: number;
      doc_url: string;
    }[]
  >`
    select p.name_ms as project_name, p.vote_code, v.name_ms as vote_name,
           p.actual_sen, p.pdf_page, p.book_page, sd.url as doc_url
    from development_project p
    join development_vote v on v.fiscal_year = p.fiscal_year and v.code = p.vote_code
    join source_document sd on sd.id = p.document_id
    where p.fiscal_year = ${year}
    order by p.actual_sen desc limit 1
  `;
  if (!row) return null;
  return {
    year,
    projectName: row.project_name,
    voteCode: row.vote_code,
    voteName: row.vote_name,
    actual: parseSen(row.actual_sen),
    pdfPage: row.pdf_page,
    bookPage: row.book_page,
    docUrl: row.doc_url,
  };
}

/** Raw data for the supplementary-votes finding. Returns null when the year has no supplementary column. */
export interface SupplementaryData {
  year: number;
  supplementary: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

export async function getSupplementaryData(year: number): Promise<SupplementaryData | null> {
  const [row] = await sql<
    {
      supplementary_sen: string | null;
      pdf_page: number;
      book_page: number;
      doc_url: string;
    }[]
  >`
    select pt.supplementary_sen, pt.pdf_page, pt.book_page, sd.url as doc_url
    from printed_total pt
    join source_document sd on sd.id = pt.document_id
    where pt.fiscal_year = ${year} and pt.scope = 'statement' and pt.object_code is null
  `;
  if (!row || row.supplementary_sen === null) return null;
  return {
    year,
    supplementary: parseSen(row.supplementary_sen),
    pdfPage: row.pdf_page,
    bookPage: row.book_page,
    docUrl: row.doc_url,
  };
}

/** Raw data for the fastest-growing ministry finding. */
export interface TopGrowthMinistryData {
  year: number;
  priorYear: number;
  name: string;
  operatingVoteCode: string;
  currentActual: Sen;
  priorActual: Sen;
  pdfPage: number;
  bookPage: number;
  docUrl: string;
}

/**
 * Returns the body whose total actual spending grew most (by percentage) from the prior year, leaving out any body
 * reorganised, set up or dissolved in either year.
 */
export async function getTopGrowthMinistryData(year: number): Promise<TopGrowthMinistryData | null> {
  const [rows, lineageOf] = await Promise.all([
    sql<
      {
        body_id: string;
        name_ms: string;
        operating_vote_code: string;
        curr_actual: string;
        prev_actual: string;
        prev_year: number;
        pdf_page: number;
        book_page: number;
        doc_url: string;
      }[]
    >`
      select curr.body_id, curr.body_name_ms as name_ms, curr.operating_vote_code, curr.actual_sen as curr_actual,
             prev.actual_sen as prev_actual, prev.fiscal_year as prev_year, pt.pdf_page, pt.book_page, sd.url as doc_url
      from ministry_spending curr
      join ministry_spending prev
        on prev.fiscal_year = curr.fiscal_year - 1
       and prev.body_id = curr.body_id
      join printed_total pt
        on pt.fiscal_year = curr.fiscal_year and pt.vote_code = curr.operating_vote_code
       and pt.scope = 'vote' and pt.object_code is null
      join source_document sd on sd.id = pt.document_id
      where curr.fiscal_year = ${year}
        and not curr.residual and not prev.residual
        and prev.actual_sen > 0
        and curr.actual_sen > prev.actual_sen
    `,
    getBodyLineage(),
  ]);
  const growth = (r: (typeof rows)[number]) => (Number(r.curr_actual) - Number(r.prev_actual)) / Number(r.prev_actual);
  const [row] = rows
    .filter((r) => !reorganisedBetween(lineageOf(r.body_id), r.prev_year, year))
    .toSorted((a, b) => growth(b) - growth(a));
  if (!row) return null;
  return {
    year,
    priorYear: row.prev_year,
    name: row.name_ms,
    operatingVoteCode: row.operating_vote_code,
    currentActual: parseSen(row.curr_actual),
    priorActual: parseSen(row.prev_actual),
    pdfPage: row.pdf_page,
    bookPage: row.book_page,
    docUrl: row.doc_url,
  };
}
