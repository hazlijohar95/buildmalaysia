// The commentary on a contract's and a company's page: each observation is one formula's result in a sentence, with
// why it matters, what else could explain it, and an anchor on /contracts/method where the formula is set out.
// Context places a figure; a question is a pattern the Open Contracting Partnership's red flags treat as worth
// asking about. Neither is a finding of wrongdoing.
import { ministryLabel, type Contract } from "@/lib/contracts";
import {
  CIRCULARS,
  DOMINANT_SHARE,
  MARKET_MIN_CONTRACTS,
  MARKET_YEARS,
  MIN_FOR_RANK,
  MIN_FOR_SHARE,
  NEAR_LIMIT_SHARE,
  SPLIT_WINDOW_DAYS,
  concentration,
  isNearLimit,
  ordinal,
  percent,
  quotationLimit,
  readSplitting,
} from "@/lib/contract-checks";
import { formatSen, formatSenCompact, type Sen } from "@/lib/money";
import { readableCase } from "@/lib/readable-case";
import type { ContractReading } from "@/lib/queries/contract";
import type { SupplierRecord } from "@/lib/queries/supplier";

export type ObservationId =
  | "rank"
  | "peers"
  | "relationship"
  | "direct"
  | "near-limit"
  | "splitting"
  | "market-share"
  | "concentration"
  | "company-direct"
  | "company-near-limit"
  | "company-top-buyer";

export interface Observation {
  id: ObservationId;
  tone: "context" | "question";
  headline: string;
  detail?: string;
  /** Innocent explanations, for a question. */
  otherwise?: string;
  /** The anchor on /contracts/method that sets out the formula. */
  method: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  bekalan: "supplies",
  "perkhidmatan bukan perunding": "non-consultancy services",
  "bekalan dan perkhidmatan bukan perunding": "supplies and services",
  kerja: "works",
  "perkhidmatan perunding": "consultancy",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category.trim().toLowerCase()] ?? (readableCase(category).toLowerCase() || "unstated");
}

const PLURAL = { tender: "tenders", quotation: "quotations", direct: "direct negotiations" } as const;
const day = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const formatDay = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-MY")} ${n === 1 ? one : many}`;

/** The buyer as the page names it: the agency, or the ministry where MyProcurement prints no agency. */
export function buyerName(c: Contract): string {
  return c.agency.trim() ? readableCase(c.agency) : (ministryLabel(c.ministry) ?? "an unnamed buyer");
}

/** "Larger than" never rounds up to 100%. */
const floorPercent = (share: number) => (share >= 0.1 ? `${Math.floor(share * 100)}%` : percent(share));

/** A share of the limit, with two decimals near 100% so 99.96% does not read as 100%. */
const limitPercent = (share: number) => `${(share * 100).toFixed(share >= 0.99 ? 2 : 1)}%`;

