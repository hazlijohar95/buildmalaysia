// /contracts: search MyProcurement's published award results. Every row links to the notice on MyProcurement.
import { Band, PageHeader, StatRow, kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";
import {
  KINDS,
  SORTS,
  canonicalMinistry,
  contractHref,
  contractsHref,
  getContractsMeta,
  ministryLabel,
  parseContractFilters,
  searchContracts,
  supplierHref,
  CONTRACTS_PER_PAGE,
  CONTRACTS_QUERY_MAX,
  type Contract,
  type ContractFilters,
  type ContractKind,
  type ContractsMeta,
} from "@/lib/contracts";
import { formatSen, formatSenCompact } from "@/lib/money";
import { readableCase } from "@/lib/readable-case";
import type { Page, RouteContext } from "@/lib/route";

const SOURCE_URL = "https://myprocurement.treasury.gov.my/";
const count = new Intl.NumberFormat("en-MY");
const day = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));

// w-full and min-w-0: a menu is otherwise as wide as its longest option, wider than a phone.
const field = "min-h-11 w-full min-w-0 border-2 border-foreground bg-background px-3 py-2 font-mono text-sm";
// The boxed tabs of YearNav: each overlaps its neighbour's border, so a row reads as one ruled strip.
const tab = cn(
  kicker,
  "inline-flex min-h-11 items-center gap-2 border-2 border-foreground -ml-[2px] px-4 no-underline",
);

export default async function contractsPage({ searchParams }: RouteContext): Promise<Page> {
  const filters = parseContractFilters(searchParams);
  const [meta, results] = await Promise.all([getContractsMeta(), searchContracts(filters)]);
  const filtered = Boolean(filters.q || filters.kind || filters.ministry || filters.year);

  return {
    head: {
      title: "Government contracts",
      description:
        "Search every tender, quotation and direct negotiation result the federal government has published on MyProcurement: what was bought, who won it, and for how much.",
      noindex: filters.page > 1,
    },
    body: (
      <>
        <PageHeader
          eyebrow="Procurement · MyProcurement"
          title="Government contracts"
          intro={
            <p>
              Every award result the federal government has published on <a href={SOURCE_URL}>MyProcurement</a>: what
              was bought, which ministry bought it, who won, and the price accepted. Search by item, company, agency or
              reference number, then open any result for <a href="/contracts/method">our reading of it</a>.
            </p>
          }
        >
          <SearchForm filters={filters} meta={meta} />
          {filtered && <ActiveFilters filters={filters} />}
        </PageHeader>

        <StatRow
          stats={[
            { label: filtered ? "Matching results" : "Results published", value: count.format(results.count) },
            {
              label: filtered ? "Accepted value of these" : "Accepted value, all results",
              value: formatSenCompact(results.total),
              title: formatSen(results.total),
            },
            {
              label: "Copied from MyProcurement",
              value: meta.snapshot ? formatDay(meta.snapshot.id) : "Not yet",
            },
          ]}
        />

        <Band>
          {!meta.snapshot ? (
            <p className="m-0 max-w-xl text-lg text-charcoal-800">
              The results are still being copied from <a href={SOURCE_URL}>MyProcurement</a>. Check back soon.
            </p>
          ) : results.rows.length === 0 ? (
            <p className="m-0 max-w-xl text-lg text-charcoal-800">
              Nothing matches. Try a shorter word in Bahasa Malaysia, such as <em lang="ms">ubat</em>,{" "}
              <em lang="ms">jalan</em> or <em lang="ms">sekolah</em>
              {filtered ? (
                <>
                  , or <a href="/contracts">clear the search and filters</a>
                </>
              ) : null}
              .
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className={cn(kicker, "text-charcoal-700")}>
                  {count.format((filters.page - 1) * CONTRACTS_PER_PAGE + 1)}–
                  {count.format(Math.min(filters.page * CONTRACTS_PER_PAGE, results.count))} of{" "}
                  {count.format(results.count)}
                </span>
                <nav aria-label="Sort" className="flex pl-[2px]">
                  {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((s) =>
                    filters.sort === s ? (
                      <span key={s} aria-current="true" className={cn(tab, "bg-foreground text-background")}>
                        {SORTS[s]}
                      </span>
                    ) : (
                      <a
                        key={s}
                        href={contractsHref(filters, { sort: s })}
                        className={cn(tab, "tap text-foreground hover:bg-linen-200")}
                      >
                        {SORTS[s]}
                      </a>
                    ),
                  )}
                </nav>
              </div>
              <ol role="list" className="m-0 mt-6 list-none divide-y-2 divide-foreground/15 p-0">
                {results.rows.map((c) => (
                  <ContractRow key={`${c.kind}-${c.id}`} contract={c} filters={filters} />
                ))}
              </ol>
              <Pager filters={filters} pages={results.pages} />
            </>
          )}
        </Band>

        <Band>
          <h2 className={cn(kicker, "m-0 text-charcoal-700")}>About these figures</h2>
          <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-charcoal-800">
            <li>
              The amounts are the prices the government accepted when it awarded each contract (
              <em lang="ms">Harga Setuju Terima</em>), as MyProcurement prints them. They are not what was finally paid,
              and MyProcurement does not say which budget vote paid for each one.
            </li>
            <li>
              Some results name several winners, for example a panel of suppliers. Their prices are added together for
              the result&apos;s total.
            </li>
            <li>
              Results are filed under the date of the award decision. Where MyProcurement prints none, the date the
              result was published is used instead.
            </li>
            <li>
              Direct negotiations (<em lang="ms">rundingan terus</em>) are only those MyProcurement lists, mostly from
              2016 and 2017. Most contracts awarded without a tender are not published there.
            </li>
            <li>
              The data is copied from MyProcurement, © Kementerian Kewangan Malaysia, and each result&apos;s page links
              to its notice there. If a result looks wrong, check it against that notice first.
            </li>
          </ul>
        </Band>
      </>
    ),
  };
}

