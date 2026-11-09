// What a contract's page reads besides the contract itself: where it sits among its ministry's contracts that year,
// its buyer's market, other quotations near it to the same company, and the winner's record. Each read is scoped by
// an index (ministry, agency, supplier name) so a page costs a handful of small queries.
import sql from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";
import {
  contractColumns,
  KINDS,
  ministrySpellings,
  parseSupplierSlug,
  supplierKey,
  supplierSlug,
  toContract,
  type Contract,
  type ContractRow,
} from "@/lib/contracts";
import {
  MARKET_YEARS,
  SPLIT_WINDOW_DAYS,
  addDays,
  hhi as hhiOf,
  quotationLimit,
  yearsBefore,
} from "@/lib/contract-checks";

/** An award's supplier key, as supplierKey() computes it; alias the award `a`. */
export const awardKey = () => sql`regexp_replace(upper(a.supplier), '[^A-Z0-9]+', '', 'g')`;

/** A trigram-indexed narrowing for a company's name: every word of it, in order. */
export function supplierPattern(name: string): string {
  const parsed = parseSupplierSlug(supplierSlug(name));
  return parsed ? `%${parsed.words.join("%")}%` : "%";
}

export async function getContract(kind: string, id: string): Promise<Contract | null> {
  if (!(kind in KINDS) || !/^[0-9]{1,15}$/.test(id)) return null;
  const [row] = await sql<ContractRow[]>`
    select ${contractColumns()} from procurement_notice n where n.kind = ${kind}::procurement_kind and n.id = ${id}
  `;
  return row ? toContract(row) : null;
}

/** The award with the largest amount, which the market and record checks follow on a panel contract. */
export function leadAward(c: Contract) {
  return [...c.awards].sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1) || a.ordinal - b.ordinal)[0] ?? null;
}

export interface MarketSupplier {
  key: string;
  name: string;
  value: Sen;
  contracts: number;
}

export interface ContractReading {
  /** The ministry's contracts dated in the contract's year. */
  year: { number: number; contracts: number; total: Sen; rank: number | null; histogram: [number, number][] };
  /** Contracts of the same method and category, every year. */
  peers: { contracts: number; below: number };
  /** What the buyer awarded in this category over the MARKET_YEARS up to the contract's date. */
  market: {
    from: string;
    contracts: number;
    suppliers: number;
    total: Sen;
    hhi: number;
    top: MarketSupplier[];
    lead: MarketSupplier | null;
  };
  /** The buyer's quotations in this category to the same companies within SPLIT_WINDOW_DAYS, this one included. */
  nearby: Contract[] | null;
  /** The lead winner's other contracts from this buyer, and its record everywhere. */
  winner: {
    name: string;
    fromBuyer: { contracts: number; value: Sen; first: string | null };
    overall: { contracts: number; value: Sen };
  } | null;
}

type Json = [string, string, string, number];
const supplierRow = ([key, name, value, contracts]: Json): MarketSupplier => ({
  key,
  name,
  value: parseSen(value),
  contracts,
});

