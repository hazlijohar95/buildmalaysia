import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";

/** Budget years with a loaded MOF budget book, newest first. */
export async function getBudgetYears(): Promise<number[]> {
  const rows = await sql<{ budget_year: number }[]>`select budget_year from budget_document order by budget_year desc`;
  return rows.map((r) => r.budget_year);
}

export interface BudgetSource {
  url: string;
  budget_year: number;
}

export async function getBudgetSource(budgetYear: number): Promise<BudgetSource | null> {
  const [row] = await sql<BudgetSource[]>`
    select sd.url, d.budget_year from budget_document d join source_document sd on sd.id = d.document_id
    where d.budget_year = ${budgetYear}
  `;
  return row ?? null;
}

export type Basis = "actual" | "original_estimate" | "estimate";

export interface BudgetYearTotal {
  fiscal_year: number;
  basis: Basis;
  operating_sen: Sen;
  development_sen: Sen;
  contingency_sen: Sen;
  grand_total_sen: Sen;
  pdf_page: number;
  book_page: number;
}

/** The grand summary for each of the book's four columns, oldest first. */
export async function getBudgetTotals(budgetYear: number): Promise<BudgetYearTotal[]> {
  const rows = await sql<
    {
      fiscal_year: number;
      basis: Basis;
      operating_sen: string;
      development_sen: string;
      contingency_sen: string;
      grand_total_sen: string;
      pdf_page: number;
      book_page: number;
    }[]
  >`
    select t.fiscal_year, t.basis::text as basis, t.operating_sen, t.development_sen, t.contingency_sen,
           t.grand_total_sen, t.pdf_page, t.book_page
    from budget_total t join budget_document d on d.document_id = t.document_id
    where d.budget_year = ${budgetYear}
    order by t.fiscal_year
  `;
  return rows.map((r) => ({
    ...r,
    operating_sen: parseSen(r.operating_sen),
    development_sen: parseSen(r.development_sen),
    contingency_sen: parseSen(r.contingency_sen),
    grand_total_sen: parseSen(r.grand_total_sen),
  }));
}

export interface BudgetVoteRow {
  vote_code: string;
  heading: string;
  note: string | null; // footnote on the ministry heading, e.g. a rename or merger
  amounts: Sen[]; // one per column, oldest first
  pdf_page: number;
  book_page: number;
}

/** Each vote's four figures as printed in the summary pages, in vote order. */
export async function getBudgetVotes(budgetYear: number): Promise<BudgetVoteRow[]> {
  const rows = await sql<
    { vote_code: string; heading: string; note: string | null; amounts: string[]; pdf_page: number; book_page: number }[]
  >`
    select f.vote_code, min(f.heading) as heading, min(f.note) as note,
           array_agg(f.total_sen::text order by f.fiscal_year) as amounts,
           min(f.pdf_page) as pdf_page, min(f.book_page) as book_page
    from budget_vote_figure f join budget_document d on d.document_id = f.document_id
    where d.budget_year = ${budgetYear}
    group by f.vote_code
    order by left(f.vote_code, 1) desc, f.vote_code
  `;
  return rows.map((r) => ({ ...r, amounts: r.amounts.map((a) => parseSen(a)) }));
}

export interface BudgetHeadingRow {
  code: string;
  programme_code: string;
  name_ms: string;
  prior_estimate_sen: Sen;
  estimate_sen: Sen;
  posts: number | null;
  pdf_page: number;
  book_page: number;
}

