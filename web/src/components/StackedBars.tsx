import { formatSenCompact, parseSen } from "@/lib/money";

export interface Series {
  label: string;
  color: string;
}

/** Stacked bars per year, bottom series first, with the year's total above (server-rendered SVG). */
export default function StackedBars({
  rows,
  series,
  label,
}: {
  rows: { year: number; values: number[]; title?: string }[]; // values in sen, one per series
  series: Series[];
  label: string;
}) {
  const totals = rows.map((r) => r.values.reduce((s, v) => s + v, 0));
  const max = Math.max(1, ...totals);
  const barWidth = 64;
  const gap = 40;
  const height = 220;
  const width = rows.length * (barWidth + gap);
  const scale = (v: number) => (v / max) * (height - 40);
  return (
    <figure className="overflow-x-auto m-0">
      {/* Never narrower than 3/4 scale, so the 12-unit labels stay legible; a narrow screen scrolls the figure. */}
      <svg
        viewBox={`0 0 ${width} ${height + 40}`}
        className="w-full max-w-3xl"
        style={{ minWidth: width * 0.75 }}
        role="img"
        aria-label={label}
      >
        {rows.map((r, i) => {
          const x = i * (barWidth + gap) + gap / 2;
          const tops = r.values.map((_, s) => height - scale(r.values.slice(0, s + 1).reduce((a, v) => a + v, 0)));
          return (
            <g key={r.year}>
              <title>{r.title ?? `${r.year}: ${formatSenCompact(parseSen(totals[i]))}`}</title>
              {r.values.map((v, s) => (
                <rect
                  key={series[s].label}
                  x={x}
                  y={tops[s]}
                  width={barWidth}
                  height={scale(v)}
                  fill={series[s].color}
                  stroke="var(--color-background)"
                  strokeWidth={1.5}
                >
                  <title>{`${series[s].label}, ${r.year}: ${formatSenCompact(parseSen(v))}`}</title>
                </rect>
              ))}
              <text
                x={x + barWidth / 2}
                y={(tops.at(-1) ?? height) - 8}
                textAnchor="middle"
                fontSize="12"
                fill="currentColor"
              >
                {formatSenCompact(parseSen(totals[i]))}
              </text>
              <text x={x + barWidth / 2} y={height + 20} textAnchor="middle" fontSize="13" fill="currentColor">
                {r.year}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-charcoal-700">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
