// Government contracts: the award results MyProcurement publishes, searched by what was bought, who won it and who
// bought it. The filters travel in the URL so every result list has an address worker.ts can cache and a reader can
// share.
import sql from "@/lib/db";
import { escapeWildcard } from "@/lib/search";
import { parseSen, parseSenOrNull, type Sen } from "@/lib/money";
import { titleCase } from "@/lib/queries/sankey";

export const CONTRACTS_PER_PAGE = 25;
export const CONTRACTS_QUERY_MAX = 100;

/** A contract's page on this site. */
export function contractHref(c: { kind: ContractKind; id: number }): string {
  return `/contracts/${c.kind}/${c.id}`;
}

// MyProcurement names companies, not registration numbers, so a company is the run of letters and digits in its
// name: "SDN. BHD." and "SDN BHD" are the same company, and two firms sharing one name are counted together. The
// database computes the same key with regexp_replace(upper(supplier), '[^A-Z0-9]+', '', 'g').
export function supplierKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/** "LOYAL ENGINEERING SDN. BHD." -> "loyal-engineering-sdn-bhd": the address of a company's page. */
export function supplierSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function supplierHref(name: string): string | null {
  const slug = supplierSlug(name);
  return slug ? `/contracts/company/${slug}` : null;
}

/** A slug's company key and the words of its name, which narrow the search through the supplier name index. */
export function parseSupplierSlug(slug: string): { key: string; words: string[] } | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 200) return null;
  return { key: supplierKey(slug), words: slug.split("-") };
}

// MyProcurement spells some ministries more than one way. Each variant here is filed under the one name it maps to,
// so the menu lists the ministry once and old links to a variant still work. Renamed ministries stay apart: a new
// name usually comes with a new remit.
const MINISTRY_VARIANTS: Record<string, string> = {
  "KEMENTERIAN PENDIDIKAN": "KEMENTERIAN PENDIDIKAN MALAYSIA",
  "KEMENTERIAN SAINS TEKNOLOGI DAN INOVASI": "KEMENTERIAN SAINS, TEKNOLOGI DAN INOVASI",
  "KEMENTERIAN PENDIDIKAN TINGGI (SEHINGGA 30 SEPT 2018)": "KEMENTERIAN PENDIDIKAN TINGGI",
  "KEMENTERIAN TENAGA, TEKNOLOGI HIJAU DAN AIR (SEHINGGA 30 SEPT 2018)": "KEMENTERIAN TENAGA, TEKNOLOGI HIJAU DAN AIR",
};

/** The one name a ministry is filed under, whichever way MyProcurement spelled it. */
export function canonicalMinistry(name: string): string {
  return MINISTRY_VARIANTS[name] ?? name;
}

/** Every spelling MyProcurement uses for a ministry, for matching its rows. */
export function ministrySpellings(name: string): string[] {
  const canonical = canonicalMinistry(name);
  return [canonical, ...Object.keys(MINISTRY_VARIANTS).filter((v) => MINISTRY_VARIANTS[v] === canonical)];
}

/** A ministry's name as the page shows it: "Kementerian Kesihatan". MyProcurement prints "-" when it names none. */
export function ministryLabel(name: string): string | null {
  return /^[\s-]*$/.test(name) ? null : titleCase(canonicalMinistry(name));
}

/** A ministry with no results in the year before the latest one is listed as a former ministry or name. */
const CURRENT_WITHIN_DAYS = 365;
const STATE_GOVERNMENT = /KERAJAAN NEGERI|SARAWAK|SABAH/;

export interface MinistryOption {
  value: string;
  label: string;
}

export interface MinistryGroups {
  current: MinistryOption[];
  former: MinistryOption[];
  states: MinistryOption[];
}

