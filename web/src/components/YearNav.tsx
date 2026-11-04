import Link from "next/link";
import { cn } from "@/lib/cn";
import { kicker } from "@/components/Boxed";

/** Boxed year tabs linking to the same page in every loaded year: `/<year><suffix>`, or `hrefFor(year)`. */
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
  const tab = cn(
    kicker,
    "inline-flex items-center min-h-11 px-4 border-2 border-foreground -ml-[2px] first:ml-0 no-underline",
  );
  return (
    <nav className="flex flex-wrap" aria-label="Year">
      {[...years]
        .sort((a, b) => a - b)
        .map((y) =>
          y === year ? (
            <span key={y} className={cn(tab, "bg-foreground text-background")} aria-current="page">
              {y}
            </span>
          ) : (
            <Link
              key={y}
              href={hrefFor ? hrefFor(y) : `/${y}${suffix}`}
              className={cn(tab, "text-foreground hover:bg-linen-200")}
            >
              {y}
            </Link>
          ),
        )}
    </nav>
  );
}
