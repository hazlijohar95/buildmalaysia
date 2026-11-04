import Link from "next/link";

/** Links to the same page in every loaded year; `suffix` is the path after the year. */
export default function YearNav({ year, years, suffix = "" }: { year: number; years: number[]; suffix?: string }) {
  return (
    <nav className="flex flex-wrap gap-3 text-xs mb-4" aria-label="Fiscal year">
      {[...years].sort().map((y) =>
        y === year ? (
          <span key={y} className="font-semibold" aria-current="page">
            {y}
          </span>
        ) : (
          <Link key={y} href={`/${y}${suffix}`} style={{ color: "var(--muted)" }}>
            {y}
          </Link>
        ),
      )}
    </nav>
  );
}
