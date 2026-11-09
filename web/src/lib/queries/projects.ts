import sql from "@/lib/db";
import { voteCodeToSlug } from "@/lib/citations";
import { parseSen, type Sen } from "@/lib/money";

/** A page of the statement, as its PDF page and the page number printed on it. */
export interface PageRef {
  pdf_page: number;
  book_page: number;
}

/**
 * One printed Lampiran 2 row of a project's history. Code, name, total cost and plan spending to the prior year are
 * on the spread's left page; the year's estimate, actual and plan spending to date on its right page.
 */
export interface ProjectYear {
  key: string;
  fiscal_year: number;
  vote_code: string;
  code: string;
  name_ms: string;
  total_cost_sen: Sen;
  plan_actual_prior_sen: Sen;
  estimate_sen: Sen;
  actual_sen: Sen;
  plan_actual_to_date_sen: Sen;
  /** The Malaysia Plans the two spending columns count against, e.g. "RMKe-11" and "RMKe-12" in FY2021. */
  prior_plan: string;
  plan: string;
  doc_url: string;
  left: PageRef;
  right: PageRef;
  /** Keys of the previous year's rows linked into this one: none in a history's first year, two where rows merged. */
  previous: string[];
  /** Whether plan spending to the prior year equals what the previous rows printed to date; null without previous. */
  cumulative_matches: boolean | null;
}

/** Every row linked to one project across the statements, by year. Keyed by its latest row. */
export interface ProjectHistory {
  chain_id: string;
  years: ProjectYear[];
}

/** The project page for the row printed at (year, vote, code). */
export function projectHref(row: { fiscal_year: number; vote_code: string; code: string }): string {
  return `/${row.fiscal_year}/project/${voteCodeToSlug(row.vote_code)}/${row.code}`;
}

/** The latest row of a history, the one every other row links forward to. */
export function latestRow(history: ProjectHistory): ProjectYear {
  const latest = history.years.find((y) => y.key === history.chain_id);
  if (!latest) throw new Error(`History ${history.chain_id} has no row with its own key`);
  return latest;
}

/** A project's printed total cost in one year: the sum of its rows, which is one row except where rows merged. */
export interface CostYear {
  fiscal_year: number;
  total_cost_sen: Sen;
  rows: ProjectYear[];
}

export type ProjectEvent =
  /** The printed total cost differs from the last year that printed one. */
  | { kind: "cost"; fiscal_year: number; from: CostYear; to: CostYear; change_sen: Sen; percent: number }
  /** This year's plan spending to the prior year differs from what the previous statement printed to date. */
  | { kind: "restated"; fiscal_year: number; previous: ProjectYear[]; current: ProjectYear; difference_sen: Sen }
  /** The previous statement printed the project as several rows, and this year's spending to the prior year is their sum. */
  | { kind: "merged"; fiscal_year: number; previous: ProjectYear[]; current: ProjectYear }
  /** The project is printed under a different vote from the previous year. */
  | { kind: "moved"; fiscal_year: number; previous: ProjectYear; current: ProjectYear };

function sumSen(values: Sen[]): Sen {
  return values.reduce((a, b) => a + b, 0) as Sen;
}

export function costYears(history: ProjectHistory): CostYear[] {
  const byYear = new Map<number, ProjectYear[]>();
  for (const y of history.years) byYear.set(y.fiscal_year, [...(byYear.get(y.fiscal_year) ?? []), y]);
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([fiscal_year, rows]) => ({ fiscal_year, rows, total_cost_sen: sumSen(rows.map((r) => r.total_cost_sen)) }));
}

/** What changed between the statements, in year order. A year printing no total cost ("-") is skipped, not a change. */
export function projectEvents(history: ProjectHistory): ProjectEvent[] {
  const byKey = new Map(history.years.map((y) => [y.key, y]));
  const events: ProjectEvent[] = [];

  const costed = costYears(history).filter((c) => c.total_cost_sen > 0);
  for (let i = 1; i < costed.length; i++) {
    const [from, to] = [costed[i - 1], costed[i]];
    if (from.total_cost_sen === to.total_cost_sen) continue;
    const change_sen = (to.total_cost_sen - from.total_cost_sen) as Sen;
    events.push({
      kind: "cost",
      fiscal_year: to.fiscal_year,
      from,
      to,
      change_sen,
      percent: (change_sen / from.total_cost_sen) * 100,
    });
  }

  for (const current of history.years) {
    const previous = current.previous.flatMap((k) => byKey.get(k) ?? []);
    if (previous.length === 0) continue;
    const { fiscal_year } = current;
    if (current.cumulative_matches === false) {
      const printed = sumSen(previous.map((p) => p.plan_actual_to_date_sen));
      events.push({
        kind: "restated",
        fiscal_year,
        previous,
        current,
        difference_sen: (current.plan_actual_prior_sen - printed) as Sen,
      });
    } else if (previous.length > 1) {
      events.push({ kind: "merged", fiscal_year, previous, current });
    } else if (previous[0].vote_code !== current.vote_code) {
      events.push({ kind: "moved", fiscal_year, previous: previous[0], current });
    }
  }

  const order: Record<ProjectEvent["kind"], number> = { moved: 0, merged: 1, restated: 2, cost: 3 };
  return events.sort((a, b) => a.fiscal_year - b.fiscal_year || order[a.kind] - order[b.kind]);
}

