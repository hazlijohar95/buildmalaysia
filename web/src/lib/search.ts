import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";
import { slugify } from "@/lib/slug";
import { voteCodeToSlug } from "@/lib/citations";
import { getLoadedYears } from "@/lib/years";

export const SEARCH_MAX_LEN = 100;
const PER_KIND_LIMIT = 10;

// English words that commonly appear in queries about Malaysian government entities,
// mapped to the Bahasa Malaysia term printed in the data.
export const SYNONYMS: Record<string, string> = {
  education: "pendidikan",
  health: "kesihatan",
  defence: "pertahanan",
  defense: "pertahanan",
  police: "polis",
  transport: "pengangkutan",
  housing: "perumahan",
  agriculture: "pertanian",
  finance: "kewangan",
  debt: "hutang",
  pension: "pencen",
  school: "sekolah",
  hospital: "hospital",
  road: "jalan",
  water: "air",
  energy: "tenaga",
  science: "sains",
  technology: "teknologi",
  communication: "komunikasi",
  information: "maklumat",
  environment: "alam",
  tourism: "pelancongan",
  trade: "perdagangan",
  industry: "industri",
  welfare: "kebajikan",
  women: "wanita",
  youth: "belia",
  sport: "sukan",
  security: "keselamatan",
  economy: "ekonomi",
};

/** Escapes PostgreSQL LIKE/ILIKE wildcard characters in a user-supplied string. */
export function escapeWildcard(q: string): string {
  return q.replace(/[\\%_]/g, "\\$&");
}

/**
 * Returns the original query plus a Malay-substituted variant for each English synonym
 * found in the query. Used to let English-speaking users find Malay-language records.
 */
export function expandSynonyms(q: string): string[] {
  const terms: string[] = [q];
  const lower = q.toLowerCase();
  for (const [en, ms] of Object.entries(SYNONYMS)) {
    if (lower.includes(en)) {
      terms.push(q.replace(new RegExp(en, "gi"), ms));
    }
  }
  return [...new Set(terms)];
}

export type SearchHit =
  | { kind: "ministry"; name_ms: string; code: string; fiscal_year: number; href: string; actual_sen: Sen }
  | { kind: "vote"; name_ms: string; code: string; fiscal_year: number; href: string; actual_sen: Sen | null }
  | {
      kind: "programme";
      name_ms: string;
      code: string;
      fiscal_year: number;
      href: string;
      vote_name_ms: string;
      actual_sen: Sen | null;
    }
  | {
      kind: "activity";
      name_ms: string;
      code: string;
      fiscal_year: number;
      href: string;
      vote_name_ms: string;
      actual_sen: Sen | null;
    }
  | {
      kind: "project";
      name_ms: string;
      code: string;
      fiscal_year: number;
      href: string;
      vote_name_ms: string;
      actual_sen: Sen | null;
    };

const KIND_ORDER: Record<SearchHit["kind"], number> = {
  ministry: 0,
  vote: 1,
  programme: 2,
  activity: 3,
  project: 4,
};

function isCodeMatch(code: string, q: string): boolean {
  const qNorm = q.toLowerCase().replace(".", "");
  const cNorm = code.toLowerCase().replace(".", "");
  return cNorm === qNorm;
}

/** Ranks hits: exact code match first, then kind order (ministry→project), then spending desc. */
export function rankHits(hits: SearchHit[], q: string): SearchHit[] {
  return [...hits].sort((a, b) => {
    const aCode = isCodeMatch(a.code, q) ? 0 : 1;
    const bCode = isCodeMatch(b.code, q) ? 0 : 1;
    if (aCode !== bCode) return aCode - bCode;
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return (Number(b.actual_sen) || 0) - (Number(a.actual_sen) || 0);
  });
}

/** Runs all five entity searches in parallel and returns ranked hits. Returns [] for empty q. */
export async function searchHits(raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, SEARCH_MAX_LEN);
  if (!q) return [];

  const terms = expandSynonyms(q);
  const patterns = terms.map((t) => `%${escapeWildcard(t)}%`);
  const [latest] = await getLoadedYears();
  if (!latest) return [];

  const [ministries, opVotes, devVotes, programmes, activities, projects] = await Promise.all([
    queryMinistries(patterns),
    queryOperatingVotes(patterns, latest),
    queryDevelopmentVotes(patterns, latest),
    queryProgrammes(patterns, latest),
    queryActivities(patterns, latest),
    queryProjects(patterns, latest),
  ]);

  const hits: SearchHit[] = [...ministries, ...opVotes, ...devVotes, ...programmes, ...activities, ...projects];
  return rankHits(hits, q);
}

// --- individual queries ---

interface RawMinistry {
  code: string;
  name_ms: string;
  fiscal_year: number;
  actual_sen: string;
}

async function queryMinistries(patterns: string[]): Promise<SearchHit[]> {
  const rows = await sql<RawMinistry[]>`
    with matching as (
      select distinct number from ministry_spending
      where name_ms ilike any(${patterns})
    )
    select distinct on (m.number) m.number as code, m.name_ms, m.fiscal_year, m.actual_sen
    from ministry_spending m
    join matching mn on mn.number = m.number
    order by m.number, m.fiscal_year desc
    limit ${PER_KIND_LIMIT}
  `;
  return rows.map((r) => ({
    kind: "ministry",
    code: r.code,
    name_ms: r.name_ms,
    fiscal_year: r.fiscal_year,
    href: `/ministries/${slugify(r.name_ms)}`,
    actual_sen: parseSen(r.actual_sen),
  }));
}

interface RawVote {
  code: string;
  name_ms: string;
  fiscal_year: number;
  actual_sen: string | null;
}

