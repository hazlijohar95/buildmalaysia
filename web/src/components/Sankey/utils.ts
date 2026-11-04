// Adapted from CanadaSpends (MIT, Build Canada).
import type { SankeyNode } from "./SankeyChartD3";

/** "RM 412.7B"-style compact ringgit, from an amount in units of `scalingFactor` ringgit. */
export const formatNumber = (amount: number, scalingFactor = 1e9): string => {
  const ringgit = amount * scalingFactor;
  const digits = Math.abs(ringgit) >= 1e9 ? 2 : Math.abs(ringgit) >= 1e6 ? 1 : 0;
  const compact = Intl.NumberFormat("en-MY", {
    notation: "compact",
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(ringgit);
  return `RM${compact}`;
};

/** Sorts each node's children by total amount, largest first (in place). */
export function sortNodesByAmount(node: SankeyNode): SankeyNode {
  const total = (n: SankeyNode): number => n.amount ?? (n.children ?? []).reduce((s, c) => s + total(c), 0);
  if (node.children?.length) {
    node.children.forEach(sortNodesByAmount);
    node.children.sort((a, b) => total(b) - total(a));
  }
  return node;
}
