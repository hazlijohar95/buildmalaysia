import sql from "@/lib/db";
import type { BodyLineage } from "@/lib/lineage";

/** Looks up a body's years of setting up, dissolution and reorganisation. Unverified edges are never used. */
export async function getBodyLineage(): Promise<(bodyId: string) => BodyLineage> {
  const rows = await sql<{ id: string; established: number | null; dissolved: number | null; edge_years: number[] }[]>`
    select b.id,
           extract(year from b.established)::int as established,
           extract(year from b.dissolved)::int as dissolved,
           coalesce((select json_agg(distinct extract(year from e.effective)::int)
                     from lineage_edge e
                     where b.id in (e.predecessor, e.successor) and e.confidence <> 'unverified'), '[]') as edge_years
    from body b
  `;
  const bodies = new Map(
    rows.map((r) => [r.id, { id: r.id, established: r.established, dissolved: r.dissolved, edgeYears: r.edge_years }]),
  );
  return (bodyId) => {
    const body = bodies.get(bodyId);
    if (!body) throw new Error(`No body ${bodyId} in the lineage`);
    return body;
  };
}