async function queryOperatingVotes(patterns: string[], year: number): Promise<SearchHit[]> {
  const rows = await sql<RawVote[]>`
    select v.code, v.name_ms, v.fiscal_year, pt.actual_sen
    from vote v
    join printed_total pt
      on pt.fiscal_year = v.fiscal_year
     and pt.vote_code = v.code
     and pt.scope = 'vote'
     and pt.object_code is null
    where v.fiscal_year = ${year}
      and (v.code ilike any(${patterns}) or v.name_ms ilike any(${patterns}))
    limit ${PER_KIND_LIMIT}
  `;
  return rows.map((r) => ({
    kind: "vote",
    code: r.code,
    name_ms: r.name_ms,
    fiscal_year: r.fiscal_year,
    href: `/${year}/vote/${voteCodeToSlug(r.code)}`,
    actual_sen: r.actual_sen !== null ? parseSen(r.actual_sen) : null,
  }));
}

async function queryDevelopmentVotes(patterns: string[], year: number): Promise<SearchHit[]> {
  const rows = await sql<RawVote[]>`
    select v.code, v.name_ms, v.fiscal_year, dpt.actual_sen
    from development_vote v
    join development_printed_total dpt
      on dpt.fiscal_year = v.fiscal_year
     and dpt.vote_code = v.code
     and dpt.scope = 'vote'
    where v.fiscal_year = ${year}
      and (v.code ilike any(${patterns}) or v.name_ms ilike any(${patterns}))
    limit ${PER_KIND_LIMIT}
  `;
  return rows.map((r) => ({
    kind: "vote",
    code: r.code,
    name_ms: r.name_ms,
    fiscal_year: r.fiscal_year,
    href: `/${year}/vote/${voteCodeToSlug(r.code)}`,
    actual_sen: r.actual_sen !== null ? parseSen(r.actual_sen) : null,
  }));
}

interface RawProgramme {
  code: string;
  name_ms: string;
  vote_code: string;
  vote_name_ms: string;
  fiscal_year: number;
  actual_sen: string | null;
}

async function queryProgrammes(patterns: string[], year: number): Promise<SearchHit[]> {
  const rows = await sql<RawProgramme[]>`
    select p.code, p.name_ms, p.vote_code, v.name_ms as vote_name_ms, p.fiscal_year, pt.actual_sen
    from programme p
    join vote v on v.fiscal_year = p.fiscal_year and v.code = p.vote_code
    left join printed_total pt
      on pt.fiscal_year = p.fiscal_year
     and pt.vote_code = p.vote_code
     and pt.programme_code = p.code
     and pt.scope = 'programme'
     and pt.object_code is null
    where p.fiscal_year = ${year}
      and (p.code ilike any(${patterns}) or p.name_ms ilike any(${patterns}))
    limit ${PER_KIND_LIMIT}
  `;
  return rows.map((r) => ({
    kind: "programme",
    code: r.code,
    name_ms: r.name_ms,
    fiscal_year: r.fiscal_year,
    href: `/${year}/vote/${voteCodeToSlug(r.vote_code)}#p${r.code}`,
    vote_name_ms: r.vote_name_ms,
    actual_sen: r.actual_sen !== null ? parseSen(r.actual_sen) : null,
  }));
}

interface RawActivity {
  code: string;
  name_ms: string;
  vote_code: string;
  vote_name_ms: string;
  fiscal_year: number;
  actual_sen: string | null;
}

async function queryActivities(patterns: string[], year: number): Promise<SearchHit[]> {
  const rows = await sql<RawActivity[]>`
    select a.code, a.name_ms, a.vote_code, v.name_ms as vote_name_ms, a.fiscal_year, pt.actual_sen
    from activity a
    join vote v on v.fiscal_year = a.fiscal_year and v.code = a.vote_code
    left join printed_total pt
      on pt.fiscal_year = a.fiscal_year
     and pt.vote_code = a.vote_code
     and pt.activity_code = a.code
     and pt.scope = 'activity'
     and pt.object_code is null
    where a.fiscal_year = ${year}
      and (a.code ilike any(${patterns}) or a.name_ms ilike any(${patterns}))
    limit ${PER_KIND_LIMIT}
  `;
  return rows.map((r) => ({
    kind: "activity",
    code: r.code,
    name_ms: r.name_ms,
    fiscal_year: r.fiscal_year,
    href: `/${year}/vote/${voteCodeToSlug(r.vote_code)}#a${r.code}`,
    vote_name_ms: r.vote_name_ms,
    actual_sen: r.actual_sen !== null ? parseSen(r.actual_sen) : null,
  }));
}

interface RawProject {
  code: string;
  name_ms: string;
  vote_code: string;
  vote_name_ms: string;
  fiscal_year: number;
  actual_sen: string;
}

async function queryProjects(patterns: string[], year: number): Promise<SearchHit[]> {
  const rows = await sql<RawProject[]>`
    select p.code, p.name_ms, p.vote_code, v.name_ms as vote_name_ms, p.fiscal_year, p.actual_sen
    from development_project p
    join development_vote v on v.fiscal_year = p.fiscal_year and v.code = p.vote_code
    where p.fiscal_year = ${year}
      and (p.code ilike any(${patterns}) or p.name_ms ilike any(${patterns}))
    limit ${PER_KIND_LIMIT}
  `;
  return rows.map((r) => ({
    kind: "project",
    code: r.code,
    name_ms: r.name_ms,
    fiscal_year: r.fiscal_year,
    href: `/${year}/vote/${voteCodeToSlug(r.vote_code)}#d${r.code}`,
    vote_name_ms: r.vote_name_ms,
    actual_sen: parseSen(r.actual_sen),
  }));
}
