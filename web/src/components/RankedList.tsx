import { useId } from "react";
import { cn } from "@/lib/cn";
import { kicker } from "@/components/Boxed";
import { formatSen, formatSenCompact, type Sen } from "@/lib/money";

export interface RankedItem {
  key: string;
  name: string;
  href?: string | null;
  amount_sen: Sen;
  note?: string | null; // a gloss or share shown under the name
}

/** Rows a phone shows before "Show all" (global.css hides the rest below lg). */
const SHOWN_ON_PHONE = 8;

/**
 * A ranked list with a bar per row, scaled to the largest; amounts compact with the exact figure on hover, and only
 * the exact figure for screen readers.
 */
export default function RankedList({ items, className }: { items: RankedItem[]; className?: string }) {
  const max = Math.max(1, ...items.map((i) => i.amount_sen));
  const id = useId();
  const collapsible = items.length > SHOWN_ON_PHONE;
  return (
    <>
      <ol
        id={id}
        data-collapse={collapsible ? "" : undefined}
        className={cn("m-0 p-0 list-none border-t-2 border-foreground", className)}
      >
        {items.map((item, i) => (
          <li
            key={item.key}
            className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] md:grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1fr)_7.5rem] items-center gap-x-4 gap-y-2 py-3.5 border-b border-foreground/15"
          >
            <span className={cn(kicker, "text-charcoal-600")}>{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              {item.href ? (
                <a href={item.href} lang="ms" className="font-medium text-foreground no-underline hover:underline">
                  {item.name}
                </a>
              ) : (
                <span lang="ms" className="font-medium">
                  {item.name}
                </span>
              )}
              {item.note && <span className="block text-sm text-charcoal-700">{item.note}</span>}
              {/* Below md the bar column is gone, so each row carries a thin bar under its name instead. */}
              <span className="mt-2 block h-1 bg-linen-200 md:hidden" aria-hidden>
                <span className="block h-full bg-merah-600" style={{ width: `${(item.amount_sen / max) * 100}%` }} />
              </span>
            </span>
            <span className="hidden md:block h-2.5 bg-linen-200" aria-hidden>
              <span className="block h-full bg-merah-600" style={{ width: `${(item.amount_sen / max) * 100}%` }} />
            </span>
            <span
              className="relative text-right font-display text-lg font-semibold tabular-nums"
              title={formatSen(item.amount_sen)}
            >
              <span aria-hidden="true">{formatSenCompact(item.amount_sen)}</span>
              <span className="sr-only">{formatSen(item.amount_sen)}</span>
            </span>
          </li>
        ))}
      </ol>
      {collapsible && (
        <button
          type="button"
          data-collapse-toggle
          data-label={`Show all ${items.length}`}
          aria-controls={id}
          aria-expanded="false"
          className={cn(kicker, "tap mt-6 min-h-12 items-center border-2 border-foreground px-6")}
        >
          Show all {items.length}
        </button>
      )}
    </>
  );
}
