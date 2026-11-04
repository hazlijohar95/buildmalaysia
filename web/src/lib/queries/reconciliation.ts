import { unstable_cache } from "next/cache";
import sql from "@/lib/db";

/**
 * The reconciliation views recompute every printed total from its rows, which takes seconds. Their result only
 * changes when the pipeline writes to the database, so it is cached against the database's write counters: any
 * load changes them and the next request recomputes.
 */
async function dataVersion(): Promise<string> {
  const [row] = await sql<{ version: string }[]>`
    select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0)::text as version from pg_stat_user_tables
  `;
  return row?.version ?? "0";
}

const cachedChecks = unstable_cache(
  async (version: string) => {
    const [sources, misprints, budgets] = await Promise.all([
      getSourceChecks(),
      getPrintedMismatches(),
      getBudgetChecks(),
    ]);
    return { version, sources, misprints, budgets };
  },
  ["methodology-checks-v3"], // bump when the cached shape changes
);

/** Every check the methodology page reports, recomputed only after the data changes. */
export async function getMethodologyChecks(): Promise<{
  sources: SourceCheck[];
  misprints: PrintedMismatch[];
  budgets: BudgetCheck[];
}> {
  return cachedChecks(await dataVersion());
}

export interface SourceCheck {
  fiscal_year: number;
  title: string;
  url: string;
  sha256: string;
  operating_total: number;
  operating_matched: number;
  operating_misprinted: number; // registered misprints: the load accepts exactly these differences
  operating_missing_page: number; // totals whose rows are on a page missing from the published PDF
  development_total: number;
  development_matched: number;
  covid_matches: boolean | null; // null when the year has no COVID-19 Fund statement
}

/** Every loaded source document with the result of both reconciliation views, newest first. */
export async function getSourceChecks(): Promise<SourceCheck[]> {
  const rows = await sql<
    {
      fiscal_year: number;
      title: string;
      url: string;
      sha256: string;
      operating_total: string;
      operating_matched: string;
      operating_misprinted: string;
      operating_missing_page: string;
      development_total: string;
      development_matched: string;
      covid_matches: boolean | null;
    }[]
  >`
    select d.fiscal_year, d.title, d.url, d.sha256,
           (select count(*) from reconciliation r where r.document_id = d.id) as operating_total,
           (select count(*) from reconciliation r where r.document_id = d.id and r.matches) as operating_matched,
           (select count(*) from reconciliation r where r.document_id = d.id and r.result = 'differs')
             as operating_misprinted,
           (select count(*) from reconciliation r where r.document_id = d.id and r.result = 'missing_page')
             as operating_missing_page,
           (select count(*) from development_reconciliation r where r.document_id = d.id) as development_total,
           (select count(*) from development_reconciliation r where r.document_id = d.id and r.matches)
             as development_matched,
           (select c.matches from covid_fund_reconciliation c where c.document_id = d.id) as covid_matches
    from source_document d
    where not exists (select 1 from budget_document b where b.document_id = d.id)
    order by d.fiscal_year desc
  `;
  return rows.map((r) => ({
    ...r,
    operating_total: Number(r.operating_total),
    operating_matched: Number(r.operating_matched),
    operating_misprinted: Number(r.operating_misprinted),
    operating_missing_page: Number(r.operating_missing_page),
    development_total: Number(r.development_total),
    development_matched: Number(r.development_matched),
  }));
}

export interface PrintedMismatch {
  fiscal_year: number;
  scope: string;
  vote_code: string | null;
  programme_code: string | null;
  activity_code: string | null;
  object_code: string | null;
  pdf_page: number;
  book_page: number;
  doc_url: string;
  /** Printed total minus the sum of its rows, per column; zero where that column agrees. */
  diffs: { column: "original" | "supplementary" | "virement" | "revised" | "actual"; sen: string }[];
}