interface RawProjectYear {
  chain_id: string;
  key: string;
  fiscal_year: number;
  vote_code: string;
  code: string;
  name_ms: string;
  total_cost_sen: string;
  plan_actual_prior_sen: string;
  estimate_sen: string;
  actual_sen: string;
  plan_actual_to_date_sen: string;
  prior_plan: string;
  plan: string;
  doc_url: string;
  pdf_page: number;
  book_page: number;
  amounts_pdf_page: number;
  amounts_book_page: number;
  previous: string[];
  cumulative_matches: boolean | null;
}

function projectYear(r: RawProjectYear): ProjectYear {
  return {
    key: r.key,
    fiscal_year: r.fiscal_year,
    vote_code: r.vote_code,
    code: r.code,
    name_ms: r.name_ms,
    total_cost_sen: parseSen(r.total_cost_sen),
    plan_actual_prior_sen: parseSen(r.plan_actual_prior_sen),
    estimate_sen: parseSen(r.estimate_sen),
    actual_sen: parseSen(r.actual_sen),
    plan_actual_to_date_sen: parseSen(r.plan_actual_to_date_sen),
    prior_plan: r.prior_plan,
    plan: r.plan,
    doc_url: r.doc_url,
    left: { pdf_page: r.pdf_page, book_page: r.book_page },
    right: { pdf_page: r.amounts_pdf_page, book_page: r.amounts_book_page },
    previous: r.previous,
    cumulative_matches: r.cumulative_matches,
  };
}

/**
 * The history of each row printed at (year, vote, code): usually one, two where a statement prints a code twice in a
 * vote (FY2016, FY2018). Empty when nothing was printed there. In the order the statement prints those rows.
 */
export async function getProjectHistories(year: number, vote: string, code: string): Promise<ProjectHistory[]> {
  const rows = await sql<(RawProjectYear & { at: boolean })[]>`
    with chain as materialized (select * from development_project_chain)
    select c.chain_id, c.key, to_json(c.previous) as previous, c.cumulative_matches, p.fiscal_year, p.vote_code, p.code::text as code,
           p.name_ms, p.total_cost_sen, p.plan_actual_prior_sen, p.estimate_sen, p.actual_sen,
           p.plan_actual_to_date_sen, p.pdf_page, p.book_page, p.amounts_pdf_page, p.amounts_book_page,
           ds.prior_plan, ds.plan, sd.url as doc_url,
           (p.fiscal_year, p.vote_code, p.code) = (${year}, ${vote}, ${code}) as at
    from chain c
    join development_project p using (fiscal_year, vote_code, code, pdf_page, line_no)
    join development_statement ds on ds.document_id = p.document_id
    join source_document sd on sd.id = p.document_id
    where c.chain_id in (select chain_id from chain where (fiscal_year, vote_code, code) = (${year}, ${vote}, ${code}))
    order by p.fiscal_year, p.vote_code, p.pdf_page, p.line_no
  `;
  const histories = new Map<string, ProjectHistory>();
  for (const r of rows) {
    const history = histories.get(r.chain_id) ?? { chain_id: r.chain_id, years: [] };
    history.years.push(projectYear(r));
    histories.set(r.chain_id, history);
  }
  // Rows arrive in print order, so the first row at the requested key orders the histories.
  const printOrder = rows.filter((r) => r.at).map((r) => r.chain_id);
  return printOrder.flatMap((id) => histories.get(id) ?? []);
}

/** One project's history in brief, for ranking and counting. */
export interface ProjectSummary {
  chain_id: string;
  latest: { fiscal_year: number; vote_code: string; code: string; name_ms: string };
  first_year: number;
  /** Statements the project appears in. */
  years: number;
  restatements: number;
  /** The first and the latest year that printed a total cost above zero; null when none did. */
  cost: { first_year: number; first_sen: Sen; last_year: number; last_sen: Sen } | null;
}

