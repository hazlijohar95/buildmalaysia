import { DATASETS } from "@/lib/datasets";
import { buildCsv } from "@/lib/csv";

interface Params {
  dataset: string;
  file: string; // e.g. "2024.csv"
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }): Promise<Response> {
  const { dataset: datasetId, file } = await params;

  if (!file.endsWith(".csv")) {
    return new Response("Not found", { status: 404 });
  }
  const yearStr = file.slice(0, -4);
  const year = /^\d{4}$/.test(yearStr) ? Number(yearStr) : NaN;
  if (!Number.isFinite(year)) {
    return new Response("Not found", { status: 404 });
  }

  const dataset = DATASETS.get(datasetId);
  if (!dataset) {
    return new Response("Not found", { status: 404 });
  }

  const years = await dataset.years();
  if (!years.includes(year)) {
    return new Response("Not found", { status: 404 });
  }

  const rows = await dataset.rows(year);
  const csv = buildCsv(dataset.columns, rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="buildmalaysia-${datasetId}-${year}.csv"`,
    },
  });
}
