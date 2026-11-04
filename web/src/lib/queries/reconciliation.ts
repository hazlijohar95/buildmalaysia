import sql from "@/lib/db";

export interface ReconciliationSummary {
  total: number;
  matched: number;
  mismatches: MismatchRow[];
}

export interface MismatchRow {
  printed_total_id: number;
  scope: string;
  vote_code: string | null;
  programme_code: string | null;
  activity_code: string | null;
  original_diff_sen: string;
  supplementary_diff_sen: string;
  virement_diff_sen: string;
  revised_diff_sen: string;
  actual_diff_sen: string;
  pdf_page: number;
}

interface CountRow {
  total: string;
  matched: string;
}

export async function getReconciliationSummary(
  year: number,
): Promise<ReconciliationSummary> {
  const [counts] = await sql<CountRow[]>`
    select
      count(*)                       as total,
      count(*) filter (where matches) as matched
    from reconciliation
    where fiscal_year = ${year}
  `;

  const mismatches = await sql<MismatchRow[]>`
    select
      printed_total_id,
      scope::text,
      vote_code,
      programme_code,
      activity_code,
      original_diff_sen::text,
      supplementary_diff_sen::text,
      virement_diff_sen::text,
      revised_diff_sen::text,
      actual_diff_sen::text,
      pdf_page
    from reconciliation
    where fiscal_year = ${year} and not matches
    order by printed_total_id
  `;

  return {
    total: parseInt(counts.total, 10),
    matched: parseInt(counts.matched, 10),
    mismatches,
  };
}

export interface ReconciliationCount {
  total: number;
  matched: number;
}

/** Lampiran 2: every printed group, vote and statement total, all nine columns. */
export async function getDevelopmentReconciliation(year: number): Promise<ReconciliationCount> {
  const [counts] = await sql<CountRow[]>`
    select count(*) as total, count(*) filter (where matches) as matched
    from development_reconciliation
    where fiscal_year = ${year}
  `;
  return { total: parseInt(counts.total, 10), matched: parseInt(counts.matched, 10) };
}
