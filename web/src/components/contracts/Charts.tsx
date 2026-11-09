// The figures on the contract, company and method pages, drawn on the server: no script, readable by screen readers
// through their labels, and coloured with the brand tokens so they follow the theme.
import { kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";
import { percent } from "@/lib/contract-checks";
import { formatSen, formatSenCompact, parseSen, type Sen } from "@/lib/money";

const DECADES = [
  "RM 1",
  "RM 10",
  "RM 100",
  "RM 1k",
  "RM 10k",
  "RM 100k",
  "RM 1m",
  "RM 10m",
  "RM 100m",
  "RM 1bn",
  "RM 10bn",
];

/** Contracts by value on a log scale, four bins a decade, with this contract marked. */
export function ValueHistogram({
  bins,
  value,
  label,
}: {
  bins: [number, number][]; // [floor(log10(ringgit) * 4), contracts]
  value: Sen | null;
  label: string;
}) {
  if (bins.length === 0) return null;
  const at = value !== null && value > 0 ? Math.log10(value / 100) * 4 : null;
  const lo = Math.min(12, ...bins.map(([b]) => b), at !== null ? Math.floor(at) : 99);
  const hi = Math.max(32, ...bins.map(([b]) => b + 1), at !== null ? Math.ceil(at) : 0);
  const max = Math.max(...bins.map(([, n]) => n));
  const W = 720;
  const H = 150;
  const x = (b: number) => ((b - lo) / (hi - lo)) * W;
  const bw = W / (hi - lo);
  const mine = at !== null ? Math.floor(at) : null;
  return (
    <figure className="m-0">
      {/* Never under 3/4 scale, so the labels stay legible; a phone scrolls the figure sideways instead. */}
      <div data-scroll-x className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H + 34}`}
          className="w-full"
          style={{ minWidth: W * 0.75 }}
          role="img"
          aria-label={label}
        >
          <line x1={0} x2={W} y1={H} y2={H} className="stroke-foreground" strokeWidth={2} />
          {bins.map(([b, n]) => {
            const h = Math.max(2, (n / max) * (H - 28));
            return (
              <rect
                key={b}
                x={x(b) + 1}
                y={H - h}
                width={bw - 2}
                height={h}
                className={b === mine ? "fill-merah-600" : "fill-biru-800/25"}
              >
                <title>{`${n.toLocaleString("en-MY")} contracts`}</title>
              </rect>
            );
          })}
          {at !== null && (
            <g>
              <line
                x1={x(at)}
                x2={x(at)}
                y1={8}
                y2={H}
                className="stroke-merah-600"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
              <text
                x={Math.min(Math.max(x(at), 60), W - 60)}
                y={4}
                textAnchor="middle"
                dominantBaseline="hanging"
                fontSize="13"
                fontWeight="600"
                className="fill-merah-600"
              >
                This contract
              </text>
            </g>
          )}
          {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
            .filter((b) => b % 4 === 0)
            .map((b) => (
              <g key={b}>
                <line x1={x(b)} x2={x(b)} y1={H} y2={H + 6} className="stroke-foreground" strokeWidth={1.5} />
                <text x={x(b)} y={H + 22} textAnchor="middle" fontSize="12" className="fill-charcoal-700">
                  {DECADES[b / 4] ?? ""}
                </text>
              </g>
            ))}
        </svg>
      </div>
      <figcaption className="mt-2 text-sm text-charcoal-700">
        {label}. Each step on the scale is ten times the last.
      </figcaption>
    </figure>
  );
}

export interface LimitSegment {
  key: string;
  value: Sen;
  label: string;
  href?: string;
  current?: boolean;
}

/** Quotations laid end to end against the tender limit, with the band just under it shaded. */
export function LimitBar({ limit, segments, label }: { limit: Sen; segments: LimitSegment[]; label: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const max = Math.max(limit * 1.2, total * 1.05);
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <figure className="m-0" aria-label={label}>
      <div className="relative pt-9">
        <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: pct(limit) }} aria-hidden="true">
          <span className={cn(kicker, "block whitespace-nowrap text-foreground")}>Tender limit</span>
          <span className="block font-mono text-xs tabular-nums text-charcoal-700">{formatSenCompact(limit)}</span>
        </div>
        <div className="relative h-12 border-2 border-foreground bg-linen-200">
          <div
            className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--color-copper-300)_0_6px,transparent_6px_12px)]"
            style={{ left: pct(limit * 0.95), width: pct(limit * 0.05) }}
            title="Within 5% under the limit"
          />
          <div className="absolute inset-y-0 left-0 flex" style={{ width: pct(total) }}>
            {segments.map((s, i) => (
              <div
                key={s.key}
                className={cn(
                  "h-full border-r-2 border-background last:border-r-0",
                  s.current ? "bg-merah-600" : i % 2 ? "bg-biru-800/70" : "bg-biru-800",
                )}
                style={{ width: `${(s.value / Math.max(1, total)) * 100}%` }}
                title={`${s.label}: ${formatSen(s.value)}`}
              />
            ))}
          </div>
          <div className="absolute -inset-y-2 w-[3px] -translate-x-1/2 bg-foreground" style={{ left: pct(limit) }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-xs tabular-nums text-charcoal-700" aria-hidden="true">
          <span>RM 0</span>
          <span>{formatSenCompact(parseSen(Math.round(max)))}</span>
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-charcoal-700">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-merah-600" /> This contract,{" "}
          {formatSen(segments.find((s) => s.current)?.value ?? parseSen(0))}
        </span>
        {segments.length > 1 && (
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 bg-biru-800" /> Others nearby: together {formatSen(parseSen(total))}
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-[repeating-linear-gradient(135deg,var(--color-copper-300)_0_3px,transparent_3px_6px)] border border-foreground/30" />
          Within 5% under the limit
        </span>
      </figcaption>
    </figure>
  );
}

export interface MarketSlice {
  key: string;
  name: string;
  value: Sen;
  contracts: number;
  href?: string | null;
  lead?: boolean;
}

/** A buyer's market as one bar, each company's share of the value it awarded, the winner marked. */
export function MarketBar({ slices, total, label }: { slices: MarketSlice[]; total: Sen; label: string }) {
  if (total <= 0) return null;
  const shown = slices.reduce((s, x) => s + x.value, 0);
  const rest = Math.max(0, total - shown);
  const tones = [
    "bg-biru-800",
    "bg-biru-800/75",
    "bg-biru-800/55",
    "bg-biru-800/40",
    "bg-biru-800/30",
    "bg-biru-800/20",
  ];
  let tone = 0;
  const colored = slices.map((s) => ({
    ...s,
    tone: s.lead ? "bg-merah-600" : tones[Math.min(tone++, tones.length - 1)],
  }));
  return (
    <figure className="m-0">
      <div className="flex h-12 border-2 border-foreground bg-linen-200" role="img" aria-label={label}>
        {colored.map((s) => (
          <div
            key={s.key}
            className={cn("h-full border-r-2 border-background", s.tone)}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.name}: ${percent(s.value / total)}`}
          />
        ))}
      </div>
      <ol role="list" className="m-0 mt-4 grid list-none gap-x-8 gap-y-2 p-0 text-sm md:grid-cols-2">
        {colored.map((s) => (
          <li key={s.key} className="flex items-baseline gap-3">
            <span className={cn("inline-block h-3 w-3 shrink-0 translate-y-0.5", s.tone)} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {s.href ? (
                <a href={s.href} className={cn("text-foreground", s.lead && "font-semibold")}>
                  {s.name}
                </a>
              ) : (
                s.name
              )}
              <span className="text-charcoal-700">
                {" "}
                · {s.contracts.toLocaleString("en-MY")} {s.contracts === 1 ? "contract" : "contracts"}
              </span>
            </span>
            <span className="font-mono tabular-nums">{percent(s.value / total)}</span>
          </li>
        ))}
        {rest > 0 && (
          <li className="flex items-baseline gap-3 text-charcoal-700">
            <span className="inline-block h-3 w-3 shrink-0 translate-y-0.5 bg-linen-200 border border-foreground/30" />
            <span className="flex-1">Every other company</span>
            <span className="font-mono tabular-nums">{percent(rest / total)}</span>
          </li>
        )}
      </ol>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

