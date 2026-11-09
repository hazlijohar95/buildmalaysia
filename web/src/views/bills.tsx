// /bills: every bill Parliament lists from 1990, where each got to, and the Act it became. Every row links to the
// bill's page, which links to Parliament's listing and the Act on Laws of Malaysia.
import { Band, PageHeader, StatRow, kicker } from "@/components/Boxed";
import BillStageTag from "@/components/BillStageTag";
import {
  BILLS_PER_PAGE,
  BILLS_QUERY_MAX,
  LOM_URL,
  PARLIMEN_BILLS_URL,
  STAGES,
  actLabel,
  billCode,
  billHref,
  billsHref,
  getBillsMeta,
  lawTitle,
  parseBillFilters,
  searchBills,
  type BillFilters,
  type BillRow,
  type BillStage,
  type BillsMeta,
} from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import type { Page, RouteContext } from "@/lib/route";

const count = new Intl.NumberFormat("en-MY");
const field = "min-h-11 w-full min-w-0 border-2 border-foreground bg-background px-3 py-2 font-mono text-sm";

export default async function billsPage({ searchParams }: RouteContext): Promise<Page> {
  const filters = parseBillFilters(searchParams);
  const [meta, results] = await Promise.all([getBillsMeta(), searchBills(filters)]);
  const filtered = Boolean(filters.q || filters.stage || filters.year);

  return {
    head: {
      title: "Bills in Parliament",
      description:
        "Every bill the Dewan Rakyat and Dewan Negara list since 1990: where each one got to, who tabled it, and the Act it became, linked to Parliament and Laws of Malaysia.",
      noindex: filters.page > 1,
    },
    body: (
      <>
        <PageHeader
          eyebrow="Parliament · Bills and Acts"
          title="Bills in Parliament"
          intro={
            <p>
              Every bill <a href={PARLIMEN_BILLS_URL}>Parliament lists</a> since 1990, followed through the Dewan Rakyat
              and the Dewan Negara to the Act it became on <a href={LOM_URL}>Laws of Malaysia</a>. Search by title, Act
              or bill number, in Bahasa Malaysia or English for Acts.
            </p>
          }
        >
          <SearchForm filters={filters} meta={meta} />
        </PageHeader>

        <StatRow
          stats={[
            { label: filtered ? "Matching bills" : "Bills listed", value: count.format(results.count) },
            { label: "Became law", value: count.format(meta.stages.enacted) },
            { label: "Under way now", value: count.format(meta.underWay), sub: "On Parliament's current list" },
            { label: "Copied from Parliament", value: meta.snapshot ? formatDate(meta.snapshot.id) : "Not yet" },
          ]}
        />

        <Band>
          {!meta.snapshot ? (
            <p className="m-0 max-w-xl text-lg text-charcoal-800">
              The bills are still being copied from <a href={PARLIMEN_BILLS_URL}>Parliament</a>. Check back soon.
            </p>
          ) : results.rows.length === 0 ? (
            <p className="m-0 max-w-xl text-lg text-charcoal-800">
              Nothing matches. Try one word of the title in Bahasa Malaysia, such as <em lang="ms">kewangan</em> or{" "}
              <em lang="ms">perlembagaan</em>, or <a href="/bills">clear the search and filters</a>.
            </p>
          ) : (
            <>
              <span className={cn(kicker, "text-charcoal-700")}>
                {count.format((filters.page - 1) * BILLS_PER_PAGE + 1)}–
                {count.format(Math.min(filters.page * BILLS_PER_PAGE, results.count))} of {count.format(results.count)},
                newest first
              </span>
              <ol role="list" className="m-0 mt-6 list-none divide-y-2 divide-foreground/15 p-0">
                {results.rows.map((b) => (
                  <BillItem key={`${b.year}-${b.number}`} bill={b} />
                ))}
              </ol>
              <Pager filters={filters} pages={results.pages} />
            </>
          )}
        </Band>

        <Band>
          <h2 className={cn(kicker, "m-0 text-charcoal-700")}>About these records</h2>
          <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-charcoal-800">
            <li>
              Statuses and dates are as each house&apos;s listing prints them. Bills before 2012 are listed without
              dates.
            </li>
            <li>
              Neither Parliament nor Laws of Malaysia names the other&apos;s record, so a bill is matched to its Act by
              title, and by the Act being assented after the bill passed. A bill with no match may still be law: Laws of
              Malaysia lists amending Acts only from 2011.
            </li>
            <li>
              The records are copied from parlimen.gov.my, © Parlimen Malaysia, and lom.agc.gov.my, © Attorney
              General&apos;s Chambers. Neither copy is an official one; each bill&apos;s page links to both sources.
            </li>
          </ul>
        </Band>
      </>
    ),
  };
}

