// /contracts/[kind]/[id]: one award result, read. The record MyProcurement prints, then what it means: where the
// contract sits among its ministry's, how it compares with the tender limit, the buyer's market and the winner's
// record. Each observation links to its formula on /contracts/method; the notice itself is linked as the source.
// The record is one indexed lookup and is sent at once; the reading takes several and streams in behind it.
import { notFound } from "@/lib/abort";
import { Band, StatRow, kicker } from "@/components/Boxed";
import { LimitBar, MarketBar, ValueHistogram } from "@/components/contracts/Charts";
import Observations from "@/components/contracts/Observations";
import SectionSkeleton from "@/components/contracts/SectionSkeleton";
import { cn } from "@/lib/cn";
import { CIRCULARS, MARKET_YEARS, SPLIT_WINDOW_DAYS, quotationLimit } from "@/lib/contract-checks";
import { buyerName, categoryLabel, contractObservations, formatDay } from "@/lib/contract-commentary";
import {
  KINDS,
  canonicalMinistry,
  contractHref,
  contractTitleTransition,
  contractsHref,
  ministryLabel,
  parseContractFilters,
  supplierHref,
  supplierKey,
} from "@/lib/contracts";
import { formatSen, formatSenCompact } from "@/lib/money";
import { getContract, getContractReading, leadAward } from "@/lib/queries/contract";
import type { Contract } from "@/lib/contracts";
import { readableCase } from "@/lib/readable-case";
import type { Page, RouteContext } from "@/lib/route";

const button = cn(
  kicker,
  "tap inline-flex min-h-12 items-center gap-3 border-2 border-foreground px-5 no-underline text-foreground hover:bg-foreground hover:text-background",
);

export default async function contractPage({ params }: RouteContext): Promise<Page> {
  const c = await getContract(params.kind ?? "", params.id ?? "");
  if (!c) notFound();
  const title = readableCase(c.title);
  const ministry = ministryLabel(c.ministry);
  const agency = buyerName(c);
  const lead = leadAward(c);
  const none = parseContractFilters(new URLSearchParams());

  return {
    head: {
      title: title.length > 70 ? `${title.slice(0, 67).trimEnd()}…` : title,
      description: `${KINDS[c.kind].label} awarded by ${agency}${c.total !== null ? ` for ${formatSenCompact(c.total)}` : ""}${lead ? ` to ${readableCase(lead.supplier)}` : ""}, ${formatDay(c.dated)}: the record and what it means.`,
    },
    body: (
      <>
        <Band>
          <nav aria-label="Breadcrumb" className={cn(kicker, "flex flex-wrap gap-x-3 text-charcoal-700")}>
            <a href="/contracts" className="text-charcoal-700">
              Government contracts
            </a>
            <span aria-hidden="true">/</span>
            <span>
              {KINDS[c.kind].label} · {formatDay(c.dated)}
            </span>
          </nav>
          <h1
            lang="ms"
            style={contractTitleTransition(c)}
            className="mt-5 max-w-5xl font-display text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] md:text-4xl"
          >
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-charcoal-800">
            Bought by <span lang="ms">{agency}</span>
            {ministry && canonicalMinistry(c.agency) !== canonicalMinistry(c.ministry) && (
              <>
                {" "}
                under{" "}
                <a href={contractsHref(none, { ministry: canonicalMinistry(c.ministry) })} lang="ms">
                  {ministry}
                </a>
              </>
            )}
            , for {categoryLabel(c.category)}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={c.sourceUrl} className={button} rel="external">
              Original notice on MyProcurement ↗
            </a>
            <a href="#record" className={cn(button, "border-transparent hover:border-foreground")}>
              The full record ↓
            </a>
          </div>
        </Band>

        <StatRow
          stats={[
            {
              label: "Price accepted",
              value: c.total === null ? "Not printed" : formatSenCompact(c.total),
              title: c.total === null ? undefined : formatSen(c.total),
            },
            {
              label: c.awards.length > 1 ? `Winners · ${c.awards.length}` : "Winner",
              value: (
                <span className="block truncate text-[min(1.75rem,9cqi)]" lang="ms">
                  {lead ? readableCase(lead.supplier) : "Not printed"}
                </span>
              ),
              sub: c.awards.length > 1 ? `and ${c.awards.length - 1} more on a panel` : undefined,
            },
            {
              label: "Method",
              value: <span className="text-[min(2rem,10cqi)]">{KINDS[c.kind].label}</span>,
              sub: <span lang="ms">{KINDS[c.kind].ms}</span>,
            },
            {
              label: c.resultDated ? "Decided" : "Published",
              value: <span className="text-[min(2rem,10cqi)]">{formatDay(c.dated)}</span>,
            },
          ]}
        />
      </>
    ),
    deferred: {
      skeleton: <SectionSkeleton title="What this means" label="Reading this contract" shape="observations" />,
      load: () => ContractReadingSections({ c }),
    },
  };
}