/** Sorts the ministries MyProcurement names into current ones, former ones and state governments, by name. */
export function groupMinistries(rows: { ministry: string; latest: string }[]): MinistryGroups {
  const latest = new Map<string, string>();
  for (const r of rows) {
    if (ministryLabel(r.ministry) === null) continue;
    const name = canonicalMinistry(r.ministry);
    if ((latest.get(name) ?? "") < r.latest) latest.set(name, r.latest);
  }
  const newest = Math.max(0, ...[...latest.values()].map((d) => Date.parse(d)));
  const cutoff = newest - CURRENT_WITHIN_DAYS * 86_400_000;
  const groups: MinistryGroups = { current: [], former: [], states: [] };
  for (const [name, day] of latest) {
    const group = STATE_GOVERNMENT.test(name) ? "states" : Date.parse(day) >= cutoff ? "current" : "former";
    groups[group].push({ value: name, label: titleCase(name) });
  }
  const byLabel = (a: MinistryOption, b: MinistryOption) => a.label.localeCompare(b.label, "ms");
  for (const list of [groups.current, groups.former, groups.states]) list.sort(byLabel);
  return groups;
}

export const KINDS = {
  tender: { label: "Tender", ms: "Tender" },
  quotation: { label: "Quotation", ms: "Sebut harga" },
  direct: { label: "Direct negotiation", ms: "Rundingan terus" },
} as const;
export type ContractKind = keyof typeof KINDS;

export const SORTS = { value: "Largest first", newest: "Newest first" } as const;
export type ContractSort = keyof typeof SORTS;

export interface ContractFilters {
  q: string;
  kind: ContractKind | null;
  ministry: string | null;
  year: number | null;
  sort: ContractSort;
  page: number;
}

