import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";
import { slugify } from "@/lib/slug";

export type Confidence = "high" | "medium" | "unverified";
export type AliasOrigin = "printed" | "gazetted" | "acronym";

export interface Citation {
  url: string;
  title: string;
  locator: string | null;
  quote: string | null;
}

/** A ministry, department or commission: the institution behind a vote number across its names and years. */
export interface Body {
  id: string;
  name_ms: string;
  slug: string;
  established: string | null;
  dissolved: string | null;
}

export interface BodyAlias {
  name_ms: string;
  valid_from: string | null;
  valid_to: string | null;
  origin: AliasOrigin;
  confidence: Confidence;
  citation: Citation;
}

export interface LineageLink {
  direction: "predecessor" | "successor";
  body: Pick<Body, "id" | "name_ms" | "slug">;
  effective: string;
  whole: boolean;
  functions: string;
  confidence: Confidence;
  citation: Citation;
}

/** One body's hold on a vote number (B.nn and P.nn together), by fiscal year. */
export interface VoteTenure {
  number: string;
  body: Pick<Body, "id" | "name_ms" | "slug">;
  from_year: number;
  to_year: number | null;
}

/**
 * One body's supply vote B.nn and development vote P.nn in a year, with the name printed that year.
 * A `residual` year is one where the number was still printed, with nothing spent, after the body
 * was dissolved.
 */
export interface MinistryYear {
  fiscal_year: number;
  number: string;
  name_ms: string;
  body_id: string;
  body_name_ms: string;
  residual: boolean;
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
  body_id: string;
  body_name_ms: string;
  residual: boolean;
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
    select m.fiscal_year, m.number, m.name_ms, m.body_id, m.body_name_ms, m.residual,
           m.operating_vote_code, m.development_vote_code,
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
    body_id: r.body_id,
    body_name_ms: r.body_name_ms,
    residual: r.residual,
    operating_vote_code: r.operating_vote_code,
    development_vote_code: r.development_vote_code,
    operating_actual_sen: parseSen(r.operating_actual_sen ?? 0),
    development_actual_sen: parseSen(r.development_actual_sen ?? 0),
    actual_sen: parseSen(r.actual_sen),
    share: Number(r.actual_sen) / Number(r.total_sen),
    rank: Number(r.rank),
  }));
}

/** Bodies that spent something in `year`, largest first. */
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

interface RawCitation {
  url: string;
  title: string;
  locator: string | null;
  quote: string | null;
}

interface RawBody {
  id: string;
  name_ms: string;
  established: string | null;
  dissolved: string | null;
}

const toBody = (r: RawBody): Body => ({ ...r, slug: slugify(r.name_ms) });

export interface Ministry {
  body: Body;
  /** The body's address: the slug of its display name. */
  canonical: string;
  latest: MinistryYear;
  /** Years the body spent under its vote number, newest first. */
  years: MinistryYear[];
  /** Years the number was still printed, with nothing spent, after the body was dissolved. */
  residual: MinistryYear[];
  aliases: BodyAlias[];
  lineage: LineageLink[];
  /** Every body that has held the same vote numbers, this one included. */
  tenures: VoteTenure[];
}

/**
 * A ministry by slug. Every name the body has carried resolves, so old addresses still work;
 * `canonical` is the slug of its display name, for redirecting them.
 */
export async function getMinistry(slug: string): Promise<Ministry | null> {
  const aliases = await sql<{ body_id: string; name_ms: string }[]>`select body_id, name_ms from body_alias`;
  const bodyId = aliases.find((a) => slugify(a.name_ms) === slug)?.body_id;
  if (bodyId === undefined) return null;

  const [[raw], all, aliasRows, edgeRows, tenureRows] = await Promise.all([
    sql<RawBody[]>`
      select id, name_ms, established::text as established, dissolved::text as dissolved from body where id = ${bodyId}
    `,
    allMinistryYears(),
    sql<(Omit<BodyAlias, "citation"> & RawCitation)[]>`
      select a.name_ms, a.valid_from::text as valid_from, a.valid_to::text as valid_to,
             a.origin::text as origin, a.confidence::text as confidence,
             c.url, c.title, c.locator, c.quote
      from body_alias a join citation c on c.id = a.citation_id
      where a.body_id = ${bodyId}
      order by a.valid_from nulls first, a.origin, a.name_ms
    `,
    sql<
      ({
        predecessor: string;
        other_id: string;
        other_name_ms: string;
        effective: string;
        whole: boolean;
        functions: string;
        confidence: Confidence;
      } & RawCitation)[]
    >`
      select e.predecessor, b.id as other_id, b.name_ms as other_name_ms, e.effective::text as effective,
             e.whole, e.functions, e.confidence::text as confidence, c.url, c.title, c.locator, c.quote
      from lineage_edge e
      join body b on b.id = case when e.predecessor = ${bodyId} then e.successor else e.predecessor end
      join citation c on c.id = e.citation_id
      where ${bodyId} in (e.predecessor, e.successor)
      order by e.effective, e.id
    `,
    // Supply and development votes only: charged votes (T.nn) are numbered on their own and belong to no ministry.
    sql<{ number: string; body_id: string; body_name_ms: string; from_year: number; to_year: number | null }[]>`
      select distinct substr(h.vote_code, 3) as number, b.id as body_id, b.name_ms as body_name_ms,
             h.from_year, h.to_year
      from vote_holder h
      join body b on b.id = h.body_id
      where left(h.vote_code, 1) in ('B', 'P')
        and substr(h.vote_code, 3) in (
          select substr(vote_code, 3) from vote_holder where body_id = ${bodyId} and left(vote_code, 1) in ('B', 'P'))
      order by number, h.from_year
    `,
  ]);
  if (!raw) return null;
  const body = toBody(raw);
  const ofBody = all.filter((m) => m.body_id === body.id);
  const years = ofBody.filter((m) => !m.residual);
  if (years.length === 0) return null;
  return {
    body,
    canonical: body.slug,
    latest: years[0],
    years,
    residual: ofBody.filter((m) => m.residual),
    aliases: aliasRows.map(({ url, title, locator, quote, ...a }) => ({
      ...a,
      citation: { url, title, locator, quote },
    })),
    lineage: edgeRows.map(({ predecessor, other_id, other_name_ms, url, title, locator, quote, ...e }) => ({
      ...e,
      direction: predecessor === body.id ? "successor" : "predecessor",
      body: { id: other_id, name_ms: other_name_ms, slug: slugify(other_name_ms) },
      citation: { url, title, locator, quote },
    })),
    tenures: tenureRows.map((t) => ({
      number: t.number,
      body: { id: t.body_id, name_ms: t.body_name_ms, slug: slugify(t.body_name_ms) },
      from_year: t.from_year,
      to_year: t.to_year,
    })),
  };
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
export async function getDevelopmentGroups(
  year: number,
  voteCode: string,
): Promise<{ name: string; actual_sen: Sen; estimate_sen: Sen }[]> {
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
export async function getBudgetForVotes(codes: string[]): Promise<{
  budget_year: number;
  rows: { vote_code: string; fiscal_year: number; basis: string; total_sen: Sen }[];
} | null> {
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
