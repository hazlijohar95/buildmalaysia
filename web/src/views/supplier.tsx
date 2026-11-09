// /contracts/company/[slug]: everything a company has won in MyProcurement's published results, by year, method,
// ministry and buyer, and the checks that read its record against everyone else's.
import { notFound } from "@/lib/abort";
import { Band, StatRow, kicker } from "@/components/Boxed";
import Observations from "@/components/contracts/Observations";
import RankedList from "@/components/RankedList";
import StackedBars from "@/components/StackedBars";
import { cn } from "@/lib/cn";
import { percent } from "@/lib/contract-checks";
import { formatDay, supplierObservations } from "@/lib/contract-commentary";
import {
  KINDS,
  contractHref,
  contractsHref,
  ministryLabel,
  parseContractFilters,
  type ContractKind,
} from "@/lib/contracts";
import { formatSen, formatSenCompact } from "@/lib/money";
import { getNearLimitBaseRate, getSupplier, type SupplierContract } from "@/lib/queries/supplier";
import { readableCase } from "@/lib/readable-case";
import type { Page, RouteContext } from "@/lib/route";
import { SERIES } from "@/styles/charts/series";

const KIND_ORDER: ContractKind[] = ["tender", "quotation", "direct"];
const KIND_COLOR: Record<ContractKind, string> = {
  tender: SERIES[4].hex,
  quotation: SERIES[1].hex,
  direct: SERIES[0].hex,
};

