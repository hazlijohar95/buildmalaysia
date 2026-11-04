"use client";

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

const chartHeight = 760;

const chartConfig = {
  revenue: {
    id: "revenue-chart-root",
    colors: { primary: colours.lake[700] },
    direction: "right-to-left",
    differenceLabel: "Shortfall",
  },
  spending: {
    id: "spending-chart-root",
    colors: { primary: colours.auburn[800] },
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

  useEffect(() => () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
  }, []);

  const search = (text: string) => {
    setQuery(text);
    const match = flat.find((n) => n.displayName === text);
    if (!match) return setFocus(null);
    // A leaf shows within its parent, as in CanadaSpends.
    setFocus(match.children ? match : (flat.find((n) => n.id === match.parent) ?? null));
  };

  const onMouseOver = useCallback(
    (total: number, overall?: number) => (node: SankeyHoverNode, event?: MouseEvent) => {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
      const value = node.realValue ?? 0;
      setHover({ ...node, percent: (value / total) * 100, overallPercent: overall ? (value / overall) * 100 : undefined });
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
        <div className="search-container">
          <input
            list="sankey-nodes"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search a ministry, tax or programme..."
            className="w-full rounded-md border border-[#A8A19B] bg-[#272727] px-3 py-2 text-sm text-[#f6ebe3] placeholder:text-[#A8A19B]"
            aria-label="Search the chart"
          />
          <datalist id="sankey-nodes">
            {flat.map((n) => (
              <option key={`${n.type}-${n.id}`} value={n.displayName} />
            ))}
          </datalist>
          {focus && (
            <button type="button" className="ml-2 text-sm text-[#f6ebe3] underline" onClick={() => search("")}>
              Show all
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
