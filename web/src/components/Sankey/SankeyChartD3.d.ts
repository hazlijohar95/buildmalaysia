// Types for the plain-JavaScript D3 renderer in SankeyChartD3.js.

export type SankeyNode = {
  id: string; // unique identifier for internal operations
  displayName: string; // user-facing name
  amount?: number; // leaves carry amounts; parents sum their children
  link?: string; // a page about this node, linked from its label and tooltip
  children?: SankeyNode[];
};

export type SankeyData = {
  total: number;
  spending: number;
  revenue: number;
  spending_data: SankeyNode;
  revenue_data: SankeyNode;
};

/** A node as the renderer reports it to hover handlers. */
export type SankeyHoverNode = SankeyNode & {
  realValue?: number;
  value?: number;
  blockRect?: DOMRect;
};

export type SankeyChartD3Props = {
  container?: HTMLElement;
  width?: number;
  height: number;
  direction: "left-to-right" | "right-to-left";
  margin?: { top: number; right: number; bottom: number; left: number };
  colors?: { primary: string };
  shortBlockHeight?: number;
  data: SankeyNode;
  totalAmount: number;
  difference?: number;
  differenceLabel?: string;
  amountScalingFactor?: number;
  onMouseOver?: (node: SankeyHoverNode, event?: MouseEvent) => void;
  onMouseOut?: (node: SankeyHoverNode) => void;
};

export declare class SankeyChartD3 {
  constructor(props: SankeyChartD3Props);
}
