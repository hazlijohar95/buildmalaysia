import sql from "@/lib/db";

/** A programme that a page missing from the published statement cuts into (operating_gap view). */
export interface OperatingGap {
  fiscal_year: number;
  vote_code: string;
  programme_code: string;
  last_activity_before_gap: string | null;
  first_activity_after_gap: string | null;
  after_pdf_page: number;
  before_pdf_page: number;
  evidence: string;
}

export async function getOperatingGaps(year?: number): Promise<OperatingGap[]> {
  return sql<OperatingGap[]>`
    select fiscal_year, vote_code, programme_code, last_activity_before_gap, first_activity_after_gap,
           after_pdf_page, before_pdf_page, evidence
    from operating_gap
    ${year === undefined ? sql`` : sql`where fiscal_year = ${year}`}
    order by fiscal_year, vote_code, programme_code
  `;
}

/** "activities after 030100" / "activities before 010600": which part of the programme the page held. */
export function gapExtent(g: OperatingGap): string {
  if (g.last_activity_before_gap && g.first_activity_after_gap)
    return `activities between ${g.last_activity_before_gap} and ${g.first_activity_after_gap}`;
  if (g.last_activity_before_gap) return `activities after ${g.last_activity_before_gap}, and its total`;
  if (g.first_activity_after_gap) return `activities before ${g.first_activity_after_gap}`;
  return "part of its detail";
}

/** The OCR engine that read the year's Lampiran 1, or null when it was read from the PDF's text layer. */
export async function getOcrEngine(year: number): Promise<string | null> {
  const [row] = await sql<{ engine: string | null }[]>`
    select operating_ocr_engine as engine from source_document
    where fiscal_year = ${year} and not exists (select 1 from budget_document b where b.document_id = source_document.id)
  `;
  return row?.engine ?? null;
}

/** Caveats on a year's operating figures: pages missing from its statement, and whether it was read by OCR. */
export interface SourceNotes {
  year: number;
  gaps: OperatingGap[];
  ocrEngine: string | null;
}

/** The caveats for a year's operating figures, or for one vote's when `voteCode` is given. */
export async function getSourceNotes(year: number, voteCode?: string): Promise<SourceNotes> {
  const [gaps, ocrEngine] = await Promise.all([getOperatingGaps(year), getOcrEngine(year)]);
  return { year, gaps: voteCode ? gaps.filter((g) => g.vote_code === voteCode) : gaps, ocrEngine };
}
