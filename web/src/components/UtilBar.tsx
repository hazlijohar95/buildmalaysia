import { utilisation, type Sen } from "@/lib/money";

interface Props {
  revised: Sen;
  actual: Sen;
}

export default function UtilBar({ revised, actual }: Props) {
  const pct = utilisation(revised, actual);
  const clamped = Math.min(pct, 100);
  const over = actual > revised;

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--border)", minWidth: 48 }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            background: over ? "var(--over)" : "var(--accent)",
          }}
        />
      </div>
      <span
        className="tabnum text-xs"
        style={{ color: over ? "var(--over)" : "var(--muted)", minWidth: 40, textAlign: "right" }}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}
