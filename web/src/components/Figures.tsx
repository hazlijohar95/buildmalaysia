// Small pieces the spending and budget data pages share: readable money, glossary links and breadcrumbs.
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { TermId } from "@/lib/glossary";
import { formatSen, formatSenCompact, type Sen } from "@/lib/money";

/** Whole ringgit, as the budget books print them: "RM 2,000,000,000". A figure with sen keeps them. */
export function formatRinggit(sen: Sen): string {
  return sen % 100 === 0 ? formatSen(sen).replace(/\.00$/, "") : formatSen(sen);
}

/** A compact figure ("RM 1.14 bn") and the exact one for its title; small figures are shown exactly. */
export function money(sen: Sen, whole = false): { value: string; title?: string } {
  const exact = whole ? formatRinggit(sen) : formatSen(sen);
  if (Math.abs(sen) < 100_000_000) return { value: exact };
  return { value: formatSenCompact(sen), title: exact };
}

/**
 * A compact figure with the exact one on hover; screen readers hear only the exact one. `whole` for budget-book
 * figures, printed in whole ringgit.
 */
export function Money({ sen, whole = false, className }: { sen: Sen; whole?: boolean; className?: string }) {
  const { value, title } = money(sen, whole);
  return (
    // relative anchors the screen-reader copy here, so inside a scrolling table it cannot widen the page.
    <span title={title} className={cn("relative tabular-nums whitespace-nowrap", className)}>
      {title ? (
        <>
          <span aria-hidden="true">{value}</span>
          <span className="sr-only">{title}</span>
        </>
      ) : (
        value
      )}
    </span>
  );
}

/** A term's first use on a page, linked to its definition in the methodology glossary. */
export function Term({ id, children }: { id: TermId; children: React.ReactNode }) {
  return (
    <Link
      href={`/methodology#${id}`}
      className="text-inherit underline decoration-dotted decoration-1 underline-offset-[0.18em] hover:decoration-solid"
    >
      {children}
    </Link>
  );
}

export interface Crumb {
  label: React.ReactNode;
  href?: string;
  lang?: string;
}

/** A breadcrumb trail for a page header's eyebrow; the last crumb is the current page. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap gap-x-2 gap-y-1 m-0 p-0 list-none">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} lang={c.lang} className="flex gap-x-2">
              {c.href && !last ? (
                <Link href={c.href} className="text-charcoal-700 no-underline hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="text-foreground">
                  {c.label}
                </span>
              )}
              {!last && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** "+4.2%", or "–" when there is nothing to compare with. */
export function change(now: number, before: number): string {
  if (before <= 0) return "–";
  const pct = ((now - before) / before) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
