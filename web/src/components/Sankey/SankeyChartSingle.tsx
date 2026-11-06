// Adapted from CanadaSpends (MIT, Build Canada).
import { useEffect, useRef } from "react";
import { SankeyChartD3, type SankeyChartD3Props } from "./SankeyChartD3";

export type SankeyChartSingleProps = {
  id: string;
} & SankeyChartD3Props;

export function SankeyChartSingle(props: SankeyChartSingleProps) {
  const {
    id,
    data,
    direction = "left-to-right",
    colors,
    difference,
    differenceLabel,
    totalAmount,
    height = 760,
    amountScalingFactor = 1e9,
    onMouseOver = () => {},
    onMouseOut = () => {},
  } = props;

  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => {
      if (!data || !chartRef.current) return;

      new SankeyChartD3({
        height,
        container: chartRef.current,
        data,
        direction,
        totalAmount,
        difference,
        differenceLabel,
        amountScalingFactor,
        colors,
        onMouseOver,
        onMouseOut,
      });
    },
    // No need to add other dependencies because the chart is only rendered once
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  return <div id={id} className="chart" ref={chartRef}></div>;
}