/** A T or B vote's programmes and activities with their printed totals and posts, in code order. */
export async function getBudgetOperatingHeadings(budgetYear: number, voteCode: string): Promise<BudgetHeadingRow[]> {
  const rows = await sql<
    {
      code: string;
      programme_code: string;
      name_ms: string;
      prior_estimate_sen: string;
      estimate_sen: string;
      posts: number | null;
      pdf_page: number;
      book_page: number;
    }[]
  >`
    select h.code, h.programme_code, h.name_ms, t.prior_estimate_sen, t.estimate_sen,
           (select sum(l.posts) from budget_operating_line l
             where l.document_id = h.document_id and l.vote_code = h.vote_code
               and (l.activity_code = h.code or (h.code like '%0000' and l.programme_code = h.code)))::int as posts,
           t.pdf_page, t.book_page
    from budget_heading h
    join budget_document d on d.document_id = h.document_id
    join budget_operating_total t
      on t.document_id = h.document_id and t.vote_code = h.vote_code and t.object_code is null
     and ((h.code like '%0000' and t.scope = 'programme' and t.programme_code = h.code)
       or (h.code not like '%0000' and t.scope = 'activity' and t.activity_code = h.code))
    where d.budget_year = ${budgetYear} and h.vote_code = ${voteCode}
    order by h.code
  `;
  return rows.map((r) => ({
    ...r,
    prior_estimate_sen: parseSen(r.prior_estimate_sen),
    estimate_sen: parseSen(r.estimate_sen),
  }));
}

export interface BudgetProjectRow {
  code: string;
  name_ms: string;
  group_name: string | null;
  group_ordinal: number | null;
  total_cost_sen: Sen;
  revised_sen: Sen;
  estimate_sen: Sen; // direct + loan
  estimate_loan_sen: Sen;
  pdf_page: number;
  book_page: number;
}

/** A P vote's projects in print order. */
export async function getBudgetProjects(budgetYear: number, voteCode: string): Promise<BudgetProjectRow[]> {
  const rows = await sql<
    {
      code: string;
      name_ms: string;
      group_name: string | null;
      group_ordinal: number | null;
      total_cost_sen: string;
      revised_sen: string;
      estimate_sen: string;
      estimate_loan_sen: string;
      pdf_page: number;
      book_page: number;
    }[]
  >`
    select p.code, p.name_ms, g.name_ms as group_name, p.group_ordinal, p.total_cost_sen, p.revised_sen,
           p.estimate_direct_sen + p.estimate_loan_sen as estimate_sen, p.estimate_loan_sen, p.pdf_page, p.book_page
    from budget_development_project p
    join budget_document d on d.document_id = p.document_id
    left join budget_development_group g
      on g.document_id = p.document_id and g.vote_code = p.vote_code and g.ordinal = p.group_ordinal
    where d.budget_year = ${budgetYear} and p.vote_code = ${voteCode}
    order by p.pdf_page, p.line_no
  `;
  return rows.map((r) => ({
    ...r,
    total_cost_sen: parseSen(r.total_cost_sen),
    revised_sen: parseSen(r.revised_sen),
    estimate_sen: parseSen(r.estimate_sen),
    estimate_loan_sen: parseSen(r.estimate_loan_sen),
  }));
}

/** Results of comparing MOF's printed actuals with the audited statements. */
export async function getBudgetActualCheck(budgetYear: number): Promise<{ result: string; count: number; worst_sen: number }[]> {
  const rows = await sql<{ result: string; count: string; worst_sen: string }[]>`
    select c.result, count(*) as count, max(abs(c.diff_sen)) as worst_sen
    from budget_actual_check c join budget_document d on d.document_id = c.document_id
    where d.budget_year = ${budgetYear}
    group by c.result order by c.result
  `;
  return rows.map((r) => ({ result: r.result, count: Number(r.count), worst_sen: Number(r.worst_sen) }));
}

/** The development budget as first approved for a fiscal year, from the next year's budget book. */
export async function getOriginalDevelopmentBudget(
  fiscalYear: number,
): Promise<{ development_sen: Sen; contingency_sen: Sen; budget_year: number; url: string; pdf_page: number; book_page: number } | null> {
  const [row] = await sql<
    { development_sen: string; contingency_sen: string; budget_year: number; url: string; pdf_page: number; book_page: number }[]
  >`
    select t.development_sen, t.contingency_sen, d.budget_year, sd.url, t.pdf_page, t.book_page
    from budget_total t
    join budget_document d on d.document_id = t.document_id
    join source_document sd on sd.id = d.document_id
    where t.fiscal_year = ${fiscalYear} and t.basis = 'original_estimate'
    order by d.budget_year
    limit 1
  `;
  return row
    ? { ...row, development_sen: parseSen(row.development_sen), contingency_sen: parseSen(row.contingency_sen) }
    : null;
}
