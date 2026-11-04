import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";

/** The figures Lampiran 2 prints for every project and total, in sen. */
export interface DevelopmentAmounts {
  total_cost_sen: Sen;
  estimate_sen: Sen;
  actual_loan_sen: Sen;
  actual_sen: Sen;
  plan_actual_to_date_sen: Sen;
}

/** Each row is printed across a spread: label on pdf_page, the year's figures on pdf_page + 1. */
export interface SpreadSource {
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

export interface DevelopmentVoteSummary extends DevelopmentAmounts, SpreadSource {
  code: string;
  name_ms: string;
}

export interface DevelopmentGroupTotal extends DevelopmentAmounts, SpreadSource {
  ordinal: number;
  name_ms: string;
  parent_ordinal: number | null;
}

export interface DevelopmentProjectRow extends DevelopmentAmounts, SpreadSource {
  code: string;
  name_ms: string;
  group_ordinal: number | null;
  footnote: string | null;
}

interface RawAmounts {
  total_cost_sen: string;
  estimate_sen: string;
  actual_loan_sen: string;
  actual_sen: string;
  plan_actual_to_date_sen: string;
}

function amounts(r: RawAmounts): DevelopmentAmounts {
  return {
    total_cost_sen: parseSen(r.total_cost_sen),
    estimate_sen: parseSen(r.estimate_sen),
    actual_loan_sen: parseSen(r.actual_loan_sen),
    actual_sen: parseSen(r.actual_sen),
    plan_actual_to_date_sen: parseSen(r.plan_actual_to_date_sen),
  };
}

export type DevelopmentSortKey = "code" | "estimate_sen" | "actual_sen";

export async function getDevelopmentVotes(
  year: number,
  sort: DevelopmentSortKey = "code",
): Promise<DevelopmentVoteSummary[]> {
  const order: Record<DevelopmentSortKey, string> = {
    code: "v.code",
    estimate_sen: "t.estimate_sen desc",
    actual_sen: "t.actual_sen desc",
  };
  const rows = await sql<(RawAmounts & SpreadSource & { code: string; name_ms: string })[]>`
    select v.code, v.name_ms, t.total_cost_sen, t.estimate_sen, t.actual_loan_sen, t.actual_sen,
           t.plan_actual_to_date_sen, t.pdf_page, t.book_page, sd.url as doc_url
    from development_vote v
    join development_printed_total t
      on t.fiscal_year = v.fiscal_year and t.vote_code = v.code and t.scope = 'vote'
    join source_document sd on sd.id = t.document_id
    where v.fiscal_year = ${year}
    order by ${sql.unsafe(order[sort])}
  `;
  return rows.map((r) => ({ ...r, ...amounts(r) }));
}

export interface DevelopmentStatementTotal extends DevelopmentAmounts, SpreadSource {
  footnote: string | null;
}

export async function getDevelopmentStatementTotal(year: number): Promise<DevelopmentStatementTotal | null> {
  const [row] = await sql<(RawAmounts & SpreadSource & { footnote: string | null })[]>`
    select t.total_cost_sen, t.estimate_sen, t.actual_loan_sen, t.actual_sen, t.plan_actual_to_date_sen,
           t.footnote, t.pdf_page, t.book_page, sd.url as doc_url
    from development_printed_total t
    join source_document sd on sd.id = t.document_id
    where t.fiscal_year = ${year} and t.scope = 'statement'
  `;
  return row ? { ...row, ...amounts(row) } : null;
}

export interface DevelopmentVoteDetail {
  vote: DevelopmentVoteSummary;
  groups: DevelopmentGroupTotal[];
  projects: DevelopmentProjectRow[];
}

export async function getDevelopmentVote(year: number, code: string): Promise<DevelopmentVoteDetail | null> {
  const [vote] = await getDevelopmentVotes(year).then((votes) => votes.filter((v) => v.code === code));
  if (!vote) return null;
  const [groups, projects] = await Promise.all([
    sql<(RawAmounts & SpreadSource & { ordinal: number; name_ms: string; parent_ordinal: number | null })[]>`
      select g.ordinal, g.name_ms, g.parent_ordinal, t.total_cost_sen, t.estimate_sen, t.actual_loan_sen,
             t.actual_sen, t.plan_actual_to_date_sen, t.pdf_page, t.book_page, sd.url as doc_url
      from development_group g
      join development_printed_total t
        on t.fiscal_year = g.fiscal_year and t.vote_code = g.vote_code and t.group_ordinal = g.ordinal
      join source_document sd on sd.id = t.document_id
      where g.fiscal_year = ${year} and g.vote_code = ${code}
      order by g.ordinal
    `,
    sql<(RawAmounts & SpreadSource & { code: string; name_ms: string; group_ordinal: number | null;
      footnote: string | null })[]>`
      select p.code, p.name_ms, p.group_ordinal, p.footnote, p.total_cost_sen, p.estimate_sen,
             p.actual_loan_sen, p.actual_sen, p.plan_actual_to_date_sen, p.pdf_page, p.book_page,
             sd.url as doc_url
      from development_project p
      join source_document sd on sd.id = p.document_id
      where p.fiscal_year = ${year} and p.vote_code = ${code}
      order by p.pdf_page, p.line_no
    `,
  ]);
  return {
    vote,
    groups: groups.map((g) => ({ ...g, ...amounts(g) })),
    projects: projects.map((p) => ({ ...p, ...amounts(p) })),
  };
}

/** The Malaysia Plan the statement's spending-to-date column counts against, e.g. "RMKe-12". */
export async function getDevelopmentPlan(year: number): Promise<string | null> {
  const [row] = await sql<{ plan: string }[]>`
    select plan from development_statement where fiscal_year = ${year}
  `;
  return row?.plan ?? null;
}
