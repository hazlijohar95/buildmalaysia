// /contracts/method: how the contract and company pages read MyProcurement's results. Every observation on those
// pages links to its section here by anchor; the figures are computed live from the data the pages read.
import { Band, PageHeader, StatRow, kicker } from "@/components/Boxed";
import { BunchingChart } from "@/components/contracts/Charts";
import SectionSkeleton from "@/components/contracts/SectionSkeleton";
import { cn } from "@/lib/cn";
import {
  CIRCULARS,
  DOMINANT_SHARE,
  HHI_HIGH,
  HHI_MODERATE,
  MARKET_MIN_CONTRACTS,
  MARKET_YEARS,
  MIN_FOR_RANK,
  MIN_FOR_SHARE,
  NEAR_LIMIT_SHARE,
  QUOTATION_LIMITS,
  SPLIT_WINDOW_DAYS,
  percent,
} from "@/lib/contract-checks";
import { formatDay } from "@/lib/contract-commentary";
import { formatSen } from "@/lib/money";
import { getLimitReading } from "@/lib/queries/supplier";
import type { Page } from "@/lib/route";

const OCP =
  "https://www.open-contracting.org/resources/red-flags-in-public-procurement-a-guide-to-using-data-to-detect-and-mitigate-risks";
export const METHOD_VERSION = "2026-11-09";

export default function contractsMethodPage(): Page {
  return {
    head: {
      title: "How we read government contracts",
      description:
        "The checks behind Build Malaysia's commentary on government contracts: what each measures, its formula and limits, the Treasury rules it is read against, and what the data cannot show.",
    },
    body: <MethodHeader />,
    deferred: {
      skeleton: (
        <SectionSkeleton title="Rules every observation keeps" label="Counting every quotation" shape="record" />
      ),
      load: MethodSections,
    },
  };
}

