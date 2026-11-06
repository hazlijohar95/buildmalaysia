import sql from "@/lib/db";

/** Every check the methodology page reports: each statement's and budget book's totals, and the known misprints. */
export async function getMethodologyChecks(): Promise<{
  sources: SourceCheck[];
  misprints: PrintedMismatch[];
  budgets: BudgetCheck[];
}> {
  const [sources, misprints, budgets] = await Promise.all([
    getSourceChecks(),
    getPrintedMismatches(),
    getBudgetChecks(),
  ]);
  return { sources, misprints, budgets };
}

export interface SourceCheck {
  fiscal_year: number;
  title: string;
  url: string;
  sha256: string;
  operating_ocr_engine: string | null; // set when Lampiran 1 has no text layer and was read by OCR
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
      operating_ocr_engine: string | null;
      operating_total: string;
      operating_matched: string;
      operating_misprinted: string;
      operating_missing_page: string;
      development_total: string;
      development_matched: string;
      covid_matches: boolean | null;
    }[]
  >`
    with operating as (
      select document_id,
             count(*) as total,
             count(*) filter (where matches) as matched,
             count(*) filter (where result = 'differs') as misprinted,
             count(*) filter (where result = 'missing_page') as missing_page
      from reconciliation
      group by document_id
    ), development as (
      select document_id, count(*) as total, count(*) filter (where matches) as matched
      from development_reconciliation
      group by document_id
    )
    select d.fiscal_year, d.title, d.url, d.sha256, d.operating_ocr_engine,
           coalesce(o.total, 0) as operating_total,
           coalesce(o.matched, 0) as operating_matched,
           coalesce(o.misprinted, 0) as operating_misprinted,
           coalesce(o.missing_page, 0) as operating_missing_page,
           coalesce(dv.total, 0) as development_total,
           coalesce(dv.matched, 0) as development_matched,
           (select c.matches from covid_fund_reconciliation c where c.document_id = d.id) as covid_matches
    from source_document d
    left join operating o on o.document_id = d.id
    left join development dv on dv.document_id = d.id
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
  // Each view is aggregated once for every book, rather than rescanned per book and per count.
  const rows = await sql<Record<keyof BudgetCheck, string | number>[]>`
    with operating as (
      select document_id, count(*) as total, count(*) filter (where matches) as matched
      from budget_operating_reconciliation group by document_id
    ), development as (
      select document_id, count(*) as total, count(*) filter (where matches) as matched
      from budget_development_reconciliation group by document_id
    ), consistency as (
      select document_id, count(*) as total, count(*) filter (where matches) as matched
      from (select document_id, matches from budget_vote_consistency
            union all
            select document_id, matches from budget_development_consistency) c
      group by document_id
    ), actual as (
      select document_id, count(*) as total,
             count(*) filter (where result in ('matches', 'rounding')) as agree,
             coalesce(max(abs(diff_sen)), 0) as worst_sen
      from budget_actual_check group by document_id
    ), original as (
      select document_id, count(*) as total, count(*) filter (where matches) as matched,
             coalesce(sum(diff_sen), 0) as net_diff_sen
      from budget_original_check group by document_id
    )
    select b.budget_year, sd.title, sd.url, sd.sha256,
           coalesce(o.total, 0) as operating_total, coalesce(o.matched, 0) as operating_matched,
           coalesce(d.total, 0) as development_total, coalesce(d.matched, 0) as development_matched,
           coalesce(c.matched, 0) as votes_consistent, coalesce(c.total, 0) as votes,
           coalesce(a.total, 0) as actual_figures, coalesce(a.agree, 0) as actual_agree,
           coalesce(a.worst_sen, 0) as actual_worst_sen,
           coalesce(g.total, 0) as original_votes, coalesce(g.matched, 0) as original_matched,
           coalesce(g.net_diff_sen, 0) as original_net_diff_sen
    from budget_document b
    join source_document sd on sd.id = b.document_id
    left join operating o on o.document_id = b.document_id
    left join development d on d.document_id = b.document_id
    left join consistency c on c.document_id = b.document_id
    left join actual a on a.document_id = b.document_id
    left join original g on g.document_id = b.document_id
    order by b.budget_year desc
  `;
  return rows.map((r) => ({
    budget_year: Number(r.budget_year),
    title: String(r.title),
    url: String(r.url),
    sha256: String(r.sha256),
    operating_total: Number(r.operating_total),
    operating_matched: Number(r.operating_matched),
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
