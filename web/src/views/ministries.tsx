// The ministry list, after CanadaSpends' department list (MIT, Build Canada).
import { notFound } from "@/lib/abort";
import { Band, PageHeader } from "@/components/Boxed";
import RankedList from "@/components/RankedList";
import YearNav from "@/components/YearNav";
import { getMinistriesForYear } from "@/lib/queries/ministry";
import { slugify } from "@/lib/slug";
import { titleCase } from "@/lib/queries/sankey";
import { getLoadedYears } from "@/lib/years";
import type { Page, RouteContext } from "@/lib/route";

export default async function ministriesPage({ searchParams }: RouteContext): Promise<Page> {
  const years = await getLoadedYears();
  const requested = Number(searchParams.get("year") ?? undefined);
  const year = years.includes(requested) ? requested : years[0];
  if (year === undefined) notFound();
  const ministries = await getMinistriesForYear(year);
  return {
    head: {
      title: "Ministries",
      description: `What each federal ministry and department spent in ${year}: its operating and development votes together, as printed in the audited statement.`,
    },
    body: (
      <>
        <PageHeader
          eyebrow={`Ministries · ${year}`}
          title="Ministries explained"
          intro="What each federal ministry and department spent: its operating vote and development vote together, as printed in the audited statement. Pick one to see its programmes, projects and history."
        >
          <YearNav year={year} years={years} hrefFor={(y) => `/ministries?year=${y}`} />
        </PageHeader>
        <Band>
          <RankedList
            items={ministries.map((m) => ({
              key: m.body_id,
              name: titleCase(m.name_ms),
              href: `/ministries/${slugify(m.body_name_ms)}`,
              amount_sen: m.actual_sen,
              note: `${(m.share * 100).toFixed(1)}% of federal spending`,
            }))}
          />
          <p className="mt-8 max-w-lg text-sm text-charcoal-700">
            Shares are of total federal spending, which also includes charged expenditure (debt service, pensions and
            grants to states) paid outside any ministry. Peruntukan Kepada Kumpulan Wang Terkanun is transfers into
            statutory funds, including the Development Fund that pays for development spending.
          </p>
        </Band>
      </>
    ),
  };
}