/** Everything that waits on the reading: the commentary, the three figures and the full record. */
async function ContractReadingSections({ c }: { c: Contract }) {
  const reading = await getContractReading(c);
  const observations = contractObservations(c, reading);
  const ministry = ministryLabel(c.ministry);
  const agency = buyerName(c);
  const lead = leadAward(c);
  const limit = c.kind === "quotation" ? quotationLimit(c.category, c.dated) : null;
  const questions = observations.filter((o) => o.tone === "question").length;

  return (
    <>
      <Band id="meaning">
        <h2 className="m-0 font-display text-3xl font-semibold tracking-tight md:text-4xl">What this means</h2>
        <p className="mt-3 max-w-3xl text-lg text-charcoal-800">
          <strong className="text-foreground">
            {questions > 0
              ? `${questions === 1 ? "One pattern" : `${questions} patterns`} in this result ${questions === 1 ? "is" : "are"} worth asking about.`
              : "Nothing in this result stands out against the checks we run."}
          </strong>{" "}
          Each line is one check, worked out from MyProcurement&apos;s published results and set against the
          Treasury&apos;s own rules. A check raises a question for the buyer to answer. It is not a finding that
          anything was wrong.
        </p>
        <div className="mt-8">
          <Observations items={observations} />
        </div>
      </Band>

      {reading.year.contracts > 0 && (
        <Band id="size">
          <h2 className={cn(kicker, "m-0 text-charcoal-700")}>Where it sits</h2>
          <p className="mt-3 max-w-3xl font-display text-2xl font-semibold leading-snug">
            Among the {reading.year.contracts.toLocaleString("en-MY")} results {ministry ?? "its ministry"} published
            for {reading.year.number}.
          </p>
          <div className="mt-8">
            <ValueHistogram
              bins={reading.year.histogram}
              value={c.total}
              label={`Contracts of ${ministry ?? "the ministry"} in ${reading.year.number} by price accepted`}
            />
          </div>
        </Band>
      )}

      {limit && c.total !== null && c.agency.trim() !== "" && reading.nearby && (
        <Band id="limit">
          <h2 className={cn(kicker, "m-0 text-charcoal-700")}>Against the tender limit</h2>
          <p className="mt-3 max-w-3xl font-display text-2xl font-semibold leading-snug">
            A quotation may be at most {formatSen(limit.sen)}. Above that,{" "}
            <a href={CIRCULARS[limit.circular].url} rel="external">
              {CIRCULARS[limit.circular].short}
            </a>{" "}
            requires an open tender.
          </p>
          <div className="mt-8 max-w-4xl">
            <LimitBar
              limit={limit.sen}
              label={`This quotation and others from the same buyer to the same company within ${SPLIT_WINDOW_DAYS} days, against the tender limit`}
              segments={reading.nearby
                .filter((n) => n.total !== null)
                .map((n) => ({
                  key: `${n.kind}-${n.id}`,
                  value: n.total!,
                  label: readableCase(n.title),
                  current: n.id === c.id,
                }))}
            />
          </div>
          {reading.nearby.length > 1 && (
            <>
              <h3 className={cn(kicker, "m-0 mt-10 text-charcoal-700")}>
                Quotations from this buyer to the same company within {SPLIT_WINDOW_DAYS} days
              </h3>
              <ol
                role="list"
                className="m-0 mt-4 list-none divide-y divide-foreground/15 border-y-2 border-foreground p-0"
              >
                {reading.nearby.map((n) => (
                  <li key={n.id} className="grid gap-x-6 gap-y-1 py-3 md:grid-cols-[7rem_minmax(0,1fr)_auto]">
                    <span className="font-mono text-sm text-charcoal-700">{formatDay(n.dated)}</span>
                    {n.id === c.id ? (
                      <span lang="ms" className="font-semibold">
                        {readableCase(n.title)} <span className={cn(kicker, "text-merah-600")}>· this one</span>
                      </span>
                    ) : (
                      <a href={contractHref(n)} lang="ms" className="text-foreground">
                        {readableCase(n.title)}
                      </a>
                    )}
                    <span className="font-mono tabular-nums md:text-right">
                      {n.total === null ? "No price" : formatSen(n.total)}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Band>
      )}

      {c.agency.trim() !== "" && reading.market.total > 0 && reading.market.contracts > 1 && (
        <Band id="market">
          <h2 className={cn(kicker, "m-0 text-charcoal-700")}>The buyer&apos;s market</h2>
          <p className="mt-3 max-w-3xl font-display text-2xl font-semibold leading-snug">
            Who <span lang="ms">{agency}</span> paid for {categoryLabel(c.category)} in the {MARKET_YEARS} years to{" "}
            {formatDay(c.dated)}: {formatSenCompact(reading.market.total)} across{" "}
            {reading.market.contracts.toLocaleString("en-MY")} contracts.
          </p>
          <div className="mt-8">
            <MarketBar
              total={reading.market.total}
              label={`Share of ${agency}'s ${categoryLabel(c.category)} spending by company`}
              slices={[
                ...reading.market.top,
                ...(reading.market.lead && !reading.market.top.some((t) => t.key === reading.market.lead!.key)
                  ? [reading.market.lead]
                  : []),
              ].map((s) => ({
                ...s,
                name: readableCase(s.name),
                href: supplierHref(s.name),
                lead: lead ? s.key === supplierKey(lead.supplier) : false,
              }))}
            />
          </div>
        </Band>
      )}

      <Band id="record">
        <h2 className={cn(kicker, "m-0 text-charcoal-700")}>The record</h2>
        <dl className="m-0 mt-6 grid gap-x-10 gap-y-5 md:grid-cols-[12rem_minmax(0,1fr)]">
          <Field label="Title as printed">
            <span lang="ms" className="font-mono text-sm">
              {c.title}
            </span>
          </Field>
          {c.reference && <Field label="Reference">{c.reference}</Field>}
          <Field label="Method">
            {KINDS[c.kind].label} (<span lang="ms">{KINDS[c.kind].ms}</span>)
          </Field>
          {c.criterion && (
            <Field label="Reason recorded">
              <span lang="ms">{readableCase(c.criterion)}</span>
            </Field>
          )}
          <Field label="Category">
            <span lang="ms">{readableCase(c.category) || "Not printed"}</span>
          </Field>
          <Field label="Ministry">
            <span lang="ms">{ministry ?? "Not printed"}</span>
          </Field>
          <Field label="Buyer">
            <span lang="ms">{agency}</span>
          </Field>
          <Field label={c.resultDated ? "Decision date" : "Published"}>{formatDay(c.dated)}</Field>
          <Field label={c.awards.length > 1 ? "Winners" : "Winner"}>
            <ul role="list" className="m-0 list-none space-y-2 p-0">
              {c.awards.map((a) => {
                const href = supplierHref(a.supplier);
                return (
                  <li key={a.ordinal} className="flex flex-wrap justify-between gap-x-6">
                    {href ? (
                      <a href={href} lang="ms" className="font-medium text-foreground">
                        {readableCase(a.supplier)}
                      </a>
                    ) : (
                      <span lang="ms">{readableCase(a.supplier)}</span>
                    )}
                    <span className="font-mono tabular-nums text-charcoal-700">
                      {a.amount === null ? "No price printed" : formatSen(a.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Field>
          <Field label="Price accepted">{c.total === null ? "Not printed" : formatSen(c.total)}</Field>
          <Field label="Source">
            <a href={c.sourceUrl} rel="external">
              MyProcurement notice ↗
            </a>{" "}
            <span className="text-charcoal-700">· © Kementerian Kewangan Malaysia</span>
          </Field>
        </dl>
      </Band>

      <Band>
        <h2 className={cn(kicker, "m-0 text-charcoal-700")}>What the record cannot tell us</h2>
        <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-charcoal-800">
          <li>How many companies bid, and what they offered. MyProcurement publishes only the winner.</li>
          <li>The buyer&apos;s own estimate of the price, and what was finally paid after any variation.</li>
          <li>
            Who owns the winning company. Companies are matched by name, so firms sharing a name are counted together.
          </li>
        </ul>
        <p className="mt-6">
          <a href="/contracts/method" className={button}>
            How we read these contracts →
          </a>
        </p>
      </Band>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className={cn(kicker, "pt-1 text-charcoal-700")}>{label}</dt>
      <dd className="m-0 min-w-0 wrap-break-word">{children}</dd>
    </>
  );
}
