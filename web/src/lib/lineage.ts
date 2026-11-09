/** What the lineage records about one body, reduced to the years things happened to it. */
export interface BodyLineage {
  id: string;
  established: number | null;
  dissolved: number | null;
  /** Years of the reorganisations it gave functions to or took them from, unverified ones left out. */
  edgeYears: number[];
}

/**
 * Whether the body was set up, dissolved or reorganised in any year from `from` to `to`, inclusive. Figures for a
 * body that changed shape in that span do not compare like with like, so year-on-year comparisons leave it out.
 */
export function reorganisedBetween(body: BodyLineage, from: number, to: number): boolean {
  const within = (year: number | null) => year !== null && year >= from && year <= to;
  return within(body.established) || within(body.dissolved) || body.edgeYears.some(within);
}
