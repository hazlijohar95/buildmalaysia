import { Band, kicker } from "@/components/Boxed";
import { Loader } from "@/components/brand/Loader";
import { cn } from "@/lib/cn";

const bar = "skeleton-bar";

/**
 * The place a deferred part of a page holds while it loads (PageBody.astro): its first heading as the page will show
 * it, then the shapes of what follows, so nothing jumps when it arrives. Shown only while nothing follows it, and
 * only after 300ms, so a cached page never flashes it (global.css). Hidden from screen readers and the Markdown
 * form, as PageSkeleton is: the page's heading is already there, and the content follows within the same response.
 */
export default function SectionSkeleton({
  title,
  label,
  shape,
}: {
  title: string;
  label: string;
  /** Observation cards in two columns, or a row of stat boxes over a chart. */
  shape: "observations" | "record";
}) {
  return (
    <div className="section-skeleton" aria-hidden="true">
      {shape === "record" && (
        <div
          aria-hidden="true"
          className="grid grid-cols-2 gap-[2px] border-b-2 border-foreground bg-foreground lg:grid-cols-4"
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-background px-5 py-8 sm:px-8 md:py-10">
              <div className={cn(bar, "h-3 w-24")} />
              <div className={cn(bar, "mt-4 h-10 w-3/4")} />
            </div>
          ))}
        </div>
      )}
      <Band>
        <div>
          <p className="m-0 font-display text-3xl font-semibold tracking-tight text-charcoal-400 md:text-4xl">
            {title}
          </p>
          <div className="mt-4 max-w-3xl space-y-3">
            <div className={cn(bar, "h-4 w-full")} />
            <div className={cn(bar, "h-4 w-2/3")} />
          </div>
          <div className="mt-8 grid gap-10 lg:grid-cols-2">
            {[3, 4].map((cards, col) => (
              <div key={col}>
                <div className={cn(bar, "h-3 w-32")} />
                <div className="mt-4 grid gap-4">
                  {Array.from({ length: cards }, (_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "border-2 border-foreground/15 p-5 md:p-6",
                        col === 0 && shape === "observations" && "border-l-[10px] border-l-merah-600/30",
                      )}
                    >
                      <div className={cn(bar, "h-5 w-11/12")} />
                      <div className={cn(bar, "mt-3 h-4 w-2/3")} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={cn(kicker, "mt-10 flex justify-center text-charcoal-700")}>
          <Loader size="md" label={label} />
        </div>
      </Band>
    </div>
  );
}
