import type { ReactNode } from "react";
import { kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";

/** A card inside a Carousel: most of a phone's width, so the next card peeks in and invites the swipe. */
export const carouselItem = "max-md:w-[85%] max-md:shrink-0 max-md:snap-start max-md:border-2 max-md:border-foreground";

/**
 * Cards in a grid from md, and below md a row that swipes sideways and snaps to each card, with its position
 * underneath (mobile.ts keeps the readout in step). `className` is the grid as it should look from md.
 */
export default function Carousel({
  count,
  className,
  children,
}: {
  count: number;
  className: string;
  children: ReactNode;
}) {
  return (
    <div data-carousel>
      <div
        data-carousel-track
        className={cn(
          className,
          "max-md:flex max-md:gap-3 max-md:overflow-x-auto max-md:snap-x max-md:snap-mandatory max-md:scroll-px-5 max-md:bg-background max-md:px-5 max-md:py-5 max-md:[scrollbar-width:none] max-md:overscroll-x-contain",
        )}
      >
        {children}
      </div>
      {count > 1 && (
        <div className="flex items-center justify-between gap-4 px-5 pb-5 md:hidden" aria-hidden="true">
          <span data-carousel-count className={cn(kicker, "text-charcoal-700")}>
            1 / {count}
          </span>
          <span className="flex gap-1.5">
            {Array.from({ length: count }, (_, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                data-carousel-dot
                className="h-2 w-2 bg-foreground/25 transition-[width,background-color] duration-200 aria-[current=true]:w-5 aria-[current=true]:bg-foreground"
              />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
