import sql from "@/lib/db";
import type { SankeyNode } from "@/components/Sankey/SankeyChartD3";
import { slugify } from "@/lib/slug";
import { getOperatingGaps } from "@/lib/queries/gaps";

/** Ringgit (not sen) for the chart: amounts it sizes and prints with amountScalingFactor = 1. */
const rm = (sen: string | number) => Number(sen) / 100;

interface ProgrammeRow {
  vote_code: string;
  vote_name: string;
  section: "charged" | "supply";
  programme_code: string;
  programme_name: string | null;
  actual_sen: string;
}

interface DevelopmentRow {
  vote_code: string;
  vote_name: string;
  group_name: string | null;
  actual_sen: string;
}

/** Spending side of the year's Sankey: operating, development and the COVID-19 Fund, by vote. */
export async function getSpendingTree(year: number): Promise<SankeyNode> {
  const [programmes, development, covid, ministries] = await Promise.all([
    sql<ProgrammeRow[]>`
      select v.code as vote_code, v.name_ms as vote_name, v.section::text as section,
             p.code as programme_code, p.name_ms as programme_name,
             t.actual_sen
               - coalesce((select sum(l.actual_sen) from operating_line_detail l
                           where l.fiscal_year = t.fiscal_year and l.vote_code = 'B.12'
                             and l.programme_code = p.code and l.activity_name_ms = 'Kumpulan Wang Pembangunan'
                             and t.vote_code = 'B.12'), 0) as actual_sen
      from printed_total t
      join vote v on v.fiscal_year = t.fiscal_year and v.code = t.vote_code
      join programme p on p.fiscal_year = t.fiscal_year and p.vote_code = t.vote_code and p.code = t.programme_code
      where t.fiscal_year = ${year} and t.scope = 'programme' and t.object_code is null
    `,
    sql<DevelopmentRow[]>`
      select p.vote_code, v.name_ms as vote_name, coalesce(par.name_ms, g.name_ms) as group_name,
             sum(p.actual_sen) as actual_sen
      from development_project p
      join development_vote v on v.fiscal_year = p.fiscal_year and v.code = p.vote_code
      left join development_group g
        on g.fiscal_year = p.fiscal_year and g.vote_code = p.vote_code and g.ordinal = p.group_ordinal
      left join development_group par
        on par.fiscal_year = g.fiscal_year and par.vote_code = g.vote_code and par.ordinal = g.parent_ordinal
      where p.fiscal_year = ${year}
      group by 1, 2, 3
    `,
    sql<{ code: string; name_ms: string; actual_sen: string }[]>`
      select code, name_ms, actual_sen from covid_fund_line where fiscal_year = ${year}
    `,
    sql<
      {
        body_id: string;
        body_name_ms: string;
        name_ms: string;
        operating_vote_code: string | null;
        development_vote_code: string | null;
      }[]
    >`
      select body_id, body_name_ms, name_ms, operating_vote_code, development_vote_code
      from ministry_spending where fiscal_year = ${year}
    `,
  ]);

  const [gaps, voteTotals] = await Promise.all([
    getOperatingGaps(year),
    sql<{ vote_code: string; actual_sen: string }[]>`
      select vote_code, actual_sen from printed_total
      where fiscal_year = ${year} and scope = 'vote' and object_code is null
    `,
  ]);
  // Where a page is missing from the published statement, a programme's printed total can be missing
  // too: show what the vote total leaves unaccounted for as its own, labelled block rather than drop it.
  const gapLeaves = (code: string | null): SankeyNode[] => {
    const gap = gaps.find(
      (g) =>
        g.vote_code === code && !programmes.some((p) => p.vote_code === code && p.programme_code === g.programme_code),
    );
    const voteTotal = voteTotals.find((v) => v.vote_code === code);
    if (!gap || !voteTotal) return [];
    const printed = programmes.filter((p) => p.vote_code === code).reduce((t, p) => t + Number(p.actual_sen), 0);
    const missing = Number(voteTotal.actual_sen) - printed;
    return missing > 0
      ? [leaf(`gap-${code}`, `Programme ${gap.programme_code}: on a page missing from the PDF`, String(missing))]
      : [];
  };
  const leaf = (id: string, name: string, sen: string): SankeyNode => ({ id, displayName: name, amount: rm(sen) });
  const programmeLeaves = (code: string | null) =>
    programmes
      .filter((p) => p.vote_code === code)
      .map((p) =>
        leaf(
          `op-${p.vote_code}-${p.programme_code}`,
          titleCase(p.programme_name ?? `Programme ${p.programme_code}`),
          p.actual_sen,
        ),
      );
  const developmentLeaves = (code: string | null) =>
    development
      .filter((d) => d.vote_code === code)
      .map((d, i) =>
        leaf(
          `dev-${d.vote_code}-${i}`,
          d.group_name ? `Development: ${titleCase(d.group_name)}` : "Development projects",
          d.actual_sen,
        ),
      );

  // One node per ministry, operating and development together, as on the ministry pages.
  const ministryNodes: SankeyNode[] = ministries.map((m) => ({
    id: `m-${m.body_id}`,
    displayName: shortName(m.name_ms),
    searchName: titleCase(m.name_ms),
    link: `/ministries/${slugify(m.body_name_ms)}`,
    children: [
      ...programmeLeaves(m.operating_vote_code),
      ...gapLeaves(m.operating_vote_code),
      ...developmentLeaves(m.development_vote_code),
    ],
  }));

  const charged = [...new Set(programmes.filter((p) => p.section === "charged").map((p) => p.vote_code))].map(
    (code) => {
      const rows = programmes.filter((p) => p.vote_code === code);
      return {
        id: `op-${code}`,
        displayName: CHARGED_NAMES[code] ?? titleCase(rows[0].vote_name),
        searchName: titleCase(rows[0].vote_name),
        link: `/${year}/vote/${code.replace(".", "")}`,
        children: programmeLeaves(code),
      };
    },
  );

  // Ministries under MINISTRY_SHARE of spending share one block, so the large ones can be read at a glance.
  const spent = ministryNodes.reduce((t, m) => t + total(m), 0) + charged.reduce((t, c) => t + total(c), 0);
  const major = ministryNodes.filter((m) => total(m) >= spent * MINISTRY_SHARE);
  const minor = ministryNodes.filter((m) => total(m) < spent * MINISTRY_SHARE && total(m) > 0);
  const children: SankeyNode[] = [
    { id: "charged", displayName: "Charged: debt, pensions, grants to states", children: charged },
    ...major,
    ...(minor.length ? [{ id: "m-other", displayName: `${minor.length} other ministries`, children: minor }] : []),
  ];
  const covidSpent = covid.filter((c) => rm(c.actual_sen) > 0);
  if (covidSpent.length) {
    children.push({
      id: "covid",
      displayName: "COVID-19 Fund",
      link: `/${year}/covid`,
      children: covidSpent.map((c) => leaf(`covid-${c.code}`, c.name_ms, c.actual_sen)),
    });
  }
  const tree = prune({ id: "spending", displayName: "Spending", children });
  return groupSmall(tree, total(tree) * SMALL_SHARE);
}

