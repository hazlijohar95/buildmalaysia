import { searchHits, SEARCH_MAX_LEN, type SearchHit } from "@/lib/search";
import { formatSenCompact } from "@/lib/money";
import { Band, PageHeader, kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";
import type { Page, RouteContext } from "@/lib/route";

export default async function searchPage({ searchParams }: RouteContext): Promise<Page> {
  const query = (searchParams.get("q") ?? "").trim().slice(0, SEARCH_MAX_LEN);
  const hits = query ? await searchHits(query) : [];

  const byKind = groupByKind(hits);
  const hasResults = hits.length > 0;

  return {
    head: {
      title: "Search",
      description:
        "Search Malaysian federal ministries, votes, programmes, activities and projects by name or code, in English or Bahasa Malaysia.",
    },
    body: (
      <>
        <PageHeader eyebrow="Search" title="Find anything">
          {/* Below lg the form rides just above the tab bar, where a thumb reaches it. */}
          <form
            action="/search"
            method="get"
            role="search"
            className="flex gap-0 max-w-xl max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(var(--tabbar)+2px+env(safe-area-inset-bottom,0px))] max-lg:z-40 max-lg:max-w-none max-lg:border-t-2 max-lg:border-foreground max-lg:bg-background max-lg:p-3 max-lg:pl-[max(0.75rem,env(safe-area-inset-left,0px))] max-lg:pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
          >
            <label htmlFor="q" className="sr-only">
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              maxLength={SEARCH_MAX_LEN}
              placeholder="health, kesihatan or B.42"
              enterKeyHint="search"
              autoFocus={!query}
              className="min-w-0 flex-1 border-2 border-foreground bg-background px-4 py-3 font-mono text-base placeholder:text-charcoal-600 sm:text-sm"
            />
            <button
              type="submit"
              className="border-2 border-l-0 border-foreground bg-foreground px-6 py-3 font-mono text-sm uppercase tracking-[0.14em] text-background transition-colors hover:bg-merah-600 active:bg-merah-700"
            >
              Search
            </button>
          </form>
        </PageHeader>

        {!query && (
          <Band>
            <p className="text-charcoal-800 max-w-xl">
              Search ministries, votes, programmes, activities, and development projects by name or code. You can type
              in English or Bahasa Malaysia. To find a contract or the company that won it, search{" "}
              <a href="/contracts">government contracts</a>.
            </p>
          </Band>
        )}

        {query && !hasResults && (
          <Band>
            <p className="max-w-xl text-charcoal-800">
              No results for &ldquo;{query}&rdquo;. Search a name in English or Bahasa Malaysia, such as health or
              kesihatan, or a vote code such as B.42. Looking for a contract or a company?{" "}
              <a href={`/contracts?${new URLSearchParams({ q: query }).toString()}`}>Search government contracts</a>.
            </p>
          </Band>
        )}

        {hasResults && (
          <>
            {byKind.ministry.length > 0 && <ResultGroup label="Ministries" hits={byKind.ministry} />}
            {byKind.vote.length > 0 && <ResultGroup label="Votes" hits={byKind.vote} />}
            {byKind.programme.length > 0 && <ResultGroup label="Programmes" hits={byKind.programme} />}
            {byKind.activity.length > 0 && <ResultGroup label="Activities" hits={byKind.activity} />}
            {byKind.project.length > 0 && <ResultGroup label="Development projects" hits={byKind.project} />}
          </>
        )}
        <div aria-hidden="true" className="h-20 lg:hidden" />
      </>
    ),
  };
}

function groupByKind(hits: SearchHit[]): Record<SearchHit["kind"], SearchHit[]> {
  return {
    ministry: hits.filter((h) => h.kind === "ministry"),
    vote: hits.filter((h) => h.kind === "vote"),
    programme: hits.filter((h) => h.kind === "programme"),
    activity: hits.filter((h) => h.kind === "activity"),
    project: hits.filter((h) => h.kind === "project"),
  };
}

function ResultGroup({ label, hits }: { label: string; hits: SearchHit[] }) {
  const id = `results-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <Band>
      <h2 className={cn(kicker, "text-charcoal-700")}>{label}</h2>
      <ul
        id={id}
        data-collapse={hits.length > 4 ? "4" : undefined}
        className="mt-6 divide-y divide-border list-none m-0 p-0 max-w-3xl"
      >
        {hits.map((hit, i) => (
          <HitRow key={i} hit={hit} />
        ))}
      </ul>
      {hits.length > 4 && (
        <button
          type="button"
          data-collapse-toggle
          data-label={`Show all ${hits.length}`}
          aria-controls={id}
          aria-expanded="false"
          className={cn(kicker, "tap mt-4 min-h-11 items-center border-2 border-foreground px-4")}
        >
          Show all {hits.length}
        </button>
      )}
    </Band>
  );
}

function HitRow({ hit }: { hit: SearchHit }) {
  const sub =
    hit.kind === "ministry"
      ? hit.formerly && (hit.formerly.origin === "acronym" ? hit.formerly.name_ms : `formerly ${hit.formerly.name_ms}`)
      : hit.kind === "vote"
        ? null
        : hit.vote_name_ms;

  return (
    <li className="py-4">
      <a href={hit.href} className="group flex items-start justify-between gap-6 no-underline">
        <div className="min-w-0">
          <span className="font-mono text-xs text-charcoal-600 mr-2">{hit.code}</span>{" "}
          <span
            lang="ms"
            className="font-medium text-foreground group-hover:text-biru-800 transition-colors duration-150"
          >
            {hit.name_ms}
          </span>
          {sub && (
            <span lang="ms" className="block mt-0.5 text-sm text-charcoal-700">
              {sub}
            </span>
          )}
        </div>
        {hit.actual_sen !== null && hit.actual_sen > 0 && (
          <span className="shrink-0 font-mono text-sm tabular-nums text-charcoal-700 whitespace-nowrap">
            {formatSenCompact(hit.actual_sen)}
          </span>
        )}
      </a>
    </li>
  );
}