export function contractObservations(c: Contract, r: ContractReading): Observation[] {
  const out: Observation[] = [];
  const ministry = ministryLabel(c.ministry) ?? "its ministry";
  const agency = buyerName(c);
  const hasBuyer = c.agency.trim() !== "";
  const category = categoryLabel(c.category);
  const winner = r.winner ? readableCase(r.winner.name) : null;

  if (c.total !== null && r.year.rank !== null && r.year.contracts >= MIN_FOR_RANK) {
    const share = r.year.total > 0 ? c.total / r.year.total : 0;
    out.push({
      id: "rank",
      tone: "context",
      headline:
        r.year.rank === 1
          ? `The largest of the ${count(r.year.contracts, "contract")} ${ministry} awarded in ${r.year.number}.`
          : `The ${ordinal(r.year.rank)} largest of the ${count(r.year.contracts, "contract")} ${ministry} awarded in ${r.year.number}.`,
      detail: `At ${formatSenCompact(c.total)}, it is ${percent(share)} of the ${formatSenCompact(r.year.total)} the ministry's published results add up to that year.`,
      method: "rank",
    });
  }

  if (c.total !== null && r.peers.contracts >= MIN_FOR_RANK) {
    out.push({
      id: "peers",
      tone: "context",
      headline:
        r.peers.below === r.peers.contracts - 1
          ? `The largest of the ${r.peers.contracts.toLocaleString("en-MY")} ${PLURAL[c.kind]} for ${category} on MyProcurement.`
          : `Larger than ${floorPercent(r.peers.below / r.peers.contracts)} of the ${r.peers.contracts.toLocaleString("en-MY")} ${PLURAL[c.kind]} for ${category} on MyProcurement.`,
      method: "rank",
    });
  }

  if (c.kind === "direct") {
    const reasons = c.criterion ? readableCase(c.criterion) : null;
    out.push({
      id: "direct",
      tone: "question",
      headline: "Awarded by direct negotiation, without open competition.",
      detail: reasons
        ? `The reason MyProcurement records is ${reasons}.`
        : "MyProcurement records no reason for negotiating directly.",
      otherwise:
        "Treasury rules allow direct negotiation for an urgent need, a single source of supply, standardising on equipment already in use, or expertise few firms have. The question is whether the stated reason fits what was bought.",
      method: "direct",
    });
  }

  const limit = c.kind === "quotation" ? quotationLimit(c.category, c.dated) : null;
  if (limit && isNearLimit(c.total, limit.sen)) {
    out.push({
      id: "near-limit",
      tone: "question",
      headline: `Priced ${formatSen((limit.sen - (c.total as number)) as Sen)} under the ${formatSen(limit.sen)} limit, above which it would have needed an open tender.`,
      detail: `That is ${limitPercent((c.total as number) / limit.sen)} of the limit set by ${CIRCULARS[limit.circular].name}. Quotations within ${Math.round((1 - NEAR_LIMIT_SHARE) * 100)}% under the limit are far more common than just over it.`,
      otherwise:
        "Agencies plan purchases to the most a quotation allows, and the price is the offer the committee accepted, so a price near the limit is often just a well-sized budget.",
      method: "near-limit",
    });
  }

  if (hasBuyer && limit && r.nearby && r.nearby.length >= 2) {
    const split = readSplitting(
      r.nearby.map((n) => n.total),
      limit.sen,
    );
    if (split.raised) {
      out.push({
        id: "splitting",
        tone: "question",
        headline: `${count(split.count, "quotation")} from ${agency} to the same company within ${SPLIT_WINDOW_DAYS} days come to ${formatSenCompact(split.total)}, over the ${formatSen(limit.sen)} tender limit.`,
        detail:
          "Each is under the limit on its own. PK 2.1 forbids breaking one purchase into smaller ones to avoid a quotation or tender.",
        otherwise:
          "Separate purchases for different sites, wards or needs are allowed, and recurring supplies are often bought this way. The titles below show whether these were one need or several.",
        method: "splitting",
      });
    }
  }

  const m = r.market;
  if (hasBuyer && winner && m.lead && m.contracts >= MARKET_MIN_CONTRACTS && m.total > 0) {
    const share = m.lead.value / m.total;
    out.push({
      id: "market-share",
      tone: share >= DOMINANT_SHARE ? "question" : "context",
      headline: `${winner} won ${percent(share)} of the value ${agency} awarded for ${category} in the ${MARKET_YEARS} years to ${formatDay(c.dated)}.`,
      detail: `That is ${formatSenCompact(m.lead.value)} of ${formatSenCompact(m.total)}, across ${count(m.contracts, "contract")} and ${count(m.suppliers, "company", "companies")}.`,
      otherwise:
        share >= DOMINANT_SHARE
          ? "One firm can lead a market fairly: a sole licensed distributor, a framework or panel contract, or simply the lowest price every time."
          : undefined,
      method: "market",
    });
    const level = concentration(m.hhi);
    out.push({
      id: "concentration",
      tone: level === "high" ? "question" : "context",
      headline: `${agency}'s ${category} purchases are ${level === "high" ? "highly" : level === "moderate" ? "moderately" : "not"} concentrated among suppliers.`,
      detail: `Herfindahl-Hirschman Index ${Math.round(m.hhi).toLocaleString("en-MY")} out of 10,000 over those ${MARKET_YEARS} years. Above 1,800 is highly concentrated.`,
      otherwise:
        level === "high"
          ? "Specialised needs have few able suppliers, and a small buyer's market can look concentrated from only a few purchases."
          : undefined,
      method: "market",
    });
  }

  if (hasBuyer && winner && r.winner) {
    const b = r.winner.fromBuyer;
    out.push({
      id: "relationship",
      tone: "context",
      headline:
        b.contracts > 0
          ? `${winner} has won ${count(b.contracts, "other contract")} from ${agency}, worth ${formatSenCompact(b.value)}${b.first ? `, since ${b.first.slice(0, 4)}` : ""}.`
          : `This is ${winner}'s only result from ${agency} on MyProcurement.`,
      detail: `Across every buyer it has won ${count(r.winner.overall.contracts, "contract")} worth ${formatSenCompact(r.winner.overall.value)}.`,
      method: "companies",
    });
  }

  return out;
}