/** Reads the filters from a URL's query, dropping anything malformed rather than failing. */
export function parseContractFilters(params: URLSearchParams): ContractFilters {
  const kind = params.get("kind");
  const sort = params.get("sort");
  const year = Number(params.get("year"));
  const page = Number(params.get("page"));
  const ministry = (params.get("ministry") ?? "").trim().slice(0, 200);
  return {
    q: (params.get("q") ?? "").replaceAll("\u0000", "").trim().slice(0, CONTRACTS_QUERY_MAX),
    kind: kind && kind in KINDS ? (kind as ContractKind) : null,
    ministry: ministry ? canonicalMinistry(ministry) : null,
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    sort: sort && sort in SORTS ? (sort as ContractSort) : "value",
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** The query string for a set of filters, leaving out the defaults so each list has one address. */
export function contractsHref(f: ContractFilters, change: Partial<ContractFilters> = {}): string {
  const next = { ...f, page: 1, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.ministry) params.set("ministry", next.ministry);
  if (next.kind) params.set("kind", next.kind);
  if (next.year) params.set("year", String(next.year));
  if (next.sort !== "value") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/contracts?${query}` : "/contracts";
}

export interface ContractAward {
  ordinal: number;
  supplier: string;
  amount: Sen | null;
}

export interface Contract {
  kind: ContractKind;
  id: number;
  reference: string | null;
  title: string;
  ministry: string;
  agency: string;
  category: string;
  dated: string; // ISO date
  resultDated: boolean; // false when only the display or application date is printed
  criterion: string | null;
  sourceUrl: string;
  awards: ContractAward[];
  total: Sen | null;
}

export interface ContractResults {
  rows: Contract[];
  count: number;
  total: Sen; // the summed accepted prices of every matching notice
  pages: number;
}

export interface ContractsMeta {
  snapshot: { id: string; lastPageAt: string; notices: number; awards: number } | null;
  ministries: MinistryGroups;
  years: number[];
  earliest: Record<ContractKind, number | null>;
}

function where(f: ContractFilters) {
  const pattern = f.q ? `%${escapeWildcard(f.q)}%` : null;
  return sql`
    where true
    ${f.kind ? sql`and n.kind = ${f.kind}::procurement_kind` : sql``}
    ${f.ministry ? sql`and n.ministry in ${sql(ministrySpellings(f.ministry))}` : sql``}
    ${f.year ? sql`and n.dated >= make_date(${f.year}::int, 1, 1) and n.dated < make_date(${f.year}::int + 1, 1, 1)` : sql``}
    ${
      pattern
        ? sql`and (n.title ilike ${pattern} or n.agency ilike ${pattern} or n.reference ilike ${pattern}
             or exists (select 1 from procurement_award s
                        where s.kind = n.kind and s.notice_id = n.id and s.supplier ilike ${pattern}))`
        : sql``
    }
  `;
}

/** The columns a Contract is read from; alias the notice `n`. A function: fragments belong to a request. */
export const contractColumns = () => sql`
  n.kind, n.id, n.reference, n.title, n.ministry, n.agency, n.category, n.dated::text as dated,
  coalesce(n.dated = n.result_date, false) as result_dated, n.criterion, n.source_url, n.total_sen::text as total,
  (select json_agg(json_build_object('ordinal', a.ordinal, 'supplier', a.supplier, 'amount', a.amount_sen::text)
                   order by a.ordinal)
   from procurement_award a where a.kind = n.kind and a.notice_id = n.id)::text as awards
`;

export interface ContractRow {
  kind: ContractKind;
  id: string;
  reference: string | null;
  title: string;
  ministry: string;
  agency: string;
  category: string;
  dated: string;
  result_dated: boolean;
  criterion: string | null;
  source_url: string;
  total: string | null;
  awards: string | null;
}

export function toContract(r: ContractRow): Contract {
  const awards = (r.awards ? JSON.parse(r.awards) : []) as {
    ordinal: number;
    supplier: string;
    amount: string | null;
  }[];
  return {
    kind: r.kind,
    id: Number(r.id),
    reference: r.reference,
    title: r.title,
    ministry: r.ministry,
    agency: r.agency,
    category: r.category,
    dated: r.dated,
    resultDated: r.result_dated,
    criterion: r.criterion,
    sourceUrl: r.source_url,
    total: parseSenOrNull(r.total),
    awards: awards.map((a) => ({ ordinal: a.ordinal, supplier: a.supplier, amount: parseSenOrNull(a.amount) })),
  };
}

export async function searchContracts(f: ContractFilters): Promise<ContractResults> {
  const filter = where(f);
  const order =
    f.sort === "newest" ? sql`n.dated desc, n.id desc` : sql`n.total_sen desc nulls last, n.dated desc, n.id desc`;
  const offset = (f.page - 1) * CONTRACTS_PER_PAGE;
  const [rows, [summary]] = await Promise.all([
    sql<ContractRow[]>`
      select ${contractColumns()}
      from procurement_notice n
      ${filter}
      order by ${order}
      limit ${CONTRACTS_PER_PAGE} offset ${offset}
    `,
    sql<{ count: string; total: string | null }[]>`
      select count(*) as count, sum(n.total_sen)::text as total
      from procurement_notice n
      ${filter}
    `,
  ]);
  const count = Number(summary?.count ?? 0);
  return {
    rows: rows.map(toContract),
    count,
    total: parseSen(summary?.total ?? 0),
    pages: Math.max(1, Math.ceil(count / CONTRACTS_PER_PAGE)),
  };
}

export async function getContractsMeta(): Promise<ContractsMeta> {
  const [[snapshot], ministries, years, earliest] = await Promise.all([
    sql<{ id: string; last_page_at: string; notices: number; awards: number }[]>`
      select id, last_page_at::text, notices, awards from procurement_snapshot order by id desc limit 1
    `,
    sql<{ ministry: string; latest: string }[]>`
      select ministry, max(dated)::text as latest from procurement_notice group by ministry
    `,
    sql<{ year: number }[]>`
      select distinct extract(year from dated)::int as year from procurement_notice order by year desc
    `,
    sql<{ kind: ContractKind; year: number }[]>`
      select kind, extract(year from min(dated))::int as year from procurement_notice group by kind
    `,
  ]);
  const first = Object.fromEntries(earliest.map((e) => [e.kind, e.year]));
  return {
    snapshot: snapshot
      ? { id: snapshot.id, lastPageAt: snapshot.last_page_at, notices: snapshot.notices, awards: snapshot.awards }
      : null,
    ministries: groupMinistries(ministries),
    years: years.map((y) => y.year),
    earliest: { tender: first.tender ?? null, quotation: first.quotation ?? null, direct: first.direct ?? null },
  };
}