function SearchForm({ filters, meta }: { filters: ContractFilters; meta: ContractsMeta }) {
  const groups = [
    { label: "Ministries", options: meta.ministries.current },
    { label: "Former ministries and names", options: meta.ministries.former },
    { label: "State governments", options: meta.ministries.states },
  ].filter((g) => g.options.length > 0);
  return (
    <form action="/contracts" method="get" role="search" data-filters className="grid max-w-4xl grid-cols-1 gap-3">
      <div className="flex">
        <label htmlFor="q" className="sr-only">
          Search contracts
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q}
          maxLength={CONTRACTS_QUERY_MAX}
          placeholder="ubat, hospital, a company name or a tender number"
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="grid min-w-0 gap-1">
          <span className={cn(kicker, "text-charcoal-700")}>Ministry</span>
          <select name="ministry" defaultValue={filters.ministry ?? ""} className={field}>
            <option value="">All ministries</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          <span className={cn(kicker, "text-charcoal-700")}>Type</span>
          <select name="kind" defaultValue={filters.kind ?? ""} className={field}>
            <option value="">All types</option>
            {(Object.keys(KINDS) as ContractKind[]).map((k) => (
              <option key={k} value={k}>
                {KINDS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          <span className={cn(kicker, "text-charcoal-700")}>Year</span>
          <select name="year" defaultValue={filters.year ? String(filters.year) : ""} className={field}>
            <option value="">All years</option>
            {meta.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filters.sort !== "value" && <input type="hidden" name="sort" value={filters.sort} />}
    </form>
  );
}

function ContractRow({ contract: c, filters }: { contract: Contract; filters: ContractFilters }) {
  const ministry = ministryLabel(c.ministry);
  const agency = canonicalMinistry(c.agency) !== canonicalMinistry(c.ministry) ? readableCase(c.agency) : null;
  return (
    <li className="py-6 first:pt-0">
      <div className={cn(kicker, "flex flex-wrap gap-x-3 gap-y-1 text-charcoal-700")}>
        <span>{KINDS[c.kind].label}</span>
        <span aria-hidden="true">·</span>
        <span title={c.resultDated ? "Date of the award decision" : "Date the result was published"}>
          {formatDay(c.dated)}
        </span>
        {c.reference && (
          <>
            <span aria-hidden="true">·</span>
            <span className="normal-case tracking-normal">
              <Highlight text={c.reference} q={filters.q} />
            </span>
          </>
        )}
      </div>
      <div className="mt-2 grid gap-x-8 gap-y-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <a
            href={contractHref(c)}
            lang="ms"
            className="font-display text-lg font-semibold leading-snug text-foreground no-underline [overflow-wrap:anywhere] hover:text-biru-800 md:text-xl"
          >
            <Highlight text={readableCase(c.title)} q={filters.q} />
          </a>
          <p className="m-0 mt-1 text-sm text-charcoal-700" lang="ms">
            {ministry ? (
              <a
                href={contractsHref(filters, { ministry: canonicalMinistry(c.ministry) })}
                className="text-charcoal-700"
              >
                {ministry}
              </a>
            ) : (
              <span lang="en">Ministry not stated</span>
            )}
            {agency && (
              <>
                {" "}
                · <Highlight text={agency} q={filters.q} />
              </>
            )}{" "}
            · {readableCase(c.category)}
            {c.criterion && <> · {readableCase(c.criterion)}</>}
          </p>
          <ul className="m-0 mt-3 list-none space-y-1 p-0 text-sm">
            {c.awards.map((a) => {
              const supplier = readableCase(a.supplier);
              return (
                <li key={a.ordinal} className="flex flex-wrap justify-between gap-x-6">
                  <a
                    href={supplierHref(a.supplier) ?? contractsHref(filters, { q: a.supplier })}
                    title={`Everything ${supplier} has won`}
                    className="font-medium text-foreground"
                  >
                    <Highlight text={supplier} q={filters.q} />
                  </a>
                  {c.awards.length > 1 && (
                    <span className="font-mono tabular-nums text-charcoal-700">
                      {a.amount === null ? "No price printed" : formatSen(a.amount)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="font-display text-2xl font-semibold tabular-nums whitespace-nowrap md:text-right">
          {c.total === null ? (
            <span className="text-base text-charcoal-700">No price printed</span>
          ) : (
            formatSenCompact(c.total)
          )}
          {c.total !== null && (
            <span className="block font-mono text-xs font-normal text-charcoal-700">{formatSen(c.total)}</span>
          )}
        </div>
      </div>
    </li>
  );
}

/** The search and filters in force, each with a link that removes it, and one that removes them all. */
function ActiveFilters({ filters }: { filters: ContractFilters }) {
  const chips = [
    filters.q && { label: `“${readableCase(filters.q)}”`, href: contractsHref(filters, { q: "" }) },
    filters.ministry && { label: ministryLabel(filters.ministry), href: contractsHref(filters, { ministry: null }) },
    filters.kind && { label: KINDS[filters.kind].label, href: contractsHref(filters, { kind: null }) },
    filters.year && { label: String(filters.year), href: contractsHref(filters, { year: null }) },
  ].filter((c): c is { label: string; href: string } => Boolean(c && c.label));
  if (chips.length === 0) return null;
  const none = contractsHref(filters, { q: "", ministry: null, kind: null, year: null });
  return (
    <div className="mt-4 flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2">
      <span className={cn(kicker, "text-charcoal-700")}>Showing</span>
      <ul role="list" className="m-0 flex list-none flex-wrap gap-2 p-0">
        {chips.map((c) => (
          <li key={c.href}>
            <a
              href={c.href}
              aria-label={`Remove ${c.label}`}
              className="tap inline-flex min-h-11 items-center gap-3 border-2 border-foreground bg-linen-200 px-3 text-sm text-foreground no-underline hover:bg-foreground hover:text-background"
            >
              <span lang="ms">{c.label}</span>
              <span aria-hidden="true" className="font-mono">
                ×
              </span>
            </a>
          </li>
        ))}
      </ul>
      {chips.length > 1 && (
        <a href={none} className={cn(kicker, "text-charcoal-700 hover:text-merah-600")}>
          Clear all
        </a>
      )}
    </div>
  );
}

/** Marks where the search matches, case aside: the search itself matches regardless of case. */
function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.toLowerCase();
  if (!needle) return <>{text}</>;
  const haystack = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="bg-copper-100 text-current">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

function Pager({ filters, pages }: { filters: ContractFilters; pages: number }) {
  if (pages <= 1) return null;
  const link = "min-h-11 inline-flex items-center border-2 border-foreground px-4 no-underline";
  return (
    <nav aria-label="Pages" className={cn(kicker, "mt-8 flex flex-wrap items-center gap-3")}>
      {filters.page > 1 && (
        <a href={contractsHref(filters, { page: filters.page - 1 })} rel="prev" className={link}>
          ← Previous
        </a>
      )}
      <span className="text-charcoal-700">
        Page {count.format(filters.page)} of {count.format(pages)}
      </span>
      {filters.page < pages && (
        <a href={contractsHref(filters, { page: filters.page + 1 })} rel="next" className={link}>
          Next →
        </a>
      )}
    </nav>
  );
}
