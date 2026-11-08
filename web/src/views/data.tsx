import { Band, H2, PageHeader, kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";
import { DATASETS } from "@/lib/datasets";
import type { Page } from "@/lib/route";

export default async function dataPage(): Promise<Page> {
  // Resolve all year lists in parallel.
  const datasetsWithYears = await Promise.all(
    [...DATASETS.values()].map(async (ds) => ({ ds, years: await ds.years() })),
  );

  return {
    head: {
      title: "Download data",
      description:
        "The figures behind Build Malaysia's budget and spending pages as CSV, one row per fact, each with the page number and URL of its source document.",
    },
    body: (
      <>
        <PageHeader
          eyebrow="Download data"
          title="Every figure as CSV"
          intro={
            <p>
              Each dataset below contains the figures shown on this site, one row per fact, with the page number and URL
              of the source document in every row. Amounts are exact ringgit (not rounded), computed from the
              integer-sen values the pipeline stores. They are as printed in the source, before inflation adjustment.
            </p>
          }
        />

        {datasetsWithYears.map(({ ds, years }) => (
          <Band key={ds.id} id={ds.id} wide>
            <H2>{ds.title}</H2>
            <p className="mt-4 max-w-xl text-charcoal-800">{ds.description}</p>

            <div className="mt-6">
              <p className="font-semibold">Columns</p>
              <dl id={`${ds.id}-columns`} data-collapse-all className="mt-3 space-y-1 text-sm text-charcoal-800">
                {ds.columns.map((col) => (
                  <div key={col} className="grid gap-x-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                    <dt className="break-all pt-0.5 font-mono text-xs text-charcoal-600">{col}</dt>
                    <dd className="m-0 min-w-0">{ds.columnDescriptions[col]}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                data-collapse-toggle
                data-label={`Show the ${ds.columns.length} columns`}
                data-label-open="Hide the columns"
                aria-controls={`${ds.id}-columns`}
                aria-expanded="false"
                className={cn(kicker, "tap mt-3 min-h-11 items-center border-2 border-foreground px-4")}
              >
                Show the {ds.columns.length} columns
              </button>
            </div>

            {years.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {years.map((year) => (
                  <a
                    key={year}
                    href={`/data/${ds.id}/${year}.csv`}
                    className="inline-block border-2 border-foreground px-3 py-1 text-sm font-mono hover:bg-kuning no-underline"
                  >
                    <span className="sr-only">{ds.title}, </span>
                    {year}.csv
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-charcoal-600">No data loaded yet.</p>
            )}
          </Band>
        ))}

        <Band>
          <div className="max-w-lg text-sm text-charcoal-800 space-y-3">
            <p>
              Files open in Excel without a wizard (UTF-8 BOM, RFC 4180 quoting). The{" "}
              <code className="font-mono text-xs">doc_url</code> and <code className="font-mono text-xs">pdf_page</code>{" "}
              columns link each row to the exact page of the official document it was read from.
            </p>
            <p>
              Source code and pipeline are MIT-licensed at{" "}
              <a href="https://github.com/hazlijohar95/buildmalaysia">github.com/hazlijohar95/buildmalaysia</a>. The
              figures come from Malaysian government publications.
            </p>
          </div>
        </Band>
      </>
    ),
  };
}
