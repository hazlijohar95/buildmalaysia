import { kicker } from "@/components/Boxed";
import { STAGES, type BillStage } from "@/lib/bills";
import { cn } from "@/lib/cn";

const TONE: Record<BillStage, string> = {
  dewan_rakyat: "bg-linen-200",
  committee: "bg-linen-200",
  passed_dewan_rakyat: "bg-linen-200",
  passed: "bg-copper-100",
  enacted: "bg-foreground text-background",
  withdrawn: "bg-background",
  defeated: "bg-background",
};

/** A bill's stage as a small boxed tag. */
export default function BillStageTag({ stage, long = false }: { stage: BillStage; long?: boolean }) {
  return (
    <span className={cn(kicker, "inline-block border-2 border-foreground px-2 py-0.5", TONE[stage])}>
      {long ? STAGES[stage].label : STAGES[stage].short}
    </span>
  );
}
