import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";
import { slugify } from "@/lib/slug";

/**
 * A ministry is a vote number: its supply vote B.nn and development vote P.nn in a year.
 * Vote numbers can be reused when ministries are reorganised, so each year's row carries the
 * name printed that year.
 */
export interface MinistryYear {
  fiscal_year: number;
  number: string;
  name_ms: string;
  operating_vote_code: string | null;
  development_vote_code: string | null;
  operating_actual_sen: Sen;
  development_actual_sen: Sen;
  actual_sen: Sen;
  share: number; // of that year's federal spending
  rank: number; // among ministries that year, by total spending
}

interface RawMinistryYear {
  fiscal_year: number;
  number: string;
  name_ms: string;
  operating_vote_code: string | null;
  development_vote_code: string | null;
  operating_actual_sen: string | null;
  development_actual_sen: string | null;
  actual_sen: string;
  total_sen: string;
  rank: string;
}

async function allMinistryYears(): Promise<MinistryYear[]> {
  const rows = await sql<RawMinistryYear[]>`
    select m.fiscal_year, m.number, m.name_ms, m.operating_vote_code, m.development_vote_code,
           m.operating_actual_sen, m.development_actual_sen, m.actual_sen, f.total_actual_sen as total_sen,
           rank() over (partition by m.fiscal_year order by m.actual_sen desc) as rank
    from ministry_spending m
    join federal_spending f on f.fiscal_year = m.fiscal_year
    order by m.fiscal_year desc, m.actual_sen desc
  `;
  return rows.map((r) => ({
    fiscal_year: r.fiscal_year,
    number: r.number,
    name_ms: r.name_ms,
    operating_vote_code: r.operating_vote_code,
    development_vote_code: r.development_vote_code,
    operating_actual_sen: parseSen(r.operating_actual_sen ?? 0),
    development_actual_sen: parseSen(r.development_actual_sen ?? 0),
    actual_sen: parseSen(r.actual_sen),
    share: Number(r.actual_sen) / Number(r.total_sen),
    rank: Number(r.rank),
  }));
}

/** Ministries in the latest loaded year, largest first. */
export async function getLatestMinistries(): Promise<MinistryYear[]> {
  const all = await allMinistryYears();
  const latest = all[0]?.fiscal_year;
  return all.filter((m) => m.fiscal_year === latest);
}

/** Ministries that spent something in `year`, largest first. */
export async function getMinistriesForYear(year: number): Promise<MinistryYear[]> {
  return (await allMinistryYears()).filter((m) => m.fiscal_year === year && m.actual_sen > 0);
}

/** A development vote's ten largest projects by spending, for votes whose projects carry no group heading. */
export async function getTopProjects(
  year: number,
  voteCode: string,
): Promise<{ code: string; name_ms: string; estimate_sen: Sen; actual_sen: Sen }[]> {
  const rows = await sql<{ code: string; name_ms: string; estimate_sen: string; actual_sen: string }[]>`
    select code, name_ms, estimate_sen, actual_sen from development_project
    where fiscal_year = ${year} and vote_code = ${voteCode}
    order by actual_sen desc, code limit 10
  `;
  return rows.map((r) => ({ ...r, estimate_sen: parseSen(r.estimate_sen), actual_sen: parseSen(r.actual_sen) }));
}

/**
 * A ministry is identified by its vote number; its slug is that number's most recent printed name.
 * Returns the slug for every number seen in any loaded year.
 */
export async function getMinistrySlugs(): Promise<Map<string, string>> {
  const all = await allMinistryYears(); // newest year first
  const slugs = new Map<string, string>();
  for (const m of all) if (!slugs.has(m.number)) slugs.set(m.number, slugify(m.name_ms));
  return slugs;
}

/**
 * A ministry by slug, with every loaded year of its vote number. Any name the number has been printed
 * under resolves; `canonical` is the slug of the latest name, for redirecting old links.
 */
export async function getMinistry(
  slug: string,
): Promise<{ latest: MinistryYear; years: MinistryYear[]; canonical: string } | null> {
  const all = await allMinistryYears(); // newest year first
  const match = all.find((m) => slugify(m.name_ms) === slug);
  if (!match) return null;
  const years = all.filter((m) => m.number === match.number);
  return { latest: years[0], years, canonical: slugify(years[0].name_ms) };
}

export interface ProgrammeSpend {
  code: string;
  name_ms: string;
  revised_sen: Sen;
  actual_sen: Sen;
}

/** An operating vote's programmes in a year, as printed (largest first). */
export async function getProgrammeSpending(year: number, voteCode: string): Promise<ProgrammeSpend[]> {
  const rows = await sql<{ code: string; name_ms: string | null; revised_sen: string; actual_sen: string }[]>`
    select p.code, p.name_ms, t.revised_sen, t.actual_sen
    from printed_total t
    join programme p on p.fiscal_year = t.fiscal_year and p.vote_code = t.vote_code and p.code = t.programme_code
    where t.fiscal_year = ${year} and t.vote_code = ${voteCode} and t.scope = 'programme' and t.object_code is null
    order by t.actual_sen desc
  `;
  return rows.map((r) => ({
    code: r.code,
    name_ms: r.name_ms ?? `Programme ${r.code}`,
    revised_sen: parseSen(r.revised_sen),
    actual_sen: parseSen(r.actual_sen),
  }));
}

/** A development vote's spending by group heading (projects without one grouped as "Other projects"). */
export async function getDevelopmentGroups(year: number, voteCode: string): Promise<{ name: string; actual_sen: Sen; estimate_sen: Sen }[]> {
  const rows = await sql<{ name: string | null; actual_sen: string; estimate_sen: string }[]>`
    select coalesce(par.name_ms, g.name_ms) as name, sum(p.actual_sen) as actual_sen, sum(p.estimate_sen) as estimate_sen
    from development_project p
    left join development_group g on g.fiscal_year = p.fiscal_year and g.vote_code = p.vote_code and g.ordinal = p.group_ordinal
    left join development_group par on par.fiscal_year = g.fiscal_year and par.vote_code = g.vote_code and par.ordinal = g.parent_ordinal
    where p.fiscal_year = ${year} and p.vote_code = ${voteCode}
    group by 1
    order by 2 desc
  `;
  return rows.map((r) => ({
    name: r.name ?? "Other projects",
    actual_sen: parseSen(r.actual_sen),
    estimate_sen: parseSen(r.estimate_sen),
  }));
}

/** The latest budget book's figures for a set of votes: [vote, fiscal year, basis, total]. */
export async function getBudgetForVotes(
  codes: string[],
): Promise<{ budget_year: number; rows: { vote_code: string; fiscal_year: number; basis: string; total_sen: Sen }[] } | null> {
  const [book] = await sql<{ budget_year: number; document_id: string }[]>`
    select budget_year, document_id from budget_document order by budget_year desc limit 1
  `;
  if (!book || codes.length === 0) return null;
  const rows = await sql<{ vote_code: string; fiscal_year: number; basis: string; total_sen: string }[]>`
    select vote_code, fiscal_year, basis::text as basis, total_sen from budget_vote_figure
    where document_id = ${book.document_id} and vote_code in ${sql(codes)}
    order by fiscal_year
  `;
  return { budget_year: book.budget_year, rows: rows.map((r) => ({ ...r, total_sen: parseSen(r.total_sen) })) };
}
