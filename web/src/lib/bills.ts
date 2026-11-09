// Bills before Parliament and the Acts they became: Parliament's own listings (parlimen.gov.my) joined by bill number
// across the two houses, and to Laws of Malaysia (lom.agc.gov.my) by title. The filters travel in the URL, as on
// /contracts, so every list has an address worker.ts can cache and a reader can share.
import sql from "@/lib/db";
import { readableCase } from "@/lib/readable-case";
import { escapeWildcard } from "@/lib/search";

export const BILLS_PER_PAGE = 30;
export const BILLS_QUERY_MAX = 100;

export const PARLIMEN_BILLS_URL = "https://www.parlimen.gov.my/bills-dewan-rakyat.html?uweb=dr&";
export const LOM_URL = "https://lom.agc.gov.my/";

/** Where a bill has got to, as the bill_progress view works it out. In the order a list of them is shown. */
export const STAGES = {
  dewan_rakyat: { label: "Before the Dewan Rakyat", short: "Dewan Rakyat" },
  committee: { label: "In a select committee", short: "Select committee" },
  passed_dewan_rakyat: { label: "Passed the Dewan Rakyat", short: "Passed Dewan Rakyat" },
  passed: { label: "Passed by Parliament", short: "Passed Parliament" },
  enacted: { label: "Became law", short: "Law" },
  withdrawn: { label: "Withdrawn", short: "Withdrawn" },
  defeated: { label: "Rejected", short: "Rejected" },
} as const;
export type BillStage = keyof typeof STAGES;

export const HOUSES = {
  dewan_rakyat: { label: "Dewan Rakyat", en: "House of Representatives" },
  dewan_negara: { label: "Dewan Negara", en: "Senate" },
} as const;
export type House = keyof typeof HOUSES;

export interface BillFilters {
  q: string;
  stage: BillStage | null;
  year: number | null;
  page: number;
}

/** Reads the filters from a URL's query, dropping anything malformed rather than failing. */
export function parseBillFilters(params: URLSearchParams): BillFilters {
  const stage = params.get("stage");
  const year = Number(params.get("year"));
  const page = Number(params.get("page"));
  return {
    q: (params.get("q") ?? "").replaceAll("\u0000", "").trim().slice(0, BILLS_QUERY_MAX),
    stage: stage && stage in STAGES ? (stage as BillStage) : null,
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
    page: Number.isInteger(page) && page >= 1 && page <= 1_000 ? page : 1,
  };
}

