// The boxed page language every page shares: full-width bands ruled off by the frame, a page header
// with a mono kicker, and a row of square stat boxes.
import { cn } from "@/lib/cn";

export const kicker = "font-mono text-[0.75rem] uppercase tracking-[0.22em]";

/** A full-width band of the page, ruled off below, with its content centred. */
export function Band({
  children,
  className,
  wide = false,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  wide?: boolean; // data tables get the wider measure
  id?: string;
}) {
  return (
    <section id={id} className={cn("border-b-2 border-foreground px-5 py-12 sm:px-8 md:px-16 md:py-16", className)}>
      <div className={cn("mx-auto", wide ? "max-w-7xl" : "max-w-6xl")}>{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  intro,
  children,
  wide,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children?: React.ReactNode; // year tabs, breadcrumbs
  wide?: boolean;
}) {
  return (
    <Band wide={wide}>
      <div className={cn(kicker, "text-charcoal-700")}>{eyebrow}</div>
      <h1 className="mt-4 m-0 font-display text-4xl md:text-6xl font-semibold tracking-tight">{title}</h1>
      {intro && <div className="mt-4 max-w-3xl text-lg text-charcoal-800 [&_p+p]:mt-3">{intro}</div>}
      {children && <div className="mt-8">{children}</div>}
    </Band>
  );
}

/** A full-width note band: a caveat about the figures below it, such as a missing page or an OCR reading. */
export function NoteBand({
  title,
  tone,
  children,
}: {
  title: React.ReactNode;
  tone: "copper" | "linen";
  children: React.ReactNode;
}) {
  return (
    <section
      role="note"
      className={cn(
        "border-b-2 border-foreground px-5 py-6 sm:px-8 md:px-16",
        tone === "copper" ? "bg-copper-100" : "bg-linen-200",
      )}
    >
      <div className="mx-auto max-w-7xl">
        <p className="m-0 font-semibold">{title}</p>
        <p className="m-0 mt-2 max-w-4xl text-charcoal-800">{children}</p>
      </div>
    </section>
  );
}

export function H2({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("m-0 font-display text-3xl md:text-4xl font-semibold tracking-tight", className)}>{children}</h2>
  );
}

export interface Stat {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  title?: string; // the exact figure, shown under a compact value
}

/** Square stat boxes ruled by a 2px gap: two to a row below lg, all in one row from lg. */
export function StatRow({ stats }: { stats: Stat[] }) {
  const cols = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }[
    Math.min(stats.length, 4)
  ];
  return (
    <section className={cn("border-b-2 border-foreground bg-foreground grid grid-cols-2 gap-[2px]", cols)}>
      {stats.map((s, i) => (
        <div
          key={i}
          className="@container min-w-0 bg-background px-5 py-8 sm:px-8 md:py-10 [&:last-child:nth-child(odd)]:col-span-2 lg:[&:last-child:nth-child(odd)]:col-span-1"
        >
          <div className={cn(kicker, "text-charcoal-700")}>{s.label}</div>
          <div
            // Sized to the cell (14% of its width, capped at 3rem) so a long figure like RM 52,623.62 never spills out.
            className="mt-3 font-display text-[min(3rem,14cqi)] leading-tight font-semibold tracking-tight tabular-nums whitespace-nowrap"
          >
            {s.value}
          </div>
          {s.title && (
            // A long figure may break after any thousands comma rather than spill out of a narrow cell.
            <div className="mt-1 font-mono text-xs tabular-nums text-charcoal-600 [overflow-wrap:anywhere]">
              {s.title.split(",").flatMap((part, i) => (i === 0 ? [part] : [",", <wbr key={i} />, part]))}
            </div>
          )}
          {s.sub && <div className="mt-1 text-sm text-charcoal-700">{s.sub}</div>}
        </div>
      ))}
    </section>
  );
}

/** An English column or field label with the Bahasa Malaysia term the document prints beneath it. */
export function BiLabel({ en, ms }: { en: string; ms: string }) {
  return (
    <span>
      {en}
      <span lang="ms" className="block text-xs font-normal normal-case tracking-normal text-charcoal-600">
        {ms}
      </span>
    </span>
  );
}
