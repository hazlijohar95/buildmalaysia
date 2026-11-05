import { Logo } from "./Logo";
import { cn } from "@/lib/cn";

const SIZES = {
  // Under 24px the stripes blur, so the small loader is the icon with its star spinning.
  sm: { lockup: "icon", unit: 1.6, className: "h-[1.15em] w-[1.15em]" },
  md: { lockup: "flag", unit: 3, className: "" },
  lg: { lockup: "stacked", unit: 2, className: "" },
} as const;

export type LoaderSize = keyof typeof SIZES;

/**
 * The branded loader. `delayed` waits 300ms before showing, so a fast load shows nothing; use it for page and
 * section loads, not for a button the user just pressed. A small loader beside visible text ("Calculating") takes
 * no label, and hides from screen readers so the text is announced once.
 */
export function Loader({
  size = "md",
  label,
  delayed = false,
  className,
}: {
  size?: LoaderSize;
  label?: string;
  delayed?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  const text = label ?? (size === "sm" ? null : "Loading");
  return (
    <span
      {...(text === null ? { "aria-hidden": true } : { role: "status" })}
      data-size={size}
      data-delayed={delayed || undefined}
      className={cn(
        "carta-loader",
        size === "sm" ? "inline-flex align-[-0.2em]" : "inline-flex flex-col items-center gap-4",
        className,
      )}
    >
      <Logo lockup={s.lockup} unit={s.unit} decorative className={s.className} />
      {text !== null && (
        <span
          className={size === "sm" ? "sr-only" : "font-mono text-[11px] uppercase tracking-[0.14em] text-charcoal-700"}
        >
          {text}
        </span>
      )}
    </span>
  );
}
