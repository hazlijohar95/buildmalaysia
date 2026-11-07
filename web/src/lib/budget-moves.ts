import { reorganisedBetween, type BodyLineage } from "@/lib/lineage";
import { parseSen, type Sen } from "@/lib/money";

/** A body's hold on a vote code over a range of fiscal years; `to` is null while it still holds it. */
export interface VoteHolding {
  body: BodyLineage;
  from: number;
  to: number | null;
}

/** One vote as a budget book prints it: the current year's budget beside the proposed one, on one line. */
export interface VoteComparison {
  voteCode: string;
  name: string; // as the book prints it
  base: Sen; // Anggaran Asal: the current year's original estimate
  proposed: Sen; // Anggaran: the budget year's estimate
  pdfPage: number;
  bookPage: number;
  holdings: VoteHolding[];
}

export interface BudgetMove {
  voteCode: string;
  name: string;
  base: Sen;
  proposed: Sen;
  change: Sen;
  percent: number | null; // null when the base is zero
  pdfPage: number;
  bookPage: number;
}

export interface Ranking {
  rose: BudgetMove[];
  fell: BudgetMove[];
}

export interface BudgetMoves {
  byAmount: Ranking;
  byPercent: Ranking;
  /** Vote codes left out because the body behind them changed during the window. */
  reorganised: string[];
}

/** Below RM 100 million a percentage says little: the votes under it are constitutional offices and small commissions. */
export const MIN_PERCENT_BASE = parseSen(10_000_000_000);

export const LIMITS = { amount: 10, percent: 5 };

/**
 * The years a reorganisation can make a vote's two figures unlike: from the year the current budget was tabled,
 * through the year being budgeted.
 */
export function reorganisationWindow(budgetYear: number): { from: number; to: number } {
  return { from: budgetYear - 2, to: budgetYear };
}

function reorganised(vote: VoteComparison, from: number, to: number): boolean {
  const holders = vote.holdings.filter((h) => h.from <= to && (h.to === null || h.to >= from));
  return holders.length > 1 || holders.some((h) => reorganisedBetween(h.body, from, to));
}

const byCode = (a: BudgetMove, b: BudgetMove) => a.voteCode.localeCompare(b.voteCode);

/** The votes whose budget rose and fell most, by ringgit and by percentage, leaving out reorganised votes. */
export function budgetMoves(votes: VoteComparison[], budgetYear: number, limits = LIMITS): BudgetMoves {
  const { from, to } = reorganisationWindow(budgetYear);
  const leftOut = votes.filter((v) => reorganised(v, from, to));
  const moves: BudgetMove[] = votes
    .filter((v) => !leftOut.includes(v))
    .map(({ voteCode, name, base, proposed, pdfPage, bookPage }) => ({
      voteCode,
      name,
      base,
      proposed,
      change: parseSen(proposed - base),
      percent: base > 0 ? ((proposed - base) / base) * 100 : null,
      pdfPage,
      bookPage,
    }));
  const rose = moves.filter((m) => m.change > 0);
  const fell = moves.filter((m) => m.change < 0);
  const sized = (m: BudgetMove) => m.base >= MIN_PERCENT_BASE;
  const percent = (m: BudgetMove) => m.percent ?? 0;
  return {
    byAmount: {
      rose: rose.toSorted((a, b) => b.change - a.change || byCode(a, b)).slice(0, limits.amount),
      fell: fell.toSorted((a, b) => a.change - b.change || byCode(a, b)).slice(0, limits.amount),
    },
    byPercent: {
      rose: rose
        .filter(sized)
        .toSorted((a, b) => percent(b) - percent(a) || byCode(a, b))
        .slice(0, limits.percent),
      fell: fell
        .filter(sized)
        .toSorted((a, b) => percent(a) - percent(b) || byCode(a, b))
        .slice(0, limits.percent),
    },
    reorganised: leftOut.map((v) => v.voteCode),
  };
}
