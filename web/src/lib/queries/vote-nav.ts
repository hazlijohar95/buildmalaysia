// Wayfinding for vote pages: which loaded years print a vote, under what name, and which ministry it belongs to.
import sql from "@/lib/db";
import { slugify } from "@/lib/slug";

export interface VoteYear {
  year: number;
  name_ms: string;
}

/** Every loaded fiscal year whose statement prints this vote, with the name printed that year, oldest first. */
export async function getVoteYears(code: string): Promise<VoteYear[]> {
  return code.startsWith("P.")
    ? sql<VoteYear[]>`
        select v.fiscal_year as year, v.name_ms from development_vote v
        join federal_spending f on f.fiscal_year = v.fiscal_year
        where v.code = ${code} order by v.fiscal_year`
    : sql<VoteYear[]>`
        select v.fiscal_year as year, v.name_ms from vote v
        join federal_spending f on f.fiscal_year = v.fiscal_year
        where v.code = ${code} order by v.fiscal_year`;
}

/**
 * The vote's own name when the budget book prints one on the vote's line ("P.70 Simpanan Luar Jangka"),
 * rather than the line kind ("B.63 Mengurus", "P.63 Pembangunan") under a ministry heading.
 */
export function printedVoteName(sourceText: string): string | null {
  const match = /^[BPT]\.\s?\d+\s+(.+?)\s+[-(\d]/.exec(sourceText);
  const name = match?.[1].trim();
  return name && !["Mengurus", "Pembangunan", "Jumlah"].includes(name) ? name : null;
}

/** Every budget book that prints this vote, with its name in that book, oldest first. */
export async function getBudgetVoteYears(code: string): Promise<VoteYear[]> {
  const rows = await sql<{ year: number; heading: string; source_text: string }[]>`
    select d.budget_year as year, f.heading, f.source_text
    from budget_vote_figure f join budget_document d on d.document_id = f.document_id
    where f.vote_code = ${code} and f.fiscal_year = d.budget_year
    order by d.budget_year
  `;
  return rows.map((r) => ({ year: r.year, name_ms: printedVoteName(r.source_text) ?? r.heading }));
}

/** Names a budget book prints on a vote's own line, by vote code (only votes with such a name). */
export async function getPrintedVoteNames(budgetYear: number): Promise<Map<string, string>> {
  const rows = await sql<{ vote_code: string; source_text: string }[]>`
    select f.vote_code, f.source_text
    from budget_vote_figure f join budget_document d on d.document_id = f.document_id
    where d.budget_year = ${budgetYear} and f.fiscal_year = d.budget_year
  `;
  const names = new Map<string, string>();
  for (const r of rows) {
    const name = printedVoteName(r.source_text);
    if (name) names.set(r.vote_code, name);
  }
  return names;
}

export interface MinistryLink {
  name_ms: string; // as printed in `year`, or the body's name when that year is not loaded
  slug: string; // the body's page
}

/**
 * The body a supply or development vote belonged to in `year`, or its latest holder when `year` is null
 * (budget pages). Charged (T) votes belong to no ministry.
 */
export async function getMinistryLink(code: string, year: number | null): Promise<MinistryLink | null> {
  if (!/^[BP]\.\d{2}$/.test(code)) return null;
  const held = year === null ? sql`true` : sql`${year} between h.from_year and coalesce(h.to_year, 32767)`;
  const [row] = await sql<{ body_name_ms: string; printed_name_ms: string | null }[]>`
    select b.name_ms as body_name_ms, s.name_ms as printed_name_ms
    from vote_holder h
    join body b on b.id = h.body_id
    left join ministry_spending s
      on s.body_id = h.body_id and s.number = substr(h.vote_code, 3) and s.fiscal_year = ${year}
    where h.vote_code = ${code} and ${held}
    order by h.from_year desc
    limit 1
  `;
  return row ? { name_ms: row.printed_name_ms ?? row.body_name_ms, slug: slugify(row.body_name_ms) } : null;
}

/** Names a vote was printed under in other years than `year`, each with its years: for a note under the tabs. */
export function otherNames(years: VoteYear[], current: string): { name_ms: string; years: number[] }[] {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();
  const out = new Map<string, { name_ms: string; years: number[] }>();
  for (const y of years) {
    if (norm(y.name_ms) === norm(current)) continue;
    const entry = out.get(norm(y.name_ms)) ?? { name_ms: y.name_ms, years: [] };
    entry.years.push(y.year);
    out.set(norm(y.name_ms), entry);
  }
  return [...out.values()];
}