interface RawSummary {
  chain_id: string;
  fiscal_year: number;
  vote_code: string;
  code: string;
  name_ms: string;
  first_year: number;
  years: number;
  restatements: number;
  first_cost_year: number | null;
  first_cost_sen: string | null;
  last_cost_year: number | null;
  last_cost_sen: string | null;
}

export async function getProjectSummaries(): Promise<ProjectSummary[]> {
  const rows = await sql<RawSummary[]>`
    with chain as materialized (select * from development_project_chain),
    yearly as (
      select c.chain_id, c.fiscal_year, sum(p.total_cost_sen) as cost_sen
      from chain c
      join development_project p using (fiscal_year, vote_code, code, pdf_page, line_no)
      group by c.chain_id, c.fiscal_year
    ),
    history as (
      select chain_id, min(fiscal_year)::integer as first_year, count(distinct fiscal_year)::integer as years,
             (count(*) filter (where not cumulative_matches))::integer as restatements
      from chain
      group by chain_id
    ),
    costed as (
      select chain_id, min(fiscal_year) filter (where cost_sen > 0) as first_cost_year,
             max(fiscal_year) filter (where cost_sen > 0) as last_cost_year
      from yearly
      group by chain_id
    )
    select l.chain_id, l.fiscal_year, l.vote_code, l.code::text as code, p.name_ms, h.first_year, h.years,
           h.restatements, k.first_cost_year, f.cost_sen::text as first_cost_sen, k.last_cost_year,
           z.cost_sen::text as last_cost_sen
    from chain l
    join development_project p using (fiscal_year, vote_code, code, pdf_page, line_no)
    join history h on h.chain_id = l.chain_id
    join costed k on k.chain_id = l.chain_id
    left join yearly f on f.chain_id = l.chain_id and f.fiscal_year = k.first_cost_year
    left join yearly z on z.chain_id = l.chain_id and z.fiscal_year = k.last_cost_year
    where l.key = l.chain_id
  `;
  return rows.map((r) => ({
    chain_id: r.chain_id,
    latest: { fiscal_year: r.fiscal_year, vote_code: r.vote_code, code: r.code, name_ms: r.name_ms },
    first_year: r.first_year,
    years: r.years,
    restatements: r.restatements,
    cost:
      r.first_cost_year !== null && r.first_cost_sen !== null && r.last_cost_year !== null && r.last_cost_sen !== null
        ? {
            first_year: r.first_cost_year,
            first_sen: parseSen(r.first_cost_sen),
            last_year: r.last_cost_year,
            last_sen: parseSen(r.last_cost_sen),
          }
        : null,
  }));
}

/** A rise in printed total cost between a history's first and latest year that printed one. */
export interface CostRise {
  project: ProjectSummary;
  first_year: number;
  first_sen: Sen;
  last_year: number;
  last_sen: Sen;
  rise_sen: Sen;
  percent: number;
}

export function costRises(projects: ProjectSummary[]): CostRise[] {
  return projects.flatMap((project) => {
    const { cost } = project;
    if (!cost || cost.last_year === cost.first_year || cost.last_sen <= cost.first_sen) return [];
    const rise_sen = (cost.last_sen - cost.first_sen) as Sen;
    return [{ project, ...cost, rise_sen, percent: (rise_sen / cost.first_sen) * 100 }];
  });
}

/** The largest rises in ringgit. */
export function largestRises(rises: CostRise[], limit: number): CostRise[] {
  return [...rises].sort((a, b) => b.rise_sen - a.rise_sen).slice(0, limit);
}

/** The largest rises in percent, among projects whose first printed cost was at least `minimum`. */
export function steepestRises(rises: CostRise[], limit: number, minimum: Sen): CostRise[] {
  return rises
    .filter((r) => r.first_sen >= minimum)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);
}

export interface ProjectCounts {
  /** Histories: each project counted once however many statements print it. */
  projects: number;
  /** Histories spanning at least three statements. */
  spanningThree: number;
  /** Histories in every loaded statement. */
  spanningAll: number;
  statements: number;
  /** Rows whose plan spending to the prior year differs from what the previous statement printed to date. */
  restatements: number;
}

export function projectCounts(projects: ProjectSummary[], statements: number): ProjectCounts {
  return {
    projects: projects.length,
    spanningThree: projects.filter((p) => p.years >= 3).length,
    spanningAll: projects.filter((p) => p.years === statements).length,
    statements,
    restatements: projects.reduce((n, p) => n + p.restatements, 0),
  };
}
