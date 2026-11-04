// Wayfinding for vote pages: which loaded years print a vote, under what name, and which ministry it belongs to.
import sql from "@/lib/db";
import { getMinistrySlugs } from "@/lib/queries/ministry";

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
  name_ms: string; // as printed in `year`, or the latest name when that year has none
  slug: string; // of the latest name: the ministry page's canonical address
}

/**
 * The ministry a supply or development vote belongs to: its vote number. Charged (T) votes belong to no
 * ministry. The link goes to the number's latest name; the label is the name printed in `year` when loaded.
 */
export async function getMinistryLink(code: string, year: number | null): Promise<MinistryLink | null> {
  if (!/^[BP]\.\d{2}$/.test(code)) return null;
  const number = code.slice(2);
  const [rows, slugs] = await Promise.all([
    sql<{ fiscal_year: number; name_ms: string }[]>`
      select fiscal_year, name_ms from ministry_spending where number = ${number} order by fiscal_year desc
    `,
    getMinistrySlugs(),
  ]);
  const slug = slugs.get(number);
  const named = rows.find((r) => r.fiscal_year === year) ?? rows[0];
  return slug && named ? { name_ms: named.name_ms, slug } : null;
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