function SearchForm({ filters, meta }: { filters: BillFilters; meta: BillsMeta }) {
  return (
    <form action="/bills" method="get" role="search" data-filters className="grid max-w-4xl grid-cols-1 gap-3">
      <div className="flex">
        <label htmlFor="q" className="sr-only">
          Search bills
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q}
          maxLength={BILLS_QUERY_MAX}
          placeholder="perlembagaan, Online Safety, A1801 or D.R.27/2026"
          enterKeyHint="search"
          className="min-w-0 flex-1 border-2 border-foreground bg-background px-4 py-3 font-mono text-base placeholder:text-charcoal-600 sm:text-sm"
        />
        <button
          type="submit"
          className="border-2 border-l-0 border-foreground bg-foreground px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-background transition-colors hover:bg-merah-600"
        >
          Search
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1">
          <span className={cn(kicker, "text-charcoal-700")}>Stage</span>
          <select name="stage" defaultValue={filters.stage ?? ""} className={field}>
            <option value="">Every stage</option>
            {(Object.keys(STAGES) as BillStage[]).map((s) => (
              <option key={s} value={s}>
                {STAGES[s].label} ({count.format(meta.stages[s])})
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          <span className={cn(kicker, "text-charcoal-700")}>Year of the bill</span>
          <select name="year" defaultValue={filters.year ? String(filters.year) : ""} className={field}>
            <option value="">Every year</option>
            {meta.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filters.q || filters.stage || filters.year ? (
        <a href="/bills" className={cn(kicker, "text-charcoal-700 hover:text-merah-600")}>
          Clear the search and filters
        </a>
      ) : null}
    </form>
  );
}

function BillItem({ bill: b }: { bill: BillRow }) {
  return (
    <li className="py-6 first:pt-0">
      <div className={cn(kicker, "flex flex-wrap items-center gap-x-3 gap-y-2 text-charcoal-700")}>
        <span>{billCode(b)}</span>
        <BillStageTag stage={b.stage} />
        {b.lastMoved && <span title="The last date either house or the Act records">{formatDate(b.lastMoved)}</span>}
      </div>
      <a
        href={billHref(b)}
        lang="ms"
        className="mt-2 block font-display text-lg font-semibold leading-snug text-foreground no-underline [overflow-wrap:anywhere] hover:text-biru-800 md:text-xl"
      >
        {b.title}
        {b.titleTruncated && "…"}
      </a>
      {b.actNo && (
        <p className="m-0 mt-1 text-sm text-charcoal-700">
          {actLabel(b.actNo)}
          {b.actTitle && (
            <>
              {" "}
              · <span lang="ms">{lawTitle(b.actTitle)}</span>
            </>
          )}
          {b.royalAssent && <> · Royal Assent {formatDate(b.royalAssent)}</>}
        </p>
      )}
    </li>
  );
}

function Pager({ filters, pages }: { filters: BillFilters; pages: number }) {
  if (pages <= 1) return null;
  const link = "min-h-11 inline-flex items-center border-2 border-foreground px-4 no-underline";
  return (
    <nav aria-label="Pages" className={cn(kicker, "mt-8 flex flex-wrap items-center gap-3")}>
      {filters.page > 1 && (
        <a href={billsHref(filters, { page: filters.page - 1 })} rel="prev" className={link}>
          ← Previous
        </a>
      )}
      <span className="text-charcoal-700">
        Page {count.format(filters.page)} of {count.format(pages)}
      </span>
      {filters.page < pages && (
        <a href={billsHref(filters, { page: filters.page + 1 })} rel="next" className={link}>
          Next →
        </a>
      )}
    </nav>
  );
}
