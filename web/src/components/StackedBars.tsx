import { formatSenCompact, parseSen } from "@/lib/money";

export interface Series {
  label: string;
  color: string;
}

const money = (v: number) => formatSenCompact(parseSen(v));

/**
 * Stacked bars per year, bottom series first, with the year's total above (server-rendered SVG). Values are sen
 * unless `format` says otherwise; a negative value hangs below the zero line.
 */
export default function StackedBars({
  rows,
  series,
  label,
  format = money,
}: {
  rows: { year: number; values: number[]; title?: string }[]; // one value per series
  series: Series[];
  label: string;
  format?: (value: number) => string;
}) {
  const totals = rows.map((r) => r.values.reduce((s, v) => s + v, 0));
  const up = rows.map((r) => r.values.reduce((s, v) => s + Math.max(0, v), 0));
  const down = rows.map((r) => r.values.reduce((s, v) => s + Math.min(0, v), 0));
  const max = Math.max(0, ...up);
  const min = Math.min(0, ...down);
  const barWidth = 64;
  const gap = 40;
  const height = 220;
  const width = rows.length * (barWidth + gap);
  // Room above the tallest bar for its label, and below the deepest one when any value is negative.
  const top = 40;
  const bottom = min < 0 ? height - 20 : height;
  const span = Math.max(1e-9, max - min);
  const scale = (v: number) => (v / span) * (bottom - top);
  const zero = top + scale(max);
  return (
    <figure data-scroll-x className="overflow-x-auto m-0">
      {/* Never narrower than 3/4 scale, so the 12-unit labels stay legible; a narrow screen scrolls the figure. */}
      <svg
        viewBox={`0 0 ${width} ${height + 40}`}
        className="w-full max-w-3xl"
        style={{ minWidth: width * 0.75 }}
        role="img"
        aria-label={label}
      >
        {min < 0 && <line x1={0} x2={width} y1={zero} y2={zero} stroke="currentColor" strokeWidth={1} />}
        {rows.map((r, i) => {
          const x = i * (barWidth + gap) + gap / 2;
          let above = zero;
          let below = zero;
          const bars = r.values.map((v) => {
            const h = scale(Math.abs(v));
            if (v >= 0) {
              above -= h;
              return { y: above, h };
            }
            below += h;
            return { y: below - h, h };
          });
          const negative = totals[i] < 0;
          return (
            <g key={r.year}>
              <title>{r.title ?? `${r.year}: ${format(totals[i])}`}</title>
              {r.values.map((v, s) => (
                <rect
                  key={series[s].label}
                  x={x}
                  y={bars[s].y}
                  width={barWidth}
                  height={bars[s].h}
                  fill={series[s].color}
                  stroke="var(--color-background)"
                  strokeWidth={1.5}
                >
                  <title>{`${series[s].label}, ${r.year}: ${format(v)}`}</title>
                </rect>
              ))}
              <text
                x={x + barWidth / 2}
                y={negative ? below + 16 : above - 8}
                textAnchor="middle"
                fontSize="12"
                fill="currentColor"
              >
                {format(totals[i])}
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
