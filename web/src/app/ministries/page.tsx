// Layout adapted from CanadaSpends' department list (MIT, Build Canada).
import type { Metadata } from "next";
import { H1, H2, InternalLink, Intro, P, Page, PageContent, Section } from "@/components/Layout";
import { getLatestMinistries } from "@/lib/queries/ministry";
import { titleCase } from "@/lib/queries/sankey";
import { formatSenCompact } from "@/lib/money";
import { slugify } from "@/lib/slug";

export const metadata: Metadata = { title: "Ministries" };

export default async function MinistriesPage() {
  const ministries = await getLatestMinistries();
  const year = ministries[0]?.fiscal_year;
  const largest = ministries[0]?.actual_sen ?? 1;
  return (
    <Page>
      <PageContent>
        <Section>
          <H1>Ministries explained</H1>
          <Intro>
            What each federal ministry and department spent in {year}: its supply vote (operating) and development
            vote together, as printed in the audited statement.
          </Intro>
        </Section>
        <Section>
          <H2>{year}, largest first</H2>
          <div className="leading-relaxed mb-4">
            {ministries.map((m) => (
              <div key={m.number} className="py-3 border-b border-gray-200">
                <div className="flex justify-between gap-4">
                  <InternalLink href={`/ministries/${slugify(m.name_ms)}`} className="font-medium text-gray-700">
                    {titleCase(m.name_ms)}
                  </InternalLink>
                  <span className="tabnum text-sm text-gray-600 whitespace-nowrap">
                    {formatSenCompact(m.actual_sen)} · {(m.share * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${(m.actual_sen / largest) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <P className="text-sm">
            Shares are of total federal spending, which also includes charged expenditure (debt service, pensions and
            grants to states) and, where it applies, the COVID-19 Fund. B.12&apos;s figure is transfers into
            statutory funds, including the Development Fund.
          </P>
        </Section>
      </PageContent>
    </Page>
  );
}
