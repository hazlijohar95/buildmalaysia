// State governments' finances, from each state's audited Penyata Kewangan Kerajaan Negeri: revenue by type and
// operating expenditure by vote, every row with the PDF page it was read from. The pipeline loads a statement only
// when state_reconciliation recomputes every printed total from its rows (ingest-state).
import sql from "@/lib/db";
import { formatSenCompact, parseSen, parseSenOrNull, type Sen } from "@/lib/money";

/** The revenue note's categories, in printed order, with English names. */
export const STATE_REVENUE_CATEGORIES = [
  { category: "hasil_cukai", ms: "Hasil Cukai", en: "Tax revenue" },
  { category: "hasil_bukan_cukai", ms: "Hasil Bukan Cukai", en: "Non-tax revenue" },
  { category: "terimaan_bukan_hasil", ms: "Terimaan Bukan Hasil", en: "Non-revenue receipts" },
] as const;

/** The operating note's two kinds of vote. */
export const STATE_OPERATING_CATEGORIES = [
  { category: "tanggungan", ms: "Perbelanjaan Tanggungan", en: "Charged expenditure" },
  { category: "bekalan", ms: "Perbelanjaan Bekalan", en: "Supply votes" },
] as const;

export type StateSection = "revenue" | "operating";

export interface StateStatement {
  id: string;
  slug: string;
  name: string;
  nameMs: string;
  year: number;
  publisher: string;
  title: string;
  url: string;
}

export interface PrintedFigure {
  section: StateSection;
  label: string;
  scope: string;
  category: string | null;
  original: Sen | null;
  revised: Sen | null;
  actual: Sen | null;
  prior: Sen | null;
  pdfPage: number;
}

export interface StateSummary extends StateStatement {
  revenue: PrintedFigure;
  operating: PrintedFigure;
  /** The transfer to the state's Development Fund, where the operating note prints it. */
  transfer: PrintedFigure | null;
  /** Whether the votes' total includes that transfer ("less") or leaves it out ("plus"). */
  transferIn: "votes" | "outside" | null;
}

export interface StateGap {
  slug: string;
  name: string;
  year: number | null;
  reason: string;
  sourceUrl: string | null;
}

interface FigureRow {
  statement_id: string;
  section: StateSection;
  scope: string;
  category: string | null;
  label: string;
  original_sen: string | null;
  revised_sen: string | null;
  actual_sen: string | null;
  prior_actual_sen: string | null;
  pdf_page: number;
}

const figure = (r: FigureRow): PrintedFigure => ({
  section: r.section,
  label: r.label,
  scope: r.scope,
  category: r.category,
  original: parseSenOrNull(r.original_sen),
  revised: parseSenOrNull(r.revised_sen),
  actual: parseSenOrNull(r.actual_sen),
  prior: parseSenOrNull(r.prior_actual_sen),
  pdfPage: r.pdf_page,
});

interface StatementRow {
  id: string;
  slug: string;
  name_en: string;
  name_ms: string;
  fiscal_year: number;
  publisher: string;
  title: string;
  url: string;
}

const statement = (r: StatementRow): StateStatement => ({
  id: r.id,
  slug: r.slug,
  name: r.name_en,
  nameMs: r.name_ms,
  year: r.fiscal_year,
  publisher: r.publisher,
  title: r.title,
  url: r.url,
});

/**
 * Reads a statement's headline figures from its printed totals: JUMLAH HASIL, the operating total over every vote
 * and, where printed, the transfer to the Development Fund. Exported for tests.
 */
export function summarise(s: StateStatement, figures: PrintedFigure[]): StateSummary | null {
  const revenue = figures.find((f) => f.scope === "statement" && f.section === "revenue");
  const operating = figures.find((f) => f.scope === "statement" && f.section === "operating");
  if (!revenue || !operating) return null;
  const transfer = figures.find((f) => f.scope === "transfer" && f.section === "operating") ?? null;
  const less = figures.some((f) => f.scope === "statement_less_transfer");
  const plus = figures.some((f) => f.scope === "statement_plus_transfer");
  return { ...s, revenue, operating, transfer, transferIn: less ? "votes" : plus ? "outside" : null };
}

/** Every loaded statement, the newest year of each state, largest revenue first. */
export async function getStateSummaries(): Promise<StateSummary[]> {
  const statements = await sql<StatementRow[]>`
    select distinct on (s.slug) st.id, s.slug, s.name_en, s.name_ms, st.fiscal_year, st.publisher, st.title, st.url
    from state_statement st join state s on s.slug = st.state_slug
    order by s.slug, st.fiscal_year desc
  `;
  if (statements.length === 0) return [];
  const rows = await sql<FigureRow[]>`
    select statement_id, section::text as section, scope, category, label, original_sen::text, revised_sen::text,
           actual_sen::text, prior_actual_sen::text, pdf_page
    from state_printed_total
    where statement_id in ${sql(statements.map((s) => s.id))} and scope <> 'category'
    order by statement_id, section, position
  `;
  return statements
    .map((s) => summarise(statement(s), rows.filter((r) => r.statement_id === s.id).map(figure)))
    .filter((s): s is StateSummary => s !== null)
    .sort((a, b) => (b.revenue.actual ?? 0) - (a.revenue.actual ?? 0));
}

/** The states and years not shown, and why. */
export async function getStateGaps(): Promise<StateGap[]> {
  const rows = await sql<
    { slug: string; name_en: string; fiscal_year: number | null; reason: string; source_url: string | null }[]
  >`
    select g.state_slug as slug, s.name_en, g.fiscal_year, g.reason, g.source_url
    from state_gap g join state s on s.slug = g.state_slug
    order by s.name_en, g.position
  `;
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name_en,
    year: r.fiscal_year,
    reason: r.reason,
    sourceUrl: r.source_url,
  }));
}

