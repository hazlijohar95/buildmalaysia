// The year tabs and breadcrumb a vote page opens with, for spending and budget votes alike.
import { Breadcrumb, type Crumb } from "@/components/Figures";
import YearNav from "@/components/YearNav";
import { titleCase } from "@/lib/queries/sankey";
import { otherNames, type MinistryLink, type VoteYear } from "@/lib/queries/vote-nav";

/** "2021–2023, 2025" from a sorted list of years. */
export function yearSpans(years: number[]): string {
  const spans: [number, number][] = [];
  for (const y of years) {
    const last = spans.at(-1);
    if (last && y === last[1] + 1) last[1] = y;
    else spans.push([y, y]);
  }
  return spans.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
}

/** Section / year / ministry / vote code. */
export function VoteCrumbs({
  section,
  year,
  ministry,
  code,
}: {
  section: Crumb; // "By year" or "Budget"
  year: Crumb;
  ministry: MinistryLink | null;
  code: string;
}) {
  return (
    <Breadcrumb
      items={[
        section,
        year,
        ...(ministry ? [{ label: titleCase(ministry.name_ms), href: `/ministries/${ministry.slug}`, lang: "ms" }] : []),
        { label: code },
      ]}
    />
  );
}

/** Tabs to the same vote in every loaded year that prints it, and the names it was printed under elsewhere. */
export function VoteYears({
  year,
  years,
  name,
  hrefFor,
}: {
  year: number;
  years: VoteYear[];
  name: string; // this year's printed name
  hrefFor: (year: number) => string;
}) {
  const others = otherNames(years, name);
  return (
    <>
      {years.length > 1 && <YearNav year={year} years={years.map((y) => y.year)} hrefFor={hrefFor} />}
      {others.length > 0 && (
        <p className="mt-3 text-sm text-charcoal-700">
          The same code is printed as{" "}
          {others.map((o, i) => (
            <span key={o.name_ms}>
              {i > 0 && (i === others.length - 1 ? " and " : ", ")}
              <span lang="ms">{titleCase(o.name_ms)}</span> in {yearSpans(o.years)}
            </span>
          ))}
          .
        </p>
      )}
    </>
  );
}
