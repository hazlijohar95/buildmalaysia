// A company's record across every award result MyProcurement publishes: what it won, from whom, by which method,
// and how many of its quotations sat just under the tender limit. One query gathers its awards, then summarises them;
// the site-wide figures it is read against are computed once an hour.
import sql, { sharedFor } from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";
import { parseSupplierSlug, type ContractKind } from "@/lib/contracts";
import { NEAR_LIMIT_SHARE, QUOTATION_LIMITS, type ProcurementClass } from "@/lib/contract-checks";
import { awardKey } from "@/lib/queries/contract";

const space = (parts: ReturnType<typeof sql>[]) => parts.slice(1).reduce((all, p) => sql`${all} ${p}`, parts[0]);

/** procurementClass() in SQL; alias the notice `n`. */
const noticeClass = () => sql`
  case when lower(btrim(n.category)) = 'kerja' then 'works'
       when lower(n.category) like '%bukan perunding%' or lower(n.category) like 'bekalan%' then 'goods' end
`;

/** quotationLimit() in SQL: the limit in force for the notice's class on its date, or null. Built from
 * QUOTATION_LIMITS, so the two cannot disagree; a CASE rather than a join keeps it to one pass. Alias the notice `n`. */
const limitOf = () => {
  const branch = (cls: ProcurementClass) =>
    sql`case ${space(
      QUOTATION_LIMITS.filter((l) => l.class === cls).map(
        (l) => sql`when n.dated between ${l.from}::date and ${l.to ?? "9999-12-31"}::date then ${l.sen}::bigint`,
      ),
    )} end`;
  return sql`(case ${noticeClass()} when 'works' then ${branch("works")} when 'goods' then ${branch("goods")} end)`;
};

/** True for a quotation priced within NEAR_LIMIT_SHARE under the limit in force on its date; alias the notice `n`. */
export const nearLimitTest = () => sql`
  (n.kind = 'quotation' and n.total_sen > ${limitOf()} * ${NEAR_LIMIT_SHARE}::numeric and n.total_sen <= ${limitOf()})
`;

export interface LimitReading {
  /** Quotations a tender limit applies to, and how many sit within 5% under it: the base rate. */
  quotations: number;
  near: number;
  /** Quotations by price as a percentage of the limit, from 60% to 120%. Bin k holds prices over k% and up to k+1%,
   * so bins 95 to 99 are exactly the quotations isNearLimit() counts. */
  bins: { bin: number; count: number }[];
}

/** One pass over the quotations for both the base rate and the chart. The same for every reader, so it is kept for
 * an hour (sharedFor) rather than recomputed on each company page: cold, the scan takes seconds. */
export const getLimitReading = sharedFor(60 * 60 * 1000, async (): Promise<LimitReading> => {
  const [row] = await sql<{ quotations: number; near: number; bins: LimitReading["bins"] }[]>`
    with q as (
      select n.total_sen, ${limitOf()} as lim from procurement_notice n
      where n.kind = 'quotation' and n.total_sen is not null
    )
    select (select count(*) from q where lim is not null)::int as quotations,
           (select count(*) from q where total_sen > lim * ${NEAR_LIMIT_SHARE}::numeric and total_sen <= lim)::int as near,
           (select coalesce(json_agg(b order by b.bin), '[]')
            from (select ceil(total_sen * 100.0 / lim)::int - 1 as bin, count(*)::int as count from q
                  where total_sen > lim * 0.6 and total_sen <= lim * 1.2 group by 1) b) as bins
  `;
  return { quotations: row?.quotations ?? 0, near: row?.near ?? 0, bins: row?.bins ?? [] };
});

/** A company's names as MyProcurement prints them: enough for its page's heading, and empty for an unknown slug.
 * The trigram index answers it in milliseconds, so the page can stream its heading while the record loads. */
export async function getSupplierNames(slug: string): Promise<string[]> {
  const parsed = parseSupplierSlug(slug);
  if (!parsed) return [];
  const rows = await sql<{ supplier: string }[]>`
    select distinct a.supplier from procurement_award a
    where a.supplier ilike ${`%${parsed.words.join("%")}%`} and ${awardKey()} = ${parsed.key}
    order by 1
  `;
  return rows.map((r) => r.supplier);
}

export interface SupplierContract {
  kind: ContractKind;
  id: number;
  title: string;
  agency: string;
  ministry: string;
  dated: string;
  amount: Sen | null;
  nearLimit: boolean;
}

export interface SupplierRecord {
  names: string[];
  contracts: number;
  value: Sen;
  first: string;
  last: string;
  byKind: Record<ContractKind, { contracts: number; value: Sen }>;
  nearLimit: number;
  directCriteria: { criterion: string; contracts: number }[];
  years: { year: number; kind: ContractKind; value: Sen; contracts: number }[];
  ministries: { ministry: string; value: Sen; contracts: number }[];
  buyers: { agency: string; ministry: string; value: Sen; contracts: number; buyerTotal: Sen }[];
  largest: SupplierContract[];
  latest: SupplierContract[];
}