/** Quotations by price as a share of the tender limit in force: the cliff at 100% is the limit at work. */
export function BunchingChart({ bins }: { bins: { bin: number; count: number }[] }) {
  const lo = 60; // per cent of the limit, one bin a point
  const hi = 120;
  const series = Array.from({ length: hi - lo }, (_, i) => ({
    bin: lo + i,
    count: bins.find((b) => b.bin === lo + i)?.count ?? 0,
  }));
  const max = Math.max(1, ...series.map((s) => s.count));
  const W = 720;
  const H = 240;
  const bw = W / series.length;
  const x = (bin: number) => (bin - lo) * bw;
  return (
    <figure className="m-0">
      <div data-scroll-x className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H + 40}`}
          className="w-full"
          style={{ minWidth: W * 0.75 }}
          role="img"
          aria-label="Quotations by price as a share of the tender limit, from 60% to 120%"
        >
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={0} x2={W} y1={H - f * (H - 30)} y2={H - f * (H - 30)} className="stroke-foreground/10" />
              <text x={4} y={H - f * (H - 30) - 4} fontSize="11" className="fill-charcoal-600">
                {Math.round(f * max).toLocaleString("en-MY")}
              </text>
            </g>
          ))}
          {series.map((s) => {
            const h = (s.count / max) * (H - 30);
            const near = s.bin >= 95 && s.bin < 100;
            return (
              <rect
                key={s.bin}
                x={x(s.bin) + 1.5}
                y={H - h}
                width={bw - 3}
                height={h}
                className={near ? "fill-merah-600" : s.bin >= 100 ? "fill-charcoal-400" : "fill-biru-800/45"}
              >
                <title>{`Over ${s.bin}% and up to ${s.bin + 1}% of the limit: ${s.count.toLocaleString("en-MY")} quotations`}</title>
              </rect>
            );
          })}
          <line x1={x(100)} x2={x(100)} y1={14} y2={H} className="stroke-foreground" strokeWidth={3} />
          <text x={x(100) + 8} y={22} fontSize="13" fontWeight="600" className="fill-foreground">
            Tender limit
          </text>
          <line x1={0} x2={W} y1={H} y2={H} className="stroke-foreground" strokeWidth={2} />
          {[60, 70, 80, 90, 100, 110, 120].map((b) => (
            <text key={b} x={x(b)} y={H + 22} textAnchor="middle" fontSize="12" className="fill-charcoal-700">
              {b}%
            </text>
          ))}
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm text-charcoal-700">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-merah-600" /> Within 5% under the limit
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 bg-charcoal-400" /> Over the limit
        </span>
      </figcaption>
    </figure>
  );
}
