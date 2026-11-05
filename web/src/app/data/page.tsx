import type { Metadata } from "next";
import Link from "next/link";
import { Band, H2, PageHeader } from "@/components/Boxed";
import { DATASETS } from "@/lib/datasets";

export const metadata: Metadata = {
  title: "Download data",
};

export default async function DataPage() {
  // Resolve all year lists in parallel.
  const datasetsWithYears = await Promise.all(
    [...DATASETS.values()].map(async (ds) => ({ ds, years: await ds.years() })),
  );

  return (
    <>
      <PageHeader
        eyebrow="Download data"
        title="Every figure as CSV"
        intro={
          <p>
            Each dataset below contains the figures shown on this site, one row per fact, with the page number and URL
            of the source document in every row. Amounts are exact ringgit (not rounded), computed from the integer-sen
            values the pipeline stores. They are as printed in the source, before inflation adjustment.
          </p>
        }
      />

      {datasetsWithYears.map(({ ds, years }) => (
        <Band key={ds.id} id={ds.id} wide>
          <H2>{ds.title}</H2>
          <p className="mt-4 max-w-3xl text-charcoal-800">{ds.description}</p>

          <div className="mt-6">
            <p className="font-semibold">Columns</p>
            <dl className="mt-3 space-y-1 text-sm text-charcoal-800">
              {ds.columns.map((col) => (
                <div key={col} className="flex gap-3">
                  <dt className="shrink-0 font-mono text-xs text-charcoal-600 w-56 pt-0.5">{col}</dt>
                  <dd className="m-0">{ds.columnDescriptions[col]}</dd>
                </div>
              ))}
            </dl>
          </div>

          {years.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {years.map((year) => (
                <Link
                  key={year}
                  href={`/data/${ds.id}/${year}.csv`}
                  className="inline-block border-2 border-foreground px-3 py-1 text-sm font-mono hover:bg-kuning no-underline"
                >
                  {year}.csv
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-charcoal-600">No data loaded yet.</p>
          )}
        </Band>
      ))}

      <Band>
        <div className="max-w-3xl text-sm text-charcoal-800 space-y-3">
          <p>
            Files open in Excel without a wizard (UTF-8 BOM, RFC 4180 quoting). The{" "}
            <code className="font-mono text-xs">doc_url</code> and <code className="font-mono text-xs">pdf_page</code>{" "}
            columns link each row to the exact page of the official document it was read from.
          </p>
          <p>
            Source code and pipeline are MIT-licensed at{" "}
            <a href="https://github.com/hazlijohar95/buildmalaysia" className="underline hover:text-kuning">
              github.com/hazlijohar95/buildmalaysia
            </a>
            . The figures come from Malaysian government publications.
          </p>
        </div>
      </Band>
    </>
  );
}