/** Charged votes named in plain English on the chart; the printed name stays searchable. */
const CHARGED_NAMES: Record<string, string> = {
  "T.13": "Debt charges",
  "T.14": "Pensions and gratuities",
  "T.12": "Treasury: grants to states",
};

/** Below this share of the side's total, siblings are gathered under one "Other" node. */
export const SMALL_SHARE = 0.008;
/** Ministries below this share of spending are gathered at the top level. */
const MINISTRY_SHARE = 0.03;

const total = (n: SankeyNode): number => n.amount ?? (n.children ?? []).reduce((s, c) => s + total(c), 0);

/**
 * Gathers small siblings into one "Other (n)" node so every block on the chart is tall enough to label.
 * The gathered nodes stay as its children, so search and drill-down still reach them.
 */
export function groupSmall(node: SankeyNode, min: number, otherLabel = "Other"): SankeyNode {
  if (!node.children) return node;
  const children = node.children.map((c) => groupSmall(c, min));
  const small = children.filter((c) => total(c) < min);
  if (small.length < 2) return { ...node, children };
  return {
    ...node,
    children: [
      ...children.filter((c) => total(c) >= min),
      { id: `${node.id}-other`, displayName: `${otherLabel} (${small.length})`, children: small },
    ],
  };
}

/** "KEMENTERIAN PENDIDIKAN TINGGI" -> "Pendidikan Tinggi": the ministry's subject, for chart labels. */
export function shortName(name: string): string {
  const t = titleCase(name).replace(/^Kementerian /, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Drops branches that end up empty (votes with nothing spent). */
function prune(node: SankeyNode): SankeyNode {
  if (!node.children) return node;
  const children = node.children.map(prune).filter((c) => c.amount !== undefined || (c.children?.length ?? 0) > 0);
  return { ...node, children };
}

const SMALL = new Set(["dan", "di", "ke", "bagi", "untuk", "serta", "atau", "kepada", "yang"]);

/** "KEMENTERIAN PENDIDIKAN TINGGI" -> "Kementerian Pendidikan Tinggi"; mixed case is kept. */
export function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (i > 0 && SMALL.has(w)) return w;
      if (/^([a-z]\.)+$/.test(w)) return w.toUpperCase(); // initials such as S.P.B.
      if (/^\(?[a-z]{2,5}\)?$/.test(w) && /^\(/.test(w)) return w.toUpperCase(); // acronyms in brackets
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
