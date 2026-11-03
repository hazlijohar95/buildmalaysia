import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";

export interface VoteSummaryRow {
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

interface RawRow {
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

export type SortKey = "code" | "revised_sen" | "actual_sen";

export async function getVoteSummaries(
  year: number,
  sort: SortKey = "code",
): Promise<VoteSummaryRow[]> {
  const validSort: Record<SortKey, string> = {
    code: "v.code",
    revised_sen: "pt.revised_sen desc",
    actual_sen: "pt.actual_sen desc",
  };
  const orderExpr = validSort[sort] ?? "v.code";

  const rows = await sql<RawRow[]>`
    select
      v.code,
      v.name_ms,
      v.section,
      pt.original_sen,
      pt.supplementary_sen,
      pt.virement_sen,
      pt.revised_sen,
      pt.actual_sen,
      pt.pdf_page,
      pt.book_page,
      sd.url as doc_url
    from vote v
    join printed_total pt
      on pt.vote_code  = v.code
     and pt.fiscal_year = v.fiscal_year
     and pt.scope       = 'vote'
     and pt.object_code is null
    join source_document sd on sd.id = pt.document_id
    where v.fiscal_year = ${year}
    order by ${sql.unsafe(orderExpr)}
  `;

  return rows.map((r) => ({
    ...r,
    original_sen: parseSen(r.original_sen),
    supplementary_sen: parseSen(r.supplementary_sen),
    virement_sen: parseSen(r.virement_sen),
    revised_sen: parseSen(r.revised_sen),
    actual_sen: parseSen(r.actual_sen),
  }));
}

export interface FiscalTotals {
  total_original_sen: Sen;
  total_supplementary_sen: Sen;
  total_virement_sen: Sen;
  total_revised_sen: Sen;
  total_actual_sen: Sen;
  charged_revised_sen: Sen;
  charged_actual_sen: Sen;
  supply_revised_sen: Sen;
  supply_actual_sen: Sen;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

interface RawTotals {
  total_original_sen: string;
  total_supplementary_sen: string;
  total_virement_sen: string;
  total_revised_sen: string;
  total_actual_sen: string;
  charged_revised_sen: string;
  charged_actual_sen: string;
  supply_revised_sen: string;
  supply_actual_sen: string;
  pdf_page: number;
  book_page: number;
  doc_url: string;
}

/**
 * Headline figures are the totals the statement itself prints (JUMLAH KESELURUHAN
 * MENGURUS and the two section totals), so each one cites the page it appears on.
 */
export async function getFiscalTotals(year: number): Promise<FiscalTotals | null> {
  const [row] = await sql<RawTotals[]>`
    select
      st.original_sen      as total_original_sen,
      st.supplementary_sen as total_supplementary_sen,
      st.virement_sen      as total_virement_sen,
      st.revised_sen       as total_revised_sen,
      st.actual_sen        as total_actual_sen,
      ch.revised_sen       as charged_revised_sen,
      ch.actual_sen        as charged_actual_sen,
      su.revised_sen       as supply_revised_sen,
      su.actual_sen        as supply_actual_sen,
      st.pdf_page,
      st.book_page,
      sd.url               as doc_url
    from printed_total st
    join source_document sd on sd.id = st.document_id
    join printed_total ch
      on ch.document_id = st.document_id and ch.scope = 'section'
     and ch.section = 'charged' and ch.object_code is null
    join printed_total su
      on su.document_id = st.document_id and su.scope = 'section'
     and su.section = 'supply' and su.object_code is null
    where st.fiscal_year = ${year} and st.scope = 'statement' and st.object_code is null
  `;
  if (!row) return null;

  return {
    ...row,
    total_original_sen: parseSen(row.total_original_sen),
    total_supplementary_sen: parseSen(row.total_supplementary_sen),
    total_virement_sen: parseSen(row.total_virement_sen),
    total_revised_sen: parseSen(row.total_revised_sen),
    total_actual_sen: parseSen(row.total_actual_sen),
    charged_revised_sen: parseSen(row.charged_revised_sen),
    charged_actual_sen: parseSen(row.charged_actual_sen),
    supply_revised_sen: parseSen(row.supply_revised_sen),
    supply_actual_sen: parseSen(row.supply_actual_sen),
  };
}
