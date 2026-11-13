// Economic indicators from data.gov.my (CC BY 4.0), loaded as published by `pipeline load-indicators`. A figure is
// read by its dataset, its numeric column (`measure`) and the string columns that name its row (`dims`), so each
// series below is exactly one column of one dataset. Values stay strings until a chart needs a number, so they keep
// the decimals data.gov.my printed.
import sql from "@/lib/db";

export const DATAGOVMY_LICENCE = { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" };

export interface IndicatorField {
  name: string;
  title: string;
  description: string;
}

export interface IndicatorDataset {
  id: string;
  title: string;
  description: string;
  publisher: string[];
  frequency: string;
  dataAsOf: string;
  lastUpdated: string;
  pageUrl: string;
  apiUrl: string;
  csvUrl: string | null;
  fields: IndicatorField[];
  retrievedAt: string; // ISO timestamp of the API reply
}

/** One series: a dataset's column, for the rows matching `dims`. */
export interface SeriesKey {
  dataset: string;
  measure: string;
  dims: Record<string, string>;
}

/** The series the site shows. Each is one published column; nothing here is a figure. */
export const SERIES = {
  gdpNominal: { dataset: "gdp_gni_annual_nominal", measure: "gdp", dims: { series: "abs" } },
  gdpRealGrowth: { dataset: "gdp_gni_annual_real", measure: "gdp", dims: { series: "growth_yoy" } },
  inflation: { dataset: "cpi_annual_inflation", measure: "inflation", dims: { division: "overall" } },
  unemployment: { dataset: "lfs_year", measure: "u_rate", dims: {} },
  debt: {
    dataset: "federal_finance_year_debt_mat",
    measure: "value",
    dims: { type: "total", sector: "total", maturity: "total" },
  },
  balance: { dataset: "federal_finance_year", measure: "value", dims: { category: "budget", variable: "balance" } },
} as const satisfies Record<string, SeriesKey>;
export type SeriesId = keyof typeof SERIES;

export interface Point {
  year: number;
  value: string | null; // as published
}

interface RawDataset {
  id: string;
  title: string;
  description: string;
  publisher: string[];
  frequency: string;
  data_as_of: string;
  last_updated: string;
  page_url: string;
  api_url: string;
  csv_url: string | null;
  fields: IndicatorField[] | string;
  retrieved_at: string;
}

/** Every loaded dataset with what its catalogue page says about it, by id. */
export async function getIndicatorDatasets(): Promise<Map<string, IndicatorDataset>> {
  const rows = await sql<RawDataset[]>`
    select id, title, description, publisher, frequency, data_as_of, last_updated, page_url, api_url, csv_url,
           fields::text as fields, retrieved_at::text as retrieved_at
    from indicator_dataset order by id
  `;
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        title: r.title,
        description: r.description,
        publisher: typeof r.publisher === "string" ? parseTextArray(r.publisher) : r.publisher,
        frequency: r.frequency,
        dataAsOf: r.data_as_of,
        lastUpdated: r.last_updated,
        pageUrl: r.page_url,
        apiUrl: r.api_url,
        csvUrl: r.csv_url,
        fields: typeof r.fields === "string" ? (JSON.parse(r.fields) as IndicatorField[]) : r.fields,
        retrievedAt: r.retrieved_at,
      },
    ]),
  );
}

/** A Postgres text[] printed as text, '{DOSM,BNM}', when the client has not parsed it (fetch_types is off). */
export function parseTextArray(text: string): string[] {
  const inner = text.replace(/^\{|\}$/g, "");
  return inner ? inner.split(",").map((s) => s.replace(/^"|"$/g, "")) : [];
}

/** Each requested series, oldest year first, as published. */
export async function getSeries(ids: readonly SeriesId[]): Promise<Record<SeriesId, Point[]>> {
  const keys = ids.map((id) => ({ id, ...SERIES[id] }));
  const rows = await sql<{ id: SeriesId; year: number; value: string | null }[]>`
    select k.id, extract(year from v.date)::int as year, v.value::text as value
    from jsonb_to_recordset(${JSON.stringify(keys)}::text::jsonb) as k(id text, dataset text, measure text, dims jsonb)
    join indicator_value v on v.dataset_id = k.dataset and v.measure = k.measure and v.dims = k.dims
    order by k.id, v.date
  `;
  const out = Object.fromEntries(ids.map((id) => [id, [] as Point[]])) as Record<SeriesId, Point[]>;
  for (const r of rows) out[r.id].push({ year: r.year, value: r.value });
  return out;
}

/** A series as year → number, leaving out the years published as null. */
export function byYear(points: Point[]): Map<number, number> {
  return new Map(points.filter((p) => p.value !== null).map((p) => [p.year, Number(p.value)]));
}

/** `part` as a percentage of `whole` for the years both have, in the order of `years`. */
export function shareOf(years: number[], part: Map<number, number>, whole: Map<number, number>): (number | null)[] {
  return years.map((y) => {
    const p = part.get(y);
    const w = whole.get(y);
    return p === undefined || w === undefined || w === 0 ? null : (p / w) * 100;
  });
}

/** A dataset field's unit as its description opens with it: "[Float, RM mil] …" gives "RM mil". */
export function fieldUnit(field: IndicatorField | undefined): string | null {
  const found = /^\[[^\],]+,\s*([^\]]+)\]/.exec(field?.description ?? "");
  return found ? found[1].trim() : null;
}