export default async function supplierPage({ params }: RouteContext): Promise<Page> {
  const [s, base] = await Promise.all([getSupplier(params.slug ?? ""), getNearLimitBaseRate()]);
  if (!s) notFound();
  const name = readableCase([...s.names].sort((a, b) => b.length - a.length)[0] ?? "");
  const observations = supplierObservations(s, base);
  const years = [...new Set(s.years.map((y) => y.year))].sort((a, b) => a - b);
  const none = parseContractFilters(new URLSearchParams());
  const firstYear = s.first.slice(0, 4);
  const lastYear = s.last.slice(0, 4);

  return {
    head: {
      title: name,
      description: `What ${name} has won from the federal government: ${s.contracts.toLocaleString("en-MY")} contracts worth ${formatSenCompact(s.value)} on MyProcurement, ${firstYear}–${lastYear}, by ministry, buyer and method.`,
    },
    body: (
      <>
        <Band>
          <nav aria-label="Breadcrumb" className={cn(kicker, "flex flex-wrap gap-x-3 text-charcoal-700")}>
            <a href="/contracts" className="text-charcoal-700">
              Government contracts
            </a>
            <span aria-hidden="true">/</span>
            <span>Company</span>
          </nav>
          <h1
            lang="ms"
            className="mt-5 max-w-5xl font-display text-4xl font-semibold tracking-tight wrap-break-word md:text-6xl"
          >
            {name}
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-charcoal-800">
            Every federal award result on MyProcurement that names this company, from {formatDay(s.first)} to{" "}
            {formatDay(s.last)}.
            {s.names.length > 1 && (
              <>
                {" "}
                MyProcurement spells it {s.names.length} ways:{" "}
                <span lang="ms">{s.names.map((n) => readableCase(n)).join("; ")}</span>.
              </>
            )}
          </p>
          <p className="mt-6">
            <a
              href={contractsHref(none, { q: s.names[0] })}
              className={cn(
                kicker,
                "tap inline-flex min-h-12 items-center border-2 border-foreground px-5 no-underline text-foreground hover:bg-foreground hover:text-background",
              )}
            >
              Search all its results →
            </a>
          </p>
        </Band>

        <StatRow
          stats={[
            { label: "Won", value: formatSenCompact(s.value), title: formatSen(s.value) },
            { label: "Contracts", value: s.contracts.toLocaleString("en-MY") },
            { label: "Years", value: firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}` },
            {
              label: "Without open competition",
              value: s.value > 0 ? percent(s.byKind.direct.value / s.value) : "0%",
              sub: `${s.byKind.direct.contracts.toLocaleString("en-MY")} direct negotiations`,
            },
          ]}
        />

        {observations.length > 0 && (
          <Band id="meaning">
            <h2 className="m-0 font-display text-3xl font-semibold tracking-tight md:text-4xl">What this means</h2>
            <p className="mt-3 max-w-3xl text-charcoal-800">
              The company&apos;s record set against every other company&apos;s. A check raises a question; it is not a
              finding that anything was wrong.
            </p>
            <div className="mt-8">
              <Observations items={observations} />
            </div>
          </Band>
        )}

        <Band id="years">
          <h2 className={cn(kicker, "m-0 text-charcoal-700")}>Won each year, by method</h2>
          <div className="mt-8">
            <StackedBars
              label={`Value ${name} won each year, by tender, quotation and direct negotiation`}
              series={KIND_ORDER.map((k) => ({ label: KINDS[k].label, color: KIND_COLOR[k] }))}
              rows={years.map((year) => ({
                year,
                values: KIND_ORDER.map((k) => s.years.find((y) => y.year === year && y.kind === k)?.value ?? 0),
              }))}
            />
          </div>
        </Band>

        <Band id="buyers">
          <div className="grid gap-12 lg:grid-cols-2">
            <section>
              <h2 className={cn(kicker, "m-0 text-charcoal-700")}>Its largest buyers</h2>
              <p className="mt-3 text-charcoal-800">
                Each with this company&apos;s share of everything that buyer awarded while the company was winning.
              </p>
              <RankedList
                className="mt-6"
                items={s.buyers.map((b) => ({
                  key: b.agency,
                  name: readableCase(b.agency),
                  amount_sen: b.value,
                  note: `${b.contracts.toLocaleString("en-MY")} contracts${b.buyerTotal > 0 ? ` · ${percent(b.value / b.buyerTotal)} of the buyer's total` : ""}`,
                }))}
              />
            </section>
            <section>
              <h2 className={cn(kicker, "m-0 text-charcoal-700")}>By ministry</h2>
              <p className="mt-3 text-charcoal-800">Where its contracts sit in the federal government.</p>
              <RankedList
                className="mt-6"
                items={s.ministries.map((m) => ({
                  key: m.ministry,
                  name: ministryLabel(m.ministry) ?? "Ministry not stated",
                  href: contractsHref(none, { ministry: m.ministry, q: s.names[0] }),
                  amount_sen: m.value,
                  note: `${m.contracts.toLocaleString("en-MY")} contracts`,
                }))}
              />
            </section>
          </div>
        </Band>

        <Band id="largest">
          <h2 className={cn(kicker, "m-0 text-charcoal-700")}>Its largest contracts</h2>
          <ContractList contracts={s.largest} />
          <h2 className={cn(kicker, "m-0 mt-12 text-charcoal-700")}>Its latest</h2>
          <ContractList contracts={s.latest} />
        </Band>

        <Band>
          <h2 className={cn(kicker, "m-0 text-charcoal-700")}>About this company page</h2>
          <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-charcoal-800">
            <li>
              MyProcurement names companies but not their SSM registration numbers. Results are gathered by the letters
              and digits of the name, so &ldquo;Sdn. Bhd.&rdquo; and &ldquo;Sdn Bhd&rdquo; count as one company, and two
              firms sharing a name are counted together.
            </li>
            <li>
              Amounts are this company&apos;s share of each result: on a panel contract, the price printed beside its
              name.
            </li>
            <li>We cannot see the bids it lost, or who owns it.</li>
          </ul>
          <p className="mt-6">
            <a href="/contracts/method" className={cn(kicker, "text-foreground")}>
              How we read these contracts →
            </a>
          </p>
        </Band>
      </>
    ),
  };
}

function ContractList({ contracts }: { contracts: SupplierContract[] }) {
  return (
    <ol role="list" className="m-0 mt-4 list-none divide-y divide-foreground/15 border-y-2 border-foreground p-0">
      {contracts.map((c) => (
        <li key={`${c.kind}-${c.id}`} className="grid gap-x-8 gap-y-1 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className={cn(kicker, "flex flex-wrap gap-x-3 text-charcoal-700")}>
              <span>{KINDS[c.kind].label}</span>
              <span aria-hidden="true">·</span>
              <span>{formatDay(c.dated)}</span>
              {c.nearLimit && (
                <span className="bg-copper-100 px-2 text-merah-700" title="Within 5% under the tender limit">
                  Near the tender limit
                </span>
              )}
            </div>
            <a
              href={contractHref(c)}
              lang="ms"
              className="mt-1 block font-semibold leading-snug text-foreground no-underline [overflow-wrap:anywhere] hover:text-biru-800"
            >
              {readableCase(c.title)}
            </a>
            <span lang="ms" className="text-sm text-charcoal-700">
              {readableCase(c.agency)}
            </span>
          </div>
          <span className="font-display text-xl font-semibold tabular-nums md:text-right">
            {c.amount === null ? "No price" : formatSenCompact(c.amount)}
          </span>
        </li>
      ))}
    </ol>
  );
}
