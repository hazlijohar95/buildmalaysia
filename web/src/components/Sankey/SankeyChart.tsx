// Revenue -> spending Sankey, adapted from Build Canada's CanadaSpends (MIT). Changes: ringgit
// formatting, links to Build Malaysia pages carried on the nodes, and a native search box.
import { hierarchy } from "d3-hierarchy";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./SankeyChart.css";
import type { SankeyData, SankeyHoverNode, SankeyNode } from "./SankeyChartD3";
import { SankeyChartSingle } from "./SankeyChartSingle";
import { formatNumber, sortNodesByAmount } from "./utils";
import { colours } from "@/styles/colours";

type Side = "revenue" | "spending";

type FlatNode = SankeyNode & { parent?: string; value: number; type: Side };

type HoverNode = SankeyHoverNode & { percent: number; overallPercent?: number };

const chartHeight = 940;

const chartConfig = {
  revenue: {
    id: "revenue-chart-root",
    colors: { primary: colours.lake[700] },
    direction: "right-to-left",
    differenceLabel: "Gap",
  },
  spending: {
    id: "spending-chart-root",
    colors: { primary: colours.merah["600"] },
    direction: "left-to-right",
    differenceLabel: "Surplus",
  },
} as const;

function flatten(data: SankeyData): FlatNode[] {
  const nodes: FlatNode[] = [];
  for (const type of ["revenue", "spending"] as const) {
    const root = hierarchy(type === "revenue" ? data.revenue_data : data.spending_data).sum((d) => d.amount ?? 0);
    for (const d of root.descendants()) {
      nodes.push({ ...d.data, parent: d.parent?.data.id, value: d.value ?? 0, type });
    }
  }
  return nodes.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function clone(node: SankeyNode): SankeyNode {
  return { ...node, children: node.children?.map(clone) };
}

export type SankeyChartProps = {
  data: SankeyData;
  /** Amounts are in units of this many ringgit (1e9 for billions). */
  amountScalingFactor?: number;
};

export function SankeyChart({ data, amountScalingFactor = 1e9 }: SankeyChartProps) {
  const flat = useMemo(() => flatten(data), [data]);
  const revenue = useMemo(() => sortNodesByAmount(clone(data.revenue_data)), [data]);
  const spending = useMemo(() => sortNodesByAmount(clone(data.spending_data)), [data]);
  const totalAmount = Math.max(data.revenue, data.spending);

  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<FlatNode | null>(null);
  const [hover, setHover] = useState<HoverNode | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    },
    [],
  );

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const byId = useMemo(() => new Map(flat.map((n) => [`${n.type}:${n.id}`, n])), [flat]);
  const parentOf = (n: FlatNode) => (n.parent ? byId.get(`${n.type}:${n.parent}`) : undefined);

  // Case-insensitive substring search over printed and short names, largest first, one row per name
  // and parent so the 30-odd "Dasar Baru" programmes read as "Dasar Baru, in Pertahanan".
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Set<string>();
    const out: { node: FlatNode; context: string }[] = [];
    for (const n of [...flat].sort((a, b) => b.value - a.value)) {
      if (!`${n.displayName} ${n.searchName ?? ""}`.toLowerCase().includes(q)) continue;
      // Skip the "Other (n)" blocks the chart groups small items into: they say nothing about where an item sits.
      let parent = n.parent ? byId.get(`${n.type}:${n.parent}`) : undefined;
      while (parent?.id.endsWith("-other")) parent = byId.get(`${parent.type}:${parent.parent}`);
      const context = parent
        ? (parent.searchName ?? parent.displayName)
        : n.type === "revenue"
          ? "Revenue"
          : "Spending";
      const key = `${n.searchName ?? n.displayName}|${context}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ node: n, context });
      if (out.length === 8) break;
    }
    return out;
  }, [query, flat, byId]);

  const choose = (n: FlatNode) => {
    setQuery(n.searchName ?? n.displayName);
    setOpen(false);
    // A leaf shows within its parent, as in CanadaSpends.
    setFocus(n.children ? n : (parentOf(n) ?? null));
  };
  const clear = () => {
    setQuery("");
    setFocus(null);
    setOpen(false);
  };

  const onMouseOver = useCallback(
    (total: number, overall?: number) => (node: SankeyHoverNode, event?: MouseEvent) => {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
      const value = node.realValue ?? 0;
      setHover({
        ...node,
        percent: (value / total) * 100,
        overallPercent: overall ? (value / overall) * 100 : undefined,
      });
      if (event) setMouse({ x: event.clientX, y: event.clientY });
    },
    [],
  );

  const onMouseOut = useCallback(() => {
    hideTimeout.current = setTimeout(() => {
      setHover(null);
      setMouse(null);
    }, 100);
  }, []);

  const tooltipLeft = (hover?.blockRect ? hover.blockRect.right : (mouse?.x ?? 0)) + 10;
  const tooltipTop = hover?.blockRect ? Math.max(10, hover.blockRect.top - 40) : (mouse?.y ?? 0) + 10;

  return (
    <div className="sankey-chart-wrapper">
      <div className="sankey-chart-header">
        <div className="search-container relative">
          <input
            role="combobox"
            aria-expanded={open && query.trim().length >= 2}
            aria-controls="sankey-search-results"
            aria-activedescendant={open && results[active] ? `sankey-result-${active}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                choose(results[active].node);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Search a ministry, tax or programme"
            className="w-full border-2 border-charcoal-300 bg-charcoal-1000 px-3 py-2 text-base sm:text-sm text-linen-100 placeholder:text-charcoal-300"
            aria-label="Search the chart"
          />
          {open && query.trim().length >= 2 && (
            <ul
              id="sankey-search-results"
              role="listbox"
              className="absolute right-0 z-20 mt-1 w-full max-w-md border-2 border-charcoal-300 bg-charcoal-1000 text-linen-100"
            >
              {results.length === 0 && (
                <li className="px-3 py-2 text-sm text-charcoal-300">No matches for “{query}”</li>
              )}
              {results.map(({ node, context }, i) => (
                <li
                  key={`${node.type}-${node.id}`}
                  id={`sankey-result-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(node);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer justify-between gap-3 px-3 py-2 text-sm ${i === active ? "bg-linen-100 text-foreground" : ""}`}
                >
                  <span className="min-w-0">
                    <span
                      className="line-clamp-2 font-medium [overflow-wrap:anywhere]"
                      title={node.searchName ?? node.displayName}
                    >
                      {node.searchName ?? node.displayName}
                    </span>
                    <span
                      className={`line-clamp-2 text-xs [overflow-wrap:anywhere] ${i === active ? "text-charcoal-700" : "text-charcoal-300"}`}
                      title={context}
                    >
                      in {context}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatNumber(node.value, amountScalingFactor)}</span>
                </li>
              ))}
            </ul>
          )}
          {focus && (
            <button type="button" className="mt-2 text-sm text-linen-100 underline" onClick={clear}>
              Show the whole chart
            </button>
          )}
        </div>
      </div>

      <div className="sankey-chart-content">
        {hover && (
          <div
            className="node-tooltip"
            onMouseEnter={() => {
              if (hideTimeout.current) clearTimeout(hideTimeout.current);
              hideTimeout.current = null;
            }}
            onMouseLeave={onMouseOut}
            style={{ left: `${Math.min(tooltipLeft, window.innerWidth - 340)}px`, top: `${tooltipTop}px` }}
          >
            <p className="node-tooltip-name">{hover.displayName}</p>
            <div className="node-tooltip-amount">
              <span>{formatNumber(hover.realValue ?? 0, amountScalingFactor)}</span>
              <span className="node-tooltip-amount-divider">&#8226;</span>
              <div className="node-tooltip-percentage">
                <span>{hover.percent.toFixed(1)}%</span>
                {hover.overallPercent !== undefined && (
                  <div className="node-tooltip-overall">{hover.overallPercent.toFixed(1)}% of total</div>
                )}
              </div>
            </div>
            {hover.link && (
              <div className="node-tooltip-department">
                <a href={hover.link} className="node-tooltip-link">
                  Learn more
                </a>
              </div>
            )}
          </div>
        )}

        {!focus && (
          <div className="charts">
            <SankeyChartSingle
              {...chartConfig.revenue}
              data={revenue}
              totalAmount={totalAmount}
              difference={data.spending > data.revenue ? data.spending - data.revenue : 0}
              height={chartHeight}
              amountScalingFactor={amountScalingFactor}
              onMouseOver={onMouseOver(data.revenue)}
              onMouseOut={onMouseOut}
            />
            <SankeyChartSingle
              {...chartConfig.spending}
              data={spending}
              totalAmount={totalAmount}
              difference={data.revenue > data.spending ? data.revenue - data.spending : 0}
              height={chartHeight}
              amountScalingFactor={amountScalingFactor}
              onMouseOver={onMouseOver(data.spending)}
              onMouseOut={onMouseOut}
            />
          </div>
        )}

        {focus && (
          <div className="chart search-results">
            <SankeyChartSingle
              key={`${focus.type}-${focus.id}`}
              id="search-results-root"
              data={focus}
              colors={chartConfig[focus.type].colors}
              direction={chartConfig[focus.type].direction}
              totalAmount={focus.value}
              height={chartHeight}
              amountScalingFactor={amountScalingFactor}
              difference={0}
              differenceLabel=""
              onMouseOver={onMouseOver(focus.value, focus.type === "revenue" ? data.revenue : data.spending)}
              onMouseOut={onMouseOut}
            />
          </div>
        )}
      </div>
    </div>
  );
}
