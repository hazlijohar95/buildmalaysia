import sql from "@/lib/db";
import type { SankeyNode } from "@/components/Sankey/SankeyChartD3";
import { slugify } from "@/lib/slug";

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
    sql<{ number: string; name_ms: string; operating_vote_code: string | null; development_vote_code: string | null }[]>`
      select number, name_ms, operating_vote_code, development_vote_code from ministry_spending where fiscal_year = ${year}
    `,
  ]);

  const ministryLink = new Map<string, string>();
  for (const m of ministries) {
    const link = `/ministries/${slugify(m.name_ms)}`;
    if (m.operating_vote_code) ministryLink.set(m.operating_vote_code, link);
    if (m.development_vote_code) ministryLink.set(m.development_vote_code, link);
  }

  const byVote = <R extends { vote_code: string; vote_name: string }>(rows: R[]) => {
    const groups = new Map<string, R[]>();
    for (const r of rows) groups.set(r.vote_code, [...(groups.get(r.vote_code) ?? []), r]);
    return [...groups.entries()];
  };

  const voteNode = (prefix: string, code: string, name: string, children: SankeyNode[]): SankeyNode => ({
    id: `${prefix}-${code}`,
    displayName: titleCase(name),
    link: ministryLink.get(code) ?? `/${year}/vote/${code.replace(".", "")}`,
    children,
  });

  const operatingVotes = (section: "charged" | "supply") =>
    byVote(programmes.filter((p) => p.section === section)).map(([code, rows]) =>
      voteNode(
        "op",
        code,
        rows[0].vote_name,
        rows
          .filter((r) => rm(r.actual_sen) > 0)
          .map((r) => ({
            id: `op-${code}-${r.programme_code}`,
            displayName: titleCase(r.programme_name ?? `Programme ${r.programme_code}`),
            amount: rm(r.actual_sen),
          })),
      ),
    );

  const developmentVotes = byVote(development).map(([code, rows]) =>
    voteNode(
      "dev",
      code,
      rows[0].vote_name,
      rows
        .filter((r) => rm(r.actual_sen) > 0)
        .map((r, i) => ({
          id: `dev-${code}-${i}`,
          displayName: titleCase(r.group_name ?? rows[0].vote_name),
          amount: rm(r.actual_sen),
        })),
    ),
  );

  const children: SankeyNode[] = [
    {
      id: "operating",
      displayName: "Operating (Mengurus)",
      link: `/${year}/operating`,
      children: [
        { id: "charged", displayName: "Charged: debt service, pensions, grants to states", children: operatingVotes("charged") },
        ...operatingVotes("supply"),
      ],
    },
    { id: "development", displayName: "Development (Pembangunan)", link: `/${year}/development`, children: developmentVotes },
  ];
  const covidSpent = covid.filter((c) => rm(c.actual_sen) > 0);
  if (covidSpent.length) {
    children.push({
      id: "covid",
      displayName: "COVID-19 Fund",
      link: `/${year}/covid`,
      children: covidSpent.map((c) => ({ id: `covid-${c.code}`, displayName: c.name_ms, amount: rm(c.actual_sen) })),
    });
  }
  return prune({ id: "spending", displayName: "Spending", children });
}

/** Drops branches that end up empty (votes with nothing spent). */
function prune(node: SankeyNode): SankeyNode {
  if (!node.children) return node;
  const children = node.children.map(prune).filter((c) => c.amount !== undefined || (c.children?.length ?? 0) > 0);
  return { ...node, children };
}

const SMALL = new Set(["dan", "di", "ke", "bagi", "untuk", "serta", "atau", "kepada", "dalam", "yang"]);

/** "KEMENTERIAN PENDIDIKAN TINGGI" -> "Kementerian Pendidikan Tinggi"; mixed case is kept. */
export function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (i > 0 && SMALL.has(w)) return w;
      if (/^\(?[a-z]{2,5}\)?$/.test(w) && /^\(/.test(w)) return w.toUpperCase(); // acronyms in brackets
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