// Its figures are one pass over every quotation, kept for an hour (getLimitReading), so the header goes first.
async function MethodSections() {
  const base = await getLimitReading();
  const bins = base.bins;
  const sum = (from: number, to: number) =>
    bins.filter((b) => b.bin >= from && b.bin < to).reduce((s, b) => s + b.count, 0);
  const under = sum(95, 100);
  const over = sum(100, 105);
  const before = sum(90, 95);

  return (
    <>
      <StatRow
        stats={[
          { label: "Quotations within 5% under the limit", value: under.toLocaleString("en-MY") },
          { label: "Within 5% over it", value: over.toLocaleString("en-MY") },
          {
            label: "Share of all quotations near the limit",
            value: base.quotations > 0 ? percent(base.near / base.quotations) : "–",
            sub: `${base.near.toLocaleString("en-MY")} of ${base.quotations.toLocaleString("en-MY")}`,
          },
        ]}
      />

      <Band>
        <h2 className="m-0 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Rules every observation keeps
        </h2>
        <ol className="mt-6 max-w-3xl list-decimal space-y-3 pl-5 text-charcoal-800">
          <li>Every sentence is the result of a formula on this page, and links here.</li>
          <li>
            A <strong>question</strong> is a pattern the red-flags literature treats as worth asking about. It is never
            a finding of wrongdoing, and each one names the innocent explanations beside it.
          </li>
          <li>Contracts are compared with like contracts: the same buyer or ministry, category, method and period.</li>
          <li>
            No percentage is given on fewer than {MIN_FOR_SHARE} contracts, and no rank among fewer than {MIN_FOR_RANK}.
            A buyer&apos;s market needs {MARKET_MIN_CONTRACTS} contracts.
          </li>
          <li>
            We describe what the record shows. Words such as &ldquo;suspicious&rdquo; or &ldquo;corrupt&rdquo; are not
            used.
          </li>
        </ol>
      </Band>

      <Section id="rank" title="Size and rank" kind="Context">
        <p>
          <strong>Rank</strong>: one plus the number of the ministry&apos;s results that year with a higher price
          accepted, among results with a price. <strong>Share of the year</strong>: the price over the sum of those
          results. <strong>Peers</strong>: the share of results of the same method and category, every year, with a
          lower price.
        </p>
        <p>
          Ministries MyProcurement spells several ways are read as one, and results are filed under the date of the
          award decision, or the date published where no decision date is printed.
        </p>
      </Section>

      <Section id="direct" title="No open competition" kind="Question">
        <p>
          A result MyProcurement lists as a direct negotiation (<em lang="ms">rundingan terus</em>). We show the reason
          recorded: urgent need (<em lang="ms">keperluan mendesak</em>), a single source (<em lang="ms">satu punca</em>
          ), standardisation (<em lang="ms">penyeragaman</em>) or expertise (<em lang="ms">kepakaran</em>). Red flag:
          non-competitive procedure.
        </p>
        <p>
          MyProcurement lists few direct negotiations, mostly from 2016 and 2017, so their absence elsewhere does not
          mean none took place.
        </p>
      </Section>

      <Section id="near-limit" title="Priced just under the tender limit" kind="Question">
        <p>
          A quotation whose price is over {percent(NEAR_LIMIT_SHARE)} of the tender limit in force on its date and not
          over the limit. Above the limit the purchase must go to open tender, which takes longer and opens it to more
          bidders, so a price set to avoid one would sit here. Red flag: contract value just below the threshold.
        </p>
        <p>
          The chart below is every quotation the limits apply to, by price as a percentage of the limit. If prices fell
          freely, the bars either side of 100% would be about the same height. There are{" "}
          <strong>{under.toLocaleString("en-MY")}</strong> quotations in the 5 points under the limit,{" "}
          {before.toLocaleString("en-MY")} in the 5 points before that, and{" "}
          <strong>{over.toLocaleString("en-MY")}</strong> in the 5 points over it.
        </p>
        <div className="mt-8 not-prose">
          <BunchingChart bins={bins} />
        </div>
        <p>
          A company is read against the base rate: of the quotations a limit applies to,{" "}
          {base.quotations > 0 ? percent(base.near / base.quotations) : "–"} sit in the band. A company is raised when
          at least 3 of its quotations, and at least twice the base rate, do.
        </p>
        <h3 className={cn(kicker, "m-0 mt-8 text-charcoal-700")}>The limits we apply</h3>
        <div data-scroll-x className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] max-w-3xl border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-foreground text-left">
                <th className="py-2 pr-4 font-semibold">Purchase</th>
                <th className="py-2 pr-4 font-semibold">From</th>
                <th className="py-2 pr-4 font-semibold">To</th>
                <th className="py-2 pr-4 text-right font-semibold">Quotation up to</th>
                <th className="py-2 font-semibold">Circular</th>
              </tr>
            </thead>
            <tbody>
              {QUOTATION_LIMITS.map((l) => (
                <tr key={`${l.class}-${l.from}`} className="border-b border-foreground/15">
                  <td className="py-2 pr-4">{l.class === "works" ? "Works" : "Supplies and services"}</td>
                  <td className="py-2 pr-4 font-mono">{formatDay(l.from)}</td>
                  <td className="py-2 pr-4 font-mono">{l.to ? formatDay(l.to) : "In force"}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums">{formatSen(l.sen)}</td>
                  <td className="py-2">
                    <a href={CIRCULARS[l.circular].url} rel="external">
                      {CIRCULARS[l.circular].short}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Works quotations in 2025 are not checked: PK 2.21 for 2025 was amended partway through the year, and we have
          not settled the date the higher limit took effect. Consultancy follows separate limits and is not checked.
        </p>
      </Section>

      <Section id="splitting" title="Possible splitting" kind="Question">
        <p>
          Quotations from one buyer to one company, in the same category, dated within {SPLIT_WINDOW_DAYS} days either
          side of each other, where each is under the tender limit and together they pass it. PK 2.1 forbids breaking a
          purchase into smaller ones to avoid a quotation or tender (<em lang="ms">memecah kecilkan</em>). Red flag:
          contract splitting.
        </p>
        <p>
          Two quotations on the same day to the same company are common on their own: one buyer often buys for several
          schools, clinics or wards. That is why the check needs the total to pass the limit, and why the page lists the
          titles for a reader to judge.
        </p>
      </Section>

      <Section id="market" title="A buyer's market" kind="Context, or a question past a line">
        <p>
          A buyer&apos;s market is the value it awarded in one category over the {MARKET_YEARS} years up to a
          contract&apos;s date, split by company. A company&apos;s <strong>share</strong> is the amount printed beside
          its name over that total; at {percent(DOMINANT_SHARE)} or more it is raised as a question. Red flag: supplier
          dominance.
        </p>
        <p>
          <strong>Concentration</strong> is the Herfindahl-Hirschman Index: the sum of every company&apos;s squared
          percentage share, from near 0 (many small suppliers) to 10,000 (one). Following the 2023 US Merger Guidelines,
          under {HHI_MODERATE.toLocaleString("en-MY")} is unconcentrated, {HHI_MODERATE.toLocaleString("en-MY")} to{" "}
          {HHI_HIGH.toLocaleString("en-MY")} moderately concentrated, and above {HHI_HIGH.toLocaleString("en-MY")}{" "}
          highly concentrated. A small buyer can look concentrated from a few purchases, so a market needs{" "}
          {MARKET_MIN_CONTRACTS} contracts.
        </p>
      </Section>

      <Section id="companies" title="Companies" kind="How they are matched">
        <p>
          MyProcurement names winners but not their SSM registration numbers. A company is the run of capital letters
          and digits in its name, so &ldquo;Loyal Engineering Sdn. Bhd.&rdquo; and &ldquo;LOYAL ENGINEERING SDN
          BHD&rdquo; are one company. That merges about 32,100 printed names into about 30,900. Two firms sharing a name
          are counted together, and a company that changed its name appears twice.
        </p>
      </Section>

      <Section id="limits" title="What the data cannot show" kind="Limits">
        <p>
          The red flags that weigh most in the research need data MyProcurement does not publish: how many companies bid
          and what they offered, the buyer&apos;s own price estimate, changes to the contract after award, what was
          finally paid, and who owns the winner. We do not guess at them.
        </p>
        <p>
          Every result links to its notice on MyProcurement, © Kementerian Kewangan Malaysia. If a reading looks wrong,
          check it against that notice first, then tell us.
        </p>
      </Section>
    </>
  );
}

function MethodHeader() {
  return (
    <PageHeader
      eyebrow={`Contracts · Method · ${formatDay(METHOD_VERSION)}`}
      title="How we read government contracts"
      intro={
        <>
          <p>
            MyProcurement publishes who won each federal contract and the price accepted. On its own that is a list.
            Each contract and company page on Build Malaysia reads the list with a fixed set of checks, so a reader can
            see whether a result is ordinary or worth a question.
          </p>
          <p>
            The checks follow the Open Contracting Partnership&apos;s{" "}
            <a href={OCP} rel="external">
              Red Flags in Public Procurement
            </a>{" "}
            (2024), adapted to what MyProcurement publishes, and read against the Treasury&apos;s own circulars on
            procurement methods.
          </p>
        </>
      }
    />
  );
}

function Section({
  id,
  title,
  kind,
  children,
}: {
  id: string;
  title: string;
  kind: string;
  children: React.ReactNode;
}) {
  return (
    <Band id={id}>
      <div className="grid gap-x-12 gap-y-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div>
          <span className={cn(kicker, "text-charcoal-700")}>{kind}</span>
          <h2 className="m-0 mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
        </div>
        <div className="min-w-0 max-w-3xl space-y-4 text-charcoal-800 [&_p]:m-0">{children}</div>
      </div>
    </Band>
  );
}