export interface StateLine {
  position: number;
  category: string;
  code: string | null;
  name: string;
  original: Sen | null;
  revised: Sen | null;
  actual: Sen;
  prior: Sen | null;
  pdfPage: number;
  sourceText: string;
}

export interface StateDetail {
  summary: StateSummary;
  years: number[];
  lines: Record<StateSection, StateLine[]>;
  totals: Record<StateSection, PrintedFigure[]>;
  /** Printed totals that differ from their rows, as registered misprints. */
  misprints: { section: StateSection; label: string; pdfPage: number; column: string; printed: Sen; rows: Sen }[];
}

/** One state's statement for a year (the newest if none is given), or null if not loaded. */
export async function getStateDetail(slug: string, year?: number): Promise<StateDetail | null> {
  const all = await sql<StatementRow[]>`
    select st.id, s.slug, s.name_en, s.name_ms, st.fiscal_year, st.publisher, st.title, st.url
    from state_statement st join state s on s.slug = st.state_slug
    where s.slug = ${slug}
    order by st.fiscal_year desc
  `;
  const chosen = year === undefined ? all[0] : all.find((s) => s.fiscal_year === year);
  if (!chosen) return null;
  const [lineRows, totalRows, misprintRows] = await Promise.all([
    sql<
      {
        section: StateSection;
        position: number;
        category: string;
        code: string | null;
        name_ms: string;
        original_sen: string | null;
        revised_sen: string | null;
        actual_sen: string;
        prior_actual_sen: string | null;
        pdf_page: number;
        source_text: string;
      }[]
    >`
      select section::text as section, position, category, code, name_ms, original_sen::text, revised_sen::text,
             actual_sen::text, prior_actual_sen::text, pdf_page, source_text
      from state_line where statement_id = ${chosen.id}
      order by section, position
    `,
    sql<FigureRow[]>`
      select statement_id, section::text as section, scope, category, label, original_sen::text, revised_sen::text,
             actual_sen::text, prior_actual_sen::text, pdf_page
      from state_printed_total where statement_id = ${chosen.id}
      order by section, position
    `,
    sql<{ section: StateSection; label: string; pdf_page: number; column: string; printed: string; rows: string }[]>`
      select r.section::text as section, r.label, r.pdf_page, c.column_name as column, c.printed::text, c.rows::text
      from state_reconciliation r
      cross join lateral (values
        ('original estimate', r.original_sen, r.computed_original_sen),
        ('revised estimate', r.revised_sen, r.computed_revised_sen),
        ('actual', r.actual_sen, r.computed_actual_sen),
        ('previous year', r.prior_actual_sen, r.computed_prior_actual_sen)
      ) as c(column_name, printed, rows)
      where r.statement_id = ${chosen.id} and not r.matches and c.printed <> c.rows
    `,
  ]);
  const summary = summarise(statement(chosen), totalRows.map(figure));
  if (!summary) return null;
  const lines: Record<StateSection, StateLine[]> = { revenue: [], operating: [] };
  for (const r of lineRows) {
    lines[r.section].push({
      position: r.position,
      category: r.category,
      code: r.code,
      name: r.name_ms,
      original: parseSenOrNull(r.original_sen),
      revised: parseSenOrNull(r.revised_sen),
      actual: parseSen(r.actual_sen),
      prior: parseSenOrNull(r.prior_actual_sen),
      pdfPage: r.pdf_page,
      sourceText: r.source_text,
    });
  }
  const totals: Record<StateSection, PrintedFigure[]> = { revenue: [], operating: [] };
  for (const r of totalRows) totals[r.section].push(figure(r));
  return {
    summary,
    years: all.map((s) => s.fiscal_year),
    lines,
    totals,
    misprints: misprintRows.map((m) => ({
      section: m.section,
      label: m.label,
      pdfPage: m.pdf_page,
      column: m.column,
      printed: parseSen(m.printed),
      rows: parseSen(m.rows),
    })),
  };
}

/** A category's printed total, or null if the note prints none. */
export function categoryTotal(totals: PrintedFigure[], category: string): PrintedFigure | null {
  return totals.find((t) => t.scope === "category" && t.category === category) ?? null;
}

/** A state's page on this site, with the year when it is not the newest. */
export function stateHref(slug: string, year?: number): string {
  return year === undefined ? `/states/${slug}` : `/states/${slug}?year=${year}`;
}

/** Each state's statement cites the state's own name and year, and the PDF page (these books number pages unevenly). */
export function stateCitationLabel(name: string, year: number, pdfPage: number): string {
  return `${name} ${year}, PDF p.\u00a0${pdfPage}`;
}

/** What a state's operating total includes, in a phrase for its row; null where the note prints no transfer. */
export function transferNote(s: StateSummary): string | null {
  if (!s.transfer?.actual || s.transferIn === null) return null;
  const amount = formatSenCompact(s.transfer.actual);
  return s.transferIn === "votes"
    ? `Includes ${amount} moved to the state's Development Fund`
    : `Excludes ${amount} moved to the state's Development Fund`;
}

/** Actual as a share of the revised estimate. */
export function percentOf(actual: Sen | null, estimate: Sen | null): string {
  if (actual === null || estimate === null || estimate === 0) return "–";
  return `${((actual / estimate) * 100).toFixed(1)}%`;
}
