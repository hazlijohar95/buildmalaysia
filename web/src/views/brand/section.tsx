// The band each section of the sheet is drawn in, the contents and section bar that lead to them, and the small
// controls several sections share.
import { LuChevronDown, LuLink, LuPrinter, LuX } from "react-icons/lu";
import { Band, H2, kicker } from "@/components/Boxed";
import { Sheet } from "@/components/MainLayout/MobileNav";
import { cn } from "@/lib/cn";
import { SECTIONS, sectionNumber, type SectionId } from "./sections";

/**
 * The stroke that paints a Lucide icon's lines at 1.5px when it is drawn `px` wide: Lucide draws on a 24px grid,
 * and 1.5px matches the regular-weight labels the icons sit beside.
 */
export const iconStroke = (px: number) => (1.5 * 24) / px;

/** A boxed grid: cells ruled off by 2px of ink, the grid's own colour showing through the gaps. */
export const grid = "boxed-grid grid gap-[2px] border-2 border-foreground bg-foreground";
/** A caption under a figure or a grid. */
export const cap = "text-sm text-charcoal-700 max-w-xl";
/** A heading inside a section. */
export const h3 = "m-0 font-display text-xl font-semibold tracking-tight";

export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: SectionId;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  const label = SECTIONS.find((s) => s.id === id)?.label;
  return (
    <Band id={id}>
      <div className="flex items-center justify-between gap-4">
        <div className={cn(kicker, "text-charcoal-700")}>
          <span className="text-charcoal-600">{sectionNumber(id)}</span> {label}
        </div>
        <a
          href={`#${id}`}
          data-copy-link
          aria-label={`Link to ${label}`}
          title="Copy a link to this section"
          className="copy tap -my-3 -mr-3 grid size-11 place-items-center text-charcoal-600 no-underline hover:text-foreground"
        >
          <LuLink aria-hidden="true" className="size-4" strokeWidth={iconStroke(16)} />
        </a>
      </div>
      <H2 className="mt-3">{title}</H2>
      {intro && <div className={cn(cap, "mt-3 [&_p+p]:mt-2")}>{intro}</div>}
      {children}
    </Band>
  );
}

/** "On this page": every section, numbered, as a boxed grid of links. */
export function Contents() {
  return (
    <nav aria-label="On this page" data-brand-contents>
      <ol className={cn(grid, "m-0 list-none grid-cols-2 p-0 sm:grid-cols-3 lg:grid-cols-6")}>
        {SECTIONS.map((s) => (
          <li key={s.id} className="min-w-0 bg-linen-50">
            <a
              href={`#${s.id}`}
              className="group flex min-h-12 items-baseline gap-2 px-3 py-3 text-sm font-medium text-foreground no-underline hover:bg-white"
            >
              <span className="font-mono text-xs text-charcoal-600 tabular-nums">{sectionNumber(s.id)}</span>
              <span className="group-hover:underline">{s.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * A value that copies itself when pressed, with "Copied" shown beside it and announced. It stays selectable, so it
 * can be copied by hand without JavaScript or when the browser refuses.
 */
export function Copy({
  value,
  children,
  className,
}: {
  value: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" data-copy={value} title={`Copy ${value}`} className={cn("copy", className)}>
      {children ?? value}
    </button>
  );
}

/** Where the sheet's script announces a copy, for screen readers. */
export function Status() {
  return <div data-brand-status role="status" aria-live="polite" className="sr-only" />;
}

/** Saves the sheet as a PDF through the browser's print dialog. Shown once the page's script runs. */
export function PrintButton() {
  return (
    <button
      type="button"
      data-print
      hidden
      className={cn(
        kicker,
        "tap mt-4 inline-flex min-h-12 items-center gap-2.5 border-2 border-foreground pr-5 pl-[18px]",
      )}
    >
      <LuPrinter aria-hidden="true" className="size-4" strokeWidth={iconStroke(16)} />
      Print or save as PDF
    </button>
  );
}

/**
 * Below lg, a bar under the header names the section in view and opens every section in a sheet. It appears once
 * the contents grid has scrolled away.
 */
export function SectionBar() {
  return (
    <>
      <div data-brand-bar hidden className="brand-bar lg:hidden">
        <button
          type="button"
          data-sheet-open="brand-contents"
          className="tap flex min-h-12 w-full items-center justify-between gap-3 px-5 text-left"
        >
          <span className="flex items-baseline gap-2 text-sm font-medium">
            <span data-brand-bar-number className="font-mono text-xs text-charcoal-600 tabular-nums">
              {sectionNumber(SECTIONS[0].id)}
            </span>
            <span data-brand-bar-label>{SECTIONS[0].label}</span>
          </span>
          <span className={cn(kicker, "flex items-center gap-1 text-charcoal-700")}>
            Sections
            <LuChevronDown aria-hidden="true" className="size-4" strokeWidth={iconStroke(16)} />
          </span>
        </button>
      </div>
      <Sheet id="brand-contents" title="On this page">
        <ol className="m-0 list-none p-0">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="tap flex min-h-12 items-baseline gap-3 border-b border-foreground/15 px-5 py-3 text-foreground no-underline"
              >
                <span className="font-mono text-xs text-charcoal-600 tabular-nums">{sectionNumber(s.id)}</span>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  );
}

/** A small "Don't" stamp for the corner of a misuse drawing or a counter-example. */
/** `decorative` where the text beside it already says "Don't", so screen readers don't hear it twice. */
export function DontMark({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <span
      aria-hidden={decorative || undefined}
      className={cn(
        kicker,
        "inline-flex items-center gap-1.5 bg-foreground px-2 py-1 text-[0.75rem] tracking-[0.16em] text-background",
        className,
      )}
    >
      <LuX aria-hidden="true" className="size-3" strokeWidth={iconStroke(12)} />
      Don&apos;t
    </span>
  );
}
