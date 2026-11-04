import { cn } from "@/lib/cn";
import { utilisation, type Sen } from "@/lib/money";

interface Props {
  revised: Sen;
  actual: Sen;
}

/** Share of the budget spent: a square bar and the percentage, in the over-budget colour past 100%. */
export default function UtilBar({ revised, actual }: Props) {
  const pct = utilisation(revised, actual);
  const over = actual > revised;
  return (
    <div className="flex items-center gap-2 min-w-[96px]">
      <div className="flex-1 min-w-12 h-2 bg-linen-200">
        <div
          className={cn("h-full", over ? "bg-auburn-700" : "bg-foreground")}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={cn("tabular-nums text-xs w-12 text-right", over ? "over-budget" : "text-charcoal-700")}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}
