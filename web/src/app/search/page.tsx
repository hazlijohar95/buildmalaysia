import type { Metadata } from "next";
import Link from "next/link";
import { searchHits, SEARCH_MAX_LEN, type SearchHit } from "@/lib/search";
import { formatSenCompact } from "@/lib/money";
import { Band, PageHeader, kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Search" };

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, SEARCH_MAX_LEN);
  const hits = query ? await searchHits(query) : [];

  const byKind = groupByKind(hits);
  const hasResults = hits.length > 0;

  return (
    <>
      <PageHeader eyebrow="Search" title="Find anything">
        <form action="/search" method="get" className="flex gap-0 max-w-xl">
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
            Search ministries, votes, programmes, activities, and development projects by name or code. You can type in
            English or Bahasa Malaysia.
          </p>
        </Band>
      )}

      {query && !hasResults && (
        <Band>
          <p className="max-w-xl text-charcoal-800">
            No results for &ldquo;{query}&rdquo;. Search a name in English or Bahasa Malaysia, such as health or
            kesihatan, or a vote code such as B.42.
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
    </>
  );
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
  return (
    <Band>
      <h2 className={cn(kicker, "text-charcoal-700")}>{label}</h2>
      <ul className="mt-6 divide-y divide-border list-none m-0 p-0 max-w-3xl">
        {hits.map((hit, i) => (
          <HitRow key={i} hit={hit} />
        ))}
      </ul>
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
      <Link href={hit.href} className="group flex items-start justify-between gap-6 no-underline">
        <div className="min-w-0">
          <span className="font-mono text-xs text-charcoal-600 mr-2">{hit.code}</span>
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
      </Link>
    </li>
  );
}
