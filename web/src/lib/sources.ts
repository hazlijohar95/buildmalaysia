/** A source document the site reads its figures from, as loaded by the pipeline. */
export type SourceDocument = {
  id: string;
  publisher: string;
  title: string;
  /** The official PDF. */
  url: string;
  sha256: string;
  pageCount: number;
  /** When the pipeline fetched the PDF, in UTC (ISO 8601). Not the publication date, which is not recorded. */
  retrievedAt: string;
} & ({ kind: "statement"; fiscalYear: number } | { kind: "budget"; budgetYear: number });

/** The site page that shows a document's figures. */
export function sourcePagePath(doc: SourceDocument): string {
  return doc.kind === "statement" ? `/${doc.fiscalYear}` : `/budget/${doc.budgetYear}`;
}

/** "Financial statements 2025" or "Budget 2027". */
export function sourceKindLabel(doc: SourceDocument): string {
  return doc.kind === "statement" ? `Financial statements ${doc.fiscalYear}` : `Budget ${doc.budgetYear}`;
}

const FETCH_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kuala_Lumpur",
});

/** The fetch date as a reader in Malaysia would write it: "4 November 2026". */
export function formatFetchDate(doc: SourceDocument): string {
  return FETCH_DATE.format(new Date(doc.retrievedAt));
}

/** Newest fetch first; ties by id, so the order never depends on the database's. */
export function newestFirst(docs: readonly SourceDocument[]): SourceDocument[] {
  return [...docs].sort((a, b) => b.retrievedAt.localeCompare(a.retrievedAt) || a.id.localeCompare(b.id));
}
