import { formatSenCompact, parseSen, type Sen } from "@/lib/money";
import { colours } from "@/styles/colours";

/** Stacked bars of operating and development spending per year (server-rendered SVG). */
export default function YearBars({
  rows,
}: {
  rows: { year: number; operating: Sen; development: Sen; name: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.operating + r.development));
  const barWidth = 64;
  const gap = 40;
  const height = 220;
  const width = rows.length * (barWidth + gap);
  const scale = (v: number) => (v / max) * (height - 40);
  return (
    <figure className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 40}`} className="w-full max-w-2xl" role="img" aria-label="Spending by year">
        {rows.map((r, i) => {
          const x = i * (barWidth + gap) + gap / 2;
          const op = scale(r.operating);
          const dev = scale(r.development);
          return (
            <g key={r.year}>
              <title>{`${r.year}: ${r.name}`}</title>
              <rect x={x} y={height - op} width={barWidth} height={op} fill={colours.auburn[800]} />
              <rect x={x} y={height - op - dev} width={barWidth} height={dev} fill={colours.lake[700]} />
              <text x={x + barWidth / 2} y={height - op - dev - 8} textAnchor="middle" fontSize="12" fill="currentColor">
                {formatSenCompact(parseSen(r.operating + r.development))}
              </text>
              <text x={x + barWidth / 2} y={height + 20} textAnchor="middle" fontSize="13" fill="currentColor">
                {r.year}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-6 text-sm text-gray-600">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3" style={{ background: colours.auburn[800] }} /> Operating
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3" style={{ background: colours.lake[700] }} /> Development
        </span>
      </figcaption>
    </figure>
  );
}