interface Summary {
  names: string[];
  contracts: number;
  value: number | null;
  first: string;
  last: string;
  near: number;
  kinds: { kind: ContractKind; contracts: number; value: number | null }[];
  criteria: { criterion: string; contracts: number }[] | null;
}

type RawContract = Omit<SupplierContract, "amount"> & { amount: number | null };

export async function getSupplier(slug: string): Promise<SupplierRecord | null> {
  const parsed = parseSupplierSlug(slug);
  if (!parsed) return null;
  const [row] = await sql<
    {
      summary: Summary | null;
      years: { year: number; kind: ContractKind; value: number | null; contracts: number }[] | null;
      ministries: { ministry: string; value: number | null; contracts: number }[] | null;
      buyers:
        | { agency: string; ministry: string; value: number | null; contracts: number; buyer_total: number | null }[]
        | null;
      largest: RawContract[] | null;
      latest: RawContract[] | null;
    }[]
  >`
    with mine as (
      select n.kind, n.id, n.title, n.ministry, n.agency, n.dated, n.criterion, a.supplier, a.amount_sen,
             ${nearLimitTest()} as near_limit
      from procurement_award a join procurement_notice n on n.kind = a.kind and n.id = a.notice_id
      where a.supplier ilike ${`%${parsed.words.join("%")}%`} and ${awardKey()} = ${parsed.key}
    ),
    bounds as (select min(dated) as first, max(dated) as last from mine),
    buyers as (
      select agency, min(ministry) as ministry, sum(amount_sen) as value, count(*)::int as contracts
      from mine group by agency order by value desc nulls last, agency limit 8
    ),
    pick as (select kind, id, title, agency, ministry, dated::text as dated, amount_sen as amount, near_limit as "nearLimit" from mine)
    select
      (select json_build_object(
         'names', (select json_agg(distinct supplier) from mine),
         'contracts', count(*), 'value', sum(amount_sen), 'first', min(dated)::text, 'last', max(dated)::text,
         'near', count(*) filter (where near_limit),
         'kinds', (select json_agg(k) from (select kind, count(*)::int as contracts, sum(amount_sen) as value
                                             from mine group by kind) k),
         'criteria', (select json_agg(c order by c.contracts desc)
                      from (select coalesce(criterion, 'Not stated') as criterion, count(*)::int as contracts
                            from mine where kind = 'direct' group by 1) c))
       from mine having count(*) > 0) as summary,
      (select json_agg(y order by y.year, y.kind)
       from (select extract(year from dated)::int as year, kind, sum(amount_sen) as value, count(*)::int as contracts
             from mine group by 1, 2) y) as years,
      (select json_agg(m order by m.value desc nulls last)
       from (select ministry, sum(amount_sen) as value, count(*)::int as contracts
             from mine group by 1 order by 2 desc nulls last limit 10) m) as ministries,
      (select json_agg(json_build_object('agency', b.agency, 'ministry', b.ministry, 'value', b.value,
                                         'contracts', b.contracts, 'buyer_total',
                                         (select sum(o.total_sen) from procurement_notice o, bounds
                                          where o.agency = b.agency and o.dated between bounds.first and bounds.last))
                       order by b.value desc nulls last)
       from buyers b) as buyers,
      (select json_agg(p) from (select * from pick order by amount desc nulls last, dated desc limit 12) p) as largest,
      (select json_agg(p) from (select * from pick order by dated desc, id desc limit 8) p) as latest
  `;
  const s = row?.summary;
  if (!s) return null;
  const kind = (k: ContractKind) => s.kinds.find((x) => x.kind === k);
  const toContract = (c: RawContract): SupplierContract => ({
    ...c,
    id: Number(c.id),
    amount: c.amount === null ? null : parseSen(c.amount),
  });
  return {
    names: s.names,
    contracts: s.contracts,
    value: parseSen(s.value ?? 0),
    first: s.first,
    last: s.last,
    byKind: {
      tender: { contracts: kind("tender")?.contracts ?? 0, value: parseSen(kind("tender")?.value ?? 0) },
      quotation: { contracts: kind("quotation")?.contracts ?? 0, value: parseSen(kind("quotation")?.value ?? 0) },
      direct: { contracts: kind("direct")?.contracts ?? 0, value: parseSen(kind("direct")?.value ?? 0) },
    },
    nearLimit: s.near,
    directCriteria: s.criteria ?? [],
    years: (row.years ?? []).map((y) => ({ ...y, value: parseSen(y.value ?? 0) })),
    ministries: (row.ministries ?? []).map((m) => ({ ...m, value: parseSen(m.value ?? 0) })),
    buyers: (row.buyers ?? []).map((b) => ({
      agency: b.agency,
      ministry: b.ministry,
      value: parseSen(b.value ?? 0),
      contracts: b.contracts,
      buyerTotal: parseSen(b.buyer_total ?? 0),
    })),
    largest: (row.largest ?? []).map(toContract),
    latest: (row.latest ?? []).map(toContract),
  };
}