/** The query string for a set of filters, leaving out the defaults so each list has one address. */
export function billsHref(f: BillFilters, change: Partial<BillFilters> = {}): string {
  const next = { ...f, page: 1, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.stage) params.set("stage", next.stage);
  if (next.year) params.set("year", String(next.year));
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/bills?${query}` : "/bills";
}

/** A bill's page on this site: D.R. 27/2026 is /bills/2026/27. */
export function billHref(b: { year: number; number: number }): string {
  return `/bills/${b.year}/${b.number}`;
}

/** "D.R. 27/2026", as Parliament prints a bill's number. */
export function billCode(b: { year: number; number: number }): string {
  return `D.R. ${b.number}/${b.year}`;
}

/** The budget year a Supply Bill (Rang Undang-Undang Perbekalan) appropriates, or null for any other bill. A
 * supplementary supply bill, "Perbekalan Tambahan (2025) 2026", tops up a year already under way and is left out. */
export function supplyBudgetYear(title: string): number | null {
  const found = /^(?:RUU|Rang Undang-Undang)\s+Perbekalan\s+(\d{4})$/i.exec(title.trim());
  return found ? Number(found[1]) : null;
}

/** An Act's number as the reader sees it: "Act 887", "Act A1801". */
export function actLabel(actNo: string): string {
  return `Act ${actNo}`;
}

// Words Act titles put in brackets that readableCase would keep in capitals as if they were acronyms.
const BRACKETED_WORDS = /\((PINDAAN|SABAH|SARAWAK|LABUAN|SEMAKAN|TAMBAHAN)\)/g;

/** LOM prints titles in capitals: "AKTA PERSAINGAN (PINDAAN) 2026" reads as "Akta Persaingan (Pindaan) 2026". */
export function lawTitle(title: string): string {
  return readableCase(title).replace(BRACKETED_WORDS, (_, w: string) => `(${w.charAt(0)}${w.slice(1).toLowerCase()})`);
}

export interface BillRow {
  year: number;
  number: number;
  title: string;
  titleTruncated: boolean;
  stage: BillStage;
  firstReading: string | null;
  lastMoved: string | null;
  actNo: string | null;
  actTitle: string | null;
  royalAssent: string | null;
}

export interface BillResults {
  rows: BillRow[];
  count: number;
  pages: number;
}

export interface BillsMeta {
  snapshot: { id: string; lastAt: string; bills: number; acts: number } | null;
  years: number[];
  stages: Record<BillStage, number>;
  /** Bills on either house's current list that both houses have yet to pass. Older ones the Dewan Negara's archive
   * leaves out would otherwise count as still before it. */
  underWay: number;
}

function where(f: BillFilters) {
  const pattern = f.q ? `%${escapeWildcard(f.q)}%` : null;
  return sql`
    where true
    ${f.stage ? sql`and p.stage = ${f.stage}` : sql``}
    ${f.year ? sql`and p.year = ${f.year}` : sql``}
    ${pattern ? sql`and (p.title ilike ${pattern} or a.title_ms ilike ${pattern} or a.title_en ilike ${pattern} or p.code ilike ${pattern} or a.act_no ilike ${pattern})` : sql``}
  `;
}

interface BillRowDb {
  year: number;
  number: number;
  title: string;
  title_truncated: boolean;
  stage: BillStage;
  first_reading: string | null;
  last_moved: string | null;
  act_no: string | null;
  act_title: string | null;
  royal_assent: string | null;
}

function toRow(r: BillRowDb): BillRow {
  return {
    year: r.year,
    number: r.number,
    title: r.title,
    titleTruncated: r.title_truncated,
    stage: r.stage,
    firstReading: r.first_reading,
    lastMoved: r.last_moved,
    actNo: r.act_no,
    actTitle: r.act_title,
    royalAssent: r.royal_assent,
  };
}

export async function searchBills(f: BillFilters): Promise<BillResults> {
  const filter = where(f);
  const offset = (f.page - 1) * BILLS_PER_PAGE;
  const [rows, [summary]] = await Promise.all([
    sql<BillRowDb[]>`
      select p.year, p.number, p.title, p.title_truncated, p.stage, p.first_reading::text, p.last_moved::text,
             p.act_no, a.title_ms as act_title, a.royal_assent::text
      from bill_progress p left join act a on a.act_no = p.act_no
      ${filter}
      order by p.year desc, p.number desc
      limit ${BILLS_PER_PAGE} offset ${offset}
    `,
    sql<{ count: string }[]>`
      select count(*) as count from bill_progress p left join act a on a.act_no = p.act_no ${filter}
    `,
  ]);
  const count = Number(summary?.count ?? 0);
  return { rows: rows.map(toRow), count, pages: Math.max(1, Math.ceil(count / BILLS_PER_PAGE)) };
}

export async function getBillsMeta(): Promise<BillsMeta> {
  const [[snapshot], years, stages, [underWay]] = await Promise.all([
    sql<{ id: string; last_at: string; bills: number; acts: number }[]>`
      select id, last_at::text, bills, acts from bill_snapshot order by id desc limit 1
    `,
    sql<{ year: number }[]>`select distinct year from bill order by year desc`,
    sql<{ stage: BillStage; count: string }[]>`select stage, count(*) as count from bill_progress group by stage`,
    sql<{ count: string }[]>`
      select count(*) as count from bill_progress p
      where p.stage in ('dewan_rakyat', 'committee', 'passed_dewan_rakyat')
        and exists (select 1 from bill_house h
                    where h.year = p.year and h.number = p.number and h.listing = 'current')
    `,
  ]);
  const counts = Object.fromEntries(Object.keys(STAGES).map((s) => [s, 0])) as Record<BillStage, number>;
  for (const s of stages) counts[s.stage] = Number(s.count);
  return {
    snapshot: snapshot
      ? { id: snapshot.id, lastAt: snapshot.last_at, bills: snapshot.bills, acts: snapshot.acts }
      : null,
    years: years.map((y) => y.year),
    stages: counts,
    underWay: Number(underWay?.count ?? 0),
  };
}

export interface HouseRecord {
  house: House;
  title: string;
  status: string;
  firstReading: string | null;
  secondReading: string | null;
  passed: string | null;
  committee: string | null;
  failed: string | null;
  tabledBy: string | null;
  passedBy: string | null;
  pdfUrl: string | null;
  listing: "current" | "archive";
  sourceUrl: string;
}

export interface ActRecord {
  actNo: string;
  kind: "principal" | "amendment" | "repealed";
  titleMs: string;
  titleEn: string | null;
  royalAssent: string | null;
  published: string | null;
  inForce: string | null;
  inForceNote: string | null;
  repealedBy: string | null;
  pdfMsUrl: string | null;
  pdfEnUrl: string | null;
  sourceUrl: string;
}

export interface BillDetail extends BillRow {
  actLink: "title" | "file" | null;
  actLinkNote: string | null;
  houses: HouseRecord[];
  act: ActRecord | null;
}

/** Reads a bill's year and number from its address, or null when they cannot be one. */
export function parseBillParams(year: string, number: string): { year: number; number: number } | null {
  if (!/^(19|20)\d{2}$/.test(year) || !/^[1-9]\d{0,3}$/.test(number)) return null;
  return { year: Number(year), number: Number(number) };
}

export async function getBill(yearParam: string, numberParam: string): Promise<BillDetail | null> {
  const key = parseBillParams(yearParam, numberParam);
  if (!key) return null;
  const [[bill], houses] = await Promise.all([
    sql<(BillRowDb & { act_link: "title" | "file" | null; act_link_note: string | null })[]>`
      select p.year, p.number, p.title, p.title_truncated, p.stage, p.first_reading::text, p.last_moved::text,
             p.act_no, a.title_ms as act_title, a.royal_assent::text, b.act_link, b.act_link_note
      from bill_progress p
      join bill b on b.year = p.year and b.number = p.number
      left join act a on a.act_no = p.act_no
      where p.year = ${key.year} and p.number = ${key.number}
    `,
    sql<
      {
        house: House;
        title: string;
        status: string;
        first_reading: string | null;
        second_reading: string | null;
        passed: string | null;
        committee: string | null;
        failed: string | null;
        tabled_by: string | null;
        passed_by: string | null;
        pdf_url: string | null;
        listing: "current" | "archive";
        source_url: string;
      }[]
    >`
      select house, title, status, first_reading::text, second_reading::text, passed::text, committee::text,
             failed::text, tabled_by, passed_by, pdf_url, listing, source_url
      from bill_house where year = ${key.year} and number = ${key.number}
      order by house
    `,
  ]);
  if (!bill) return null;
  const [act] = bill.act_no
    ? await sql<
        {
          act_no: string;
          kind: ActRecord["kind"];
          title_ms: string;
          title_en: string | null;
          royal_assent: string | null;
          published: string | null;
          in_force: string | null;
          in_force_note: string | null;
          repealed_by: string | null;
          pdf_ms_url: string | null;
          pdf_en_url: string | null;
          source_url: string;
        }[]
      >`
        select act_no, kind, title_ms, title_en, royal_assent::text, published::text, in_force::text, in_force_note,
               repealed_by, pdf_ms_url, pdf_en_url, source_url
        from act where act_no = ${bill.act_no}
      `
    : [];
  return {
    ...toRow(bill),
    actLink: bill.act_link,
    actLinkNote: bill.act_link_note,
    houses: houses.map((h) => ({
      house: h.house,
      title: h.title,
      status: h.status,
      firstReading: h.first_reading,
      secondReading: h.second_reading,
      passed: h.passed,
      committee: h.committee,
      failed: h.failed,
      tabledBy: h.tabled_by,
      passedBy: h.passed_by,
      pdfUrl: h.pdf_url,
      listing: h.listing,
      sourceUrl: h.source_url,
    })),
    act: act
      ? {
          actNo: act.act_no,
          kind: act.kind,
          titleMs: act.title_ms,
          titleEn: act.title_en,
          royalAssent: act.royal_assent,
          published: act.published,
          inForce: act.in_force,
          inForceNote: act.in_force_note,
          repealedBy: act.repealed_by,
          pdfMsUrl: act.pdf_ms_url,
          pdfEnUrl: act.pdf_en_url,
          sourceUrl: act.source_url,
        }
      : null,
  };
}

export interface Step {
  label: string;
  ms: string;
  date: string;
}

/** A house's steps with the dates it prints, in the order a bill takes them. */
export function houseSteps(h: HouseRecord): Step[] {
  const steps: (Step | null)[] = [
    h.firstReading ? { label: "First reading", ms: "Bacaan Pertama", date: h.firstReading } : null,
    h.committee ? { label: "Sent to a special select committee", ms: "Dirujuk JKPK", date: h.committee } : null,
    h.secondReading ? { label: "Second reading", ms: "Bacaan Kedua", date: h.secondReading } : null,
    h.failed ? { label: "Short of a two-thirds majority", ms: "Tidak Mendapat Undi 2/3", date: h.failed } : null,
    h.passed ? { label: "Passed", ms: "Diluluskan", date: h.passed } : null,
  ];
  return steps.filter((s): s is Step => s !== null);
}

/** Dates a listing prints in an order no bill can take; the page notes them rather than reorder them. */
export function outOfOrder(houses: HouseRecord[]): string[] {
  const notes: string[] = [];
  for (const h of houses) {
    const name = HOUSES[h.house].label;
    if (h.firstReading && h.secondReading && h.secondReading < h.firstReading)
      notes.push(`the ${name} lists its second reading before its first`);
    if (h.secondReading && h.passed && h.passed < h.secondReading)
      notes.push(`the ${name} lists the bill as passed before its second reading`);
  }
  const dr = houses.find((h) => h.house === "dewan_rakyat");
  const dn = houses.find((h) => h.house === "dewan_negara");
  if (dr?.passed && dn?.firstReading && dn.firstReading < dr.passed)
    notes.push("the Dewan Negara lists its first reading before the Dewan Rakyat passed the bill");
  return notes;
}
