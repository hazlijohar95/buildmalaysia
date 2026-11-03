import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";

export interface VoteHeader {
  code: string;
  name_ms: string;
  section: "charged" | "supply";
  original_sen: Sen;
  supplementary_sen: Sen;
  virement_sen: Sen;
  revised_sen: Sen;
  actual_sen: Sen;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

export interface ProgrammeTotal {
  programme_code: string;
  programme_name_ms: string;
  original_sen: Sen;
  supplementary_sen: Sen;
  virement_sen: Sen;
  revised_sen: Sen;
  actual_sen: Sen;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

export interface ActivityTotal {
  programme_code: string;
  activity_code: string;
  activity_name_ms: string;
  original_sen: Sen;
  supplementary_sen: Sen;
  virement_sen: Sen;
  revised_sen: Sen;
  actual_sen: Sen;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

export interface LeafLine {
  programme_code: string;
  activity_code: string;
  object_code: string;
  object_name_ms: string;
  object_name_en: string;
  original_sen: Sen;
  supplementary_sen: Sen;
  virement_sen: Sen;
  revised_sen: Sen;
  actual_sen: Sen;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

interface RawVoteHeader {
  code: string;
  name_ms: string;
  section: "charged" | "supply";
  original_sen: string;
  supplementary_sen: string;
  virement_sen: string;
  revised_sen: string;
  actual_sen: string;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

interface RawProgrammeTotal {
  programme_code: string;
  programme_name_ms: string;
  original_sen: string;
  supplementary_sen: string;
  virement_sen: string;
  revised_sen: string;
  actual_sen: string;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

interface RawActivityTotal {
  programme_code: string;
  activity_code: string;
  activity_name_ms: string;
  original_sen: string;
  supplementary_sen: string;
  virement_sen: string;
  revised_sen: string;
  actual_sen: string;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

interface RawLeafLine {
  programme_code: string;
  activity_code: string;
  object_code: string;
  object_name_ms: string;
  object_name_en: string;
  original_sen: string;
  supplementary_sen: string;
  virement_sen: string;
  revised_sen: string;
  actual_sen: string;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

function parseSens(r: {
  original_sen: string;
  supplementary_sen: string;
  virement_sen: string;
  revised_sen: string;
  actual_sen: string;
}) {
  return {
    original_sen: parseSen(r.original_sen),
    supplementary_sen: parseSen(r.supplementary_sen),
    virement_sen: parseSen(r.virement_sen),
    revised_sen: parseSen(r.revised_sen),
    actual_sen: parseSen(r.actual_sen),
  };
}

export async function getVoteHeader(
  year: number,
  voteCode: string,
): Promise<VoteHeader | null> {
  const rows = await sql<RawVoteHeader[]>`
    select
      v.code, v.name_ms, v.section,
      pt.original_sen, pt.supplementary_sen, pt.virement_sen, pt.revised_sen, pt.actual_sen,
      pt.pdf_page, pt.book_page, sd.url as doc_url
    from vote v
    join printed_total pt
      on pt.vote_code  = v.code
     and pt.fiscal_year = v.fiscal_year
     and pt.scope       = 'vote'
    join source_document sd on sd.id = pt.document_id
    where v.fiscal_year = ${year} and v.code = ${voteCode}
  `;
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, ...parseSens(r) };
}

export async function getProgrammeTotals(
  year: number,
  voteCode: string,
): Promise<ProgrammeTotal[]> {
  const rows = await sql<RawProgrammeTotal[]>`
    select
      p.code  as programme_code,
      p.name_ms as programme_name_ms,
      pt.original_sen, pt.supplementary_sen, pt.virement_sen, pt.revised_sen, pt.actual_sen,
      pt.pdf_page, pt.book_page, sd.url as doc_url
    from programme p
    join printed_total pt
      on pt.programme_code = p.code
     and pt.vote_code      = p.vote_code
     and pt.fiscal_year    = p.fiscal_year
     and pt.scope          = 'programme'
    join source_document sd on sd.id = pt.document_id
    where p.fiscal_year = ${year} and p.vote_code = ${voteCode}
    order by p.code
  `;
  return rows.map((r) => ({ ...r, ...parseSens(r) }));
}

export async function getActivityTotals(
  year: number,
  voteCode: string,
): Promise<ActivityTotal[]> {
  const rows = await sql<RawActivityTotal[]>`
    select
      a.programme_code,
      a.code          as activity_code,
      a.name_ms       as activity_name_ms,
      pt.original_sen, pt.supplementary_sen, pt.virement_sen, pt.revised_sen, pt.actual_sen,
      pt.pdf_page, pt.book_page, sd.url as doc_url
    from activity a
    join printed_total pt
      on pt.activity_code  = a.code
     and pt.programme_code = a.programme_code
     and pt.vote_code      = a.vote_code
     and pt.fiscal_year    = a.fiscal_year
     and pt.scope          = 'activity'
    join source_document sd on sd.id = pt.document_id
    where a.fiscal_year = ${year} and a.vote_code = ${voteCode}
    order by a.code
  `;
  return rows.map((r) => ({ ...r, ...parseSens(r) }));
}

export async function getLeafLines(
  year: number,
  voteCode: string,
): Promise<LeafLine[]> {
  const rows = await sql<RawLeafLine[]>`
    select
      d.programme_code,
      d.activity_code,
      d.object_code,
      og.name_ms  as object_name_ms,
      og.name_en  as object_name_en,
      d.original_sen, d.supplementary_sen, d.virement_sen, d.revised_sen, d.actual_sen,
      d.pdf_page, d.book_page, sd.url as doc_url
    from operating_line_detail d
    join object_group og on og.code = d.object_code
    join source_document sd on sd.id = d.document_id
    where d.fiscal_year = ${year} and d.vote_code = ${voteCode}
    order by d.activity_code, d.object_code
  `;
  return rows.map((r) => ({ ...r, ...parseSens(r) }));
}
