"use client";

import NoSSR from "@/components/NoSSR";
import type { SankeyData, SankeyNode } from "./SankeyChartD3";
import { SankeyChart } from "./SankeyChart";

/** The full-width revenue -> spending chart; with no revenue tree it shows spending only. */
export default function SpendingSankey({ spending, revenue }: { spending: SankeyNode; revenue: SankeyNode | null }) {
  const total = (n: SankeyNode): number => n.amount ?? (n.children ?? []).reduce((s, c) => s + total(c), 0);
  const spent = total(spending);
  const raised = revenue ? total(revenue) : spent;
  const data: SankeyData = {
    total: Math.max(spent, raised),
    spending: spent,
    revenue: raised,
    spending_data: spending,
    revenue_data: revenue ?? { id: "revenue", displayName: "Revenue", amount: spent },
  };
  return (
    <div className={`sankey-chart-container ${revenue ? "" : "spending-only"}`}>
      <NoSSR>
        <SankeyChart data={data} amountScalingFactor={1} />
      </NoSSR>
    </div>
  );
}