/** Operating totals the statements print that disagree with their own rows (accepted only as known misprints). */
export async function getPrintedMismatches(): Promise<PrintedMismatch[]> {
  const rows = await sql<
    (Omit<PrintedMismatch, "diffs"> & {
      original_diff_sen: string | null;
      supplementary_diff_sen: string | null;
      virement_diff_sen: string | null;
      revised_diff_sen: string | null;
      actual_diff_sen: string | null;
    })[]
  >`
    select r.fiscal_year, r.scope::text, r.vote_code, r.programme_code, r.activity_code, r.object_code, r.pdf_page,
           t.book_page, sd.url as doc_url, r.original_diff_sen::text, r.supplementary_diff_sen::text,
           r.virement_diff_sen::text, r.revised_diff_sen::text, r.actual_diff_sen::text
    from reconciliation r
    join printed_total t on t.id = r.printed_total_id
    join source_document sd on sd.id = r.document_id
    where not r.matches
    order by r.fiscal_year, r.printed_total_id
  `;
  const columns = ["original", "supplementary", "virement", "revised", "actual"] as const;
  return rows.map((r) => ({
    fiscal_year: r.fiscal_year,
    scope: r.scope,
    vote_code: r.vote_code,
    programme_code: r.programme_code,
    activity_code: r.activity_code,
    object_code: r.object_code,
    pdf_page: r.pdf_page,
    book_page: r.book_page,
    doc_url: r.doc_url,
    diffs: columns
      .map((column) => ({ column, sen: r[`${column}_diff_sen`] }))
      .filter((d): d is { column: (typeof columns)[number]; sen: string } => d.sen !== null && d.sen !== "0"),
  }));
}

export interface BudgetCheck {
  budget_year: number;
  title: string;
  url: string;
  sha256: string;
  operating_total: number;
  operating_matched: number;
  operating_misprinted: number; // registered misprints: the load accepts exactly these differences
  operating_missing_page: number; // totals whose rows are on a page missing from the published PDF
  development_total: number;
  development_matched: number;
  votes_consistent: number;
  votes: number;
  actual_figures: number;
  actual_agree: number;
  actual_worst_sen: number;
  original_votes: number; // operating votes whose original estimate is compared with the statement
  original_matched: number;
  original_net_diff_sen: number; // differences across all votes; zero when money only moved between votes
}

/** Each loaded budget book with the live result of its reconciliation views. */
export async function getBudgetChecks(): Promise<BudgetCheck[]> {
  const rows = await sql<Record<keyof BudgetCheck, string | number>[]>`
    select b.budget_year, sd.title, sd.url, sd.sha256,
      (select count(*) from budget_operating_reconciliation r where r.document_id = b.document_id) as operating_total,
      (select count(*) from budget_operating_reconciliation r where r.document_id = b.document_id and r.matches)
        as operating_matched,
      (select count(*) from budget_development_reconciliation r where r.document_id = b.document_id) as development_total,
      (select count(*) from budget_development_reconciliation r where r.document_id = b.document_id and r.matches)
        as development_matched,
      (select count(*) filter (where c.matches) from budget_vote_consistency c where c.document_id = b.document_id)
        + (select count(*) filter (where c.matches) from budget_development_consistency c where c.document_id = b.document_id)
        as votes_consistent,
      (select count(*) from budget_vote_consistency c where c.document_id = b.document_id)
        + (select count(*) from budget_development_consistency c where c.document_id = b.document_id) as votes,
      (select count(*) from budget_actual_check c where c.document_id = b.document_id) as actual_figures,
      (select count(*) from budget_actual_check c where c.document_id = b.document_id
        and c.result in ('matches', 'rounding')) as actual_agree,
      (select coalesce(max(abs(c.diff_sen)), 0) from budget_actual_check c where c.document_id = b.document_id)
        as actual_worst_sen,
      (select count(*) from budget_original_check c where c.document_id = b.document_id) as original_votes,
      (select count(*) from budget_original_check c where c.document_id = b.document_id and c.matches)
        as original_matched,
      (select coalesce(sum(c.diff_sen), 0) from budget_original_check c where c.document_id = b.document_id)
        as original_net_diff_sen
    from budget_document b join source_document sd on sd.id = b.document_id
    order by b.budget_year desc
  `;
  return rows.map((r) => ({
    budget_year: Number(r.budget_year),
    title: String(r.title),
    url: String(r.url),
    sha256: String(r.sha256),
    operating_total: Number(r.operating_total),
    operating_matched: Number(r.operating_matched),
    operating_misprinted: Number(r.operating_misprinted),
    operating_missing_page: Number(r.operating_missing_page),
    development_total: Number(r.development_total),
    development_matched: Number(r.development_matched),
    votes_consistent: Number(r.votes_consistent),
    votes: Number(r.votes),
    actual_figures: Number(r.actual_figures),
    actual_agree: Number(r.actual_agree),
    actual_worst_sen: Number(r.actual_worst_sen),
    original_votes: Number(r.original_votes),
    original_matched: Number(r.original_matched),
    original_net_diff_sen: Number(r.original_net_diff_sen),
  }));
}