export async function getContractReading(c: Contract): Promise<ContractReading> {
  const year = Number(c.dated.slice(0, 4));
  const value = c.total ?? -1;
  const lead = leadAward(c);
  const keys = [...new Set(c.awards.map((a) => supplierKey(a.supplier)).filter(Boolean))];
  const marketFrom = yearsBefore(c.dated, MARKET_YEARS);
  const limit = c.kind === "quotation" ? quotationLimit(c.category, c.dated) : null;
  const leadKey = lead ? supplierKey(lead.supplier) : null;

  const [[yearRow], [peerRow], [marketRow], nearby, [buyerRow], [overallRow]] = await Promise.all([
    sql<{ rank: number; contracts: number; total: string | null; histogram: string }[]>`
      with peers as (
        select total_sen from procurement_notice
        where ministry in ${sql(ministrySpellings(c.ministry))}
          and dated >= make_date(${year}::int, 1, 1) and dated < make_date(${year}::int + 1, 1, 1) and total_sen > 0
      )
      select (select count(*) from peers where total_sen > ${value})::int + 1 as rank,
             (select count(*) from peers)::int as contracts,
             (select sum(total_sen) from peers)::text as total,
             (select coalesce(json_agg(json_build_array(b, n) order by b), '[]')
              from (select floor(log(total_sen / 100.0) * 4)::int as b, count(*)::int as n from peers group by 1) h
             )::text as histogram
    `,
    sql<{ contracts: number; below: number }[]>`
      select count(*)::int as contracts, count(*) filter (where total_sen < ${value})::int as below
      from procurement_notice
      where kind = ${c.kind}::procurement_kind and category = ${c.category} and total_sen is not null
    `,
    sql<
      { contracts: number; suppliers: number; total: string | null; hhi: number | null; top: string; leads: string }[]
    >`
      with m as (
        select kind, id from procurement_notice
        where agency = ${c.agency} and category = ${c.category} and dated > ${marketFrom}::date and dated <= ${c.dated}::date
      ),
      s as (
        select ${awardKey()} as key, min(a.supplier) as name, coalesce(sum(a.amount_sen), 0) as value,
               count(distinct (a.kind, a.notice_id))::int as contracts
        from procurement_award a join m on a.kind = m.kind and a.notice_id = m.id
        group by 1
      ),
      t as (select sum(value) as total, count(*) as suppliers from s)
      select (select count(*) from m)::int as contracts, t.suppliers::int, t.total::text,
             (select sum(power(value * 100.0 / nullif(t.total, 0), 2)) from s)::float8 as hhi,
             (select coalesce(json_agg(json_build_array(key, name, value::text, contracts) order by value desc), '[]')
              from (select * from s order by value desc, key limit 6) top)::text as top,
             (select coalesce(json_agg(json_build_array(key, name, value::text, contracts)), '[]')
              from s where key = ${leadKey ?? ""})::text as leads
      from t
    `,
    limit && keys.length && c.agency.trim()
      ? sql<ContractRow[]>`
          select ${contractColumns()} from procurement_notice n
          where n.kind = 'quotation' and n.agency = ${c.agency} and n.category = ${c.category}
            and n.dated between ${addDays(c.dated, -SPLIT_WINDOW_DAYS)}::date and ${addDays(c.dated, SPLIT_WINDOW_DAYS)}::date
            and exists (select 1 from procurement_award a where a.kind = n.kind and a.notice_id = n.id
                        and ${awardKey()} in ${sql(keys)})
          order by n.dated, n.id
          limit 50
        `
      : Promise.resolve(null),
    leadKey && c.agency.trim()
      ? sql<{ contracts: number; value: string | null; first: string | null }[]>`
          select count(distinct (n.kind, n.id))::int as contracts, sum(a.amount_sen)::text as value, min(n.dated)::text as first
          from procurement_notice n join procurement_award a on a.kind = n.kind and a.notice_id = n.id
          where n.agency = ${c.agency} and ${awardKey()} = ${leadKey}
            and not (n.kind = ${c.kind}::procurement_kind and n.id = ${c.id})
        `
      : Promise.resolve([]),
    lead && leadKey
      ? sql<{ contracts: number; value: string | null }[]>`
          select count(distinct (a.kind, a.notice_id))::int as contracts, sum(a.amount_sen)::text as value
          from procurement_award a
          where a.supplier ilike ${supplierPattern(lead.supplier)} and ${awardKey()} = ${leadKey}
        `
      : Promise.resolve([]),
  ]);

  const top = (JSON.parse(marketRow?.top ?? "[]") as Json[]).map(supplierRow);
  const leads = (JSON.parse(marketRow?.leads ?? "[]") as Json[]).map(supplierRow);
  return {
    year: {
      number: year,
      contracts: yearRow?.contracts ?? 0,
      total: parseSen(yearRow?.total ?? 0),
      rank: c.total === null ? null : (yearRow?.rank ?? null),
      histogram: JSON.parse(yearRow?.histogram ?? "[]") as [number, number][],
    },
    peers: { contracts: peerRow?.contracts ?? 0, below: peerRow?.below ?? 0 },
    market: {
      from: marketFrom,
      contracts: marketRow?.contracts ?? 0,
      suppliers: marketRow?.suppliers ?? 0,
      total: parseSen(marketRow?.total ?? 0),
      hhi: marketRow?.hhi ?? hhiOf(top.map((s) => s.value)),
      top,
      lead: leads[0] ?? null,
    },
    nearby: nearby ? nearby.map(toContract) : null,
    winner:
      lead && buyerRow && overallRow
        ? {
            name: lead.supplier,
            fromBuyer: {
              contracts: buyerRow.contracts,
              value: parseSen(buyerRow.value ?? 0),
              first: buyerRow.first,
            },
            overall: { contracts: overallRow.contracts, value: parseSen(overallRow.value ?? 0) },
          }
        : null,
  };
}
