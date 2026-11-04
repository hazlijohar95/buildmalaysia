import Link from "next/link";

/** Links to the same page in every loaded year: `/<year><suffix>`, or `hrefFor(year)` when given. */
export default function YearNav({
  year,
  years,
  suffix = "",
  hrefFor,
}: {
  year: number;
  years: number[];
  suffix?: string;
  hrefFor?: (year: number) => string;
}) {
  return (
    <nav className="flex flex-wrap gap-3 text-sm mb-4 font-display" aria-label="Fiscal year">
      {[...years].sort().map((y) =>
        y === year ? (
          <span key={y} className="font-semibold border-b-2 border-foreground" aria-current="page">
            {y}
          </span>
        ) : (
          <Link key={y} href={hrefFor ? hrefFor(y) : `/${y}${suffix}`} style={{ color: "var(--muted)" }}>
            {y}
          </Link>
        ),
      )}
    </nav>
  );
}
