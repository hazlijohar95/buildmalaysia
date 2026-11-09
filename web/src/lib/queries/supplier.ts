// A company's record across every award result MyProcurement publishes: what it won, from whom, by which method,
// and how many of its quotations sat just under the tender limit. One query gathers its awards, then summarises them.
import sql from "@/lib/db";
import { perRequest } from "@/lib/db";
import { parseSen, type Sen } from "@/lib/money";
import { parseSupplierSlug, type ContractKind } from "@/lib/contracts";
import { NEAR_LIMIT_SHARE, QUOTATION_LIMITS } from "@/lib/contract-checks";
import { awardKey } from "@/lib/queries/contract";

/** QUOTATION_LIMITS as a table: (class, from_date, to_date, sen). */
function limitsTable() {
  const rows = QUOTATION_LIMITS.map(
    (l) => sql`(${l.class}::text, ${l.from}::date, ${l.to ?? "9999-12-31"}::date, ${l.sen}::bigint)`,
  );
  const values = rows.slice(1).reduce((all, row) => sql`${all}, ${row}`, rows[0]);
  return sql`(values ${values}) as lim(class, from_date, to_date, sen)`;
}

/** procurementClass() in SQL; alias the notice `n`. */
const noticeClass = () => sql`
  case when lower(btrim(n.category)) = 'kerja' then 'works'
       when lower(n.category) like '%bukan perunding%' or lower(n.category) like 'bekalan%' then 'goods' end
`;

/** True for a quotation priced within NEAR_LIMIT_SHARE under the limit in force on its date; alias the notice `n`. */
export const nearLimitTest = () => sql`
  (n.kind = 'quotation' and exists (
    select 1 from ${limitsTable()}
    where lim.class = ${noticeClass()} and n.dated between lim.from_date and lim.to_date
      and n.total_sen > lim.sen * ${NEAR_LIMIT_SHARE}::numeric and n.total_sen <= lim.sen))
`;

/** Of the quotations a tender limit applies to, how many sit within 5% under it: the base rate a company's is read
 * against. Shared by every company page a request renders. */
export const getNearLimitBaseRate = perRequest(async () => {
  const [row] = await sql<{ quotations: number; near: number }[]>`
    select count(*)::int as quotations, count(*) filter (where ${nearLimitTest()})::int as near
    from procurement_notice n
    where n.kind = 'quotation' and n.total_sen is not null
      and exists (select 1 from ${limitsTable()} where lim.class = ${noticeClass()} and n.dated between lim.from_date and lim.to_date)
  `;
  return { quotations: row?.quotations ?? 0, near: row?.near ?? 0 };
});

/** Quotations by their value as a percentage of the limit in force, one bin a point from 60% to 120%. Bin k holds
 * prices over k% and up to k+1%, so bins 95 to 99 are exactly the quotations isNearLimit() counts. */
export async function getLimitBunching(): Promise<{ bin: number; count: number }[]> {
  return sql<{ bin: number; count: number }[]>`
    select ceil(n.total_sen * 100.0 / lim.sen)::int - 1 as bin, count(*)::int as count
    from procurement_notice n join ${limitsTable()}
      on lim.class = ${noticeClass()} and n.dated between lim.from_date and lim.to_date
    where n.kind = 'quotation' and n.total_sen > lim.sen * 0.6 and n.total_sen <= lim.sen * 1.2
    group by 1 order by 1
  `;
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