export function supplierObservations(s: SupplierRecord, base: { quotations: number; near: number }): Observation[] {
  const out: Observation[] = [];
  const direct = s.byKind.direct;
  if (direct.contracts > 0) {
    const reasons = s.directCriteria.map((c) => readableCase(c.criterion)).join("; ");
    out.push({
      id: "company-direct",
      tone: "question",
      headline: `${count(direct.contracts, "contract")} worth ${formatSenCompact(direct.value)} came by direct negotiation, without open competition.`,
      detail: `${s.value > 0 ? `That is ${percent(direct.value / s.value)} of the value it won. ` : ""}Reasons recorded: ${reasons}.`,
      otherwise: "Direct negotiation is allowed for urgent needs, a single source, standardisation or expertise.",
      method: "direct",
    });
  }

  const quotations = s.byKind.quotation.contracts;
  if (quotations >= MIN_FOR_SHARE && base.quotations > 0) {
    const rate = s.nearLimit / quotations;
    const baseRate = base.near / base.quotations;
    const raised = s.nearLimit >= 3 && rate >= baseRate * 2;
    out.push({
      id: "company-near-limit",
      tone: raised ? "question" : "context",
      headline: `${s.nearLimit.toLocaleString("en-MY")} of its ${quotations.toLocaleString("en-MY")} quotations (${percent(rate)}) were priced within 5% under the tender limit.`,
      detail: `Across every quotation the limit applies to, the share is ${percent(baseRate)}.${raised ? " This company's is at least twice that." : ""}`,
      otherwise: raised
        ? "A company that bids for purchases planned at the quotation ceiling will win many near it; the buyer sets the budget, not the winner."
        : undefined,
      method: "near-limit",
    });
  }

  const top = s.buyers[0];
  if (top && top.buyerTotal > 0 && top.contracts >= MIN_FOR_SHARE) {
    const share = top.value / top.buyerTotal;
    out.push({
      id: "company-top-buyer",
      tone: share >= DOMINANT_SHARE ? "question" : "context",
      headline: `Its largest buyer is ${readableCase(top.agency)}: ${percent(share)} of everything that buyer awarded between ${formatDay(s.first)} and ${formatDay(s.last)}.`,
      detail: `${formatSenCompact(top.value)} across ${count(top.contracts, "contract")}, of ${formatSenCompact(top.buyerTotal)} the buyer awarded in all.`,
      otherwise:
        share >= DOMINANT_SHARE
          ? "Long supply arrangements, panels and specialised services can leave one firm with most of a buyer's business."
          : undefined,
      method: "market",
    });
  }
  return out;
}
