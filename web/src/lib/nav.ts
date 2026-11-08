import type { NavItem, NavLink } from "@/components/MainLayout/Header";
import { formatSenCompact } from "@/lib/money";
import { getCovidYears } from "@/lib/queries/covid";
import { getTabledBooks } from "@/lib/queries/budget";
import { getLoadedYears } from "@/lib/years";

export interface SiteNav {
  items: NavItem[];
  cta: NavLink;
  /** Newest fiscal year with both statements loaded. */
  latest?: number;
  /** Newest budget book tabled. */
  budgetYear?: number;
}

// The nav changes only when the database is reloaded, and rendered pages are already cached for an hour, so an
// isolate keeps it for five minutes. Most renders then stream the layout without waiting on a query, and a slow
// page's queries can't hold the header back.
const NAV_TTL_MS = 5 * 60_000;
let kept: { nav: SiteNav; at: number } | undefined;

/** The header's menus and the footer's links, built from what the database has loaded. */
export async function loadNav(): Promise<SiteNav> {
  if (kept && Date.now() - kept.at < NAV_TTL_MS) return kept.nav;
  const nav = await buildNav();
  kept = { nav, at: Date.now() };
  return nav;
}

async function buildNav(): Promise<SiteNav> {
  const [years, books, [covidYear]] = await Promise.all([getLoadedYears(), getTabledBooks(), getCovidYears()]);
  const [latest] = years;
  const items: NavItem[] = [
    {
      kind: "menu",
      label: "Spending",
      links: [
        {
          href: "/spending",
          label: "Where the money went",
          note: "Every ringgit, from the total to each ministry",
          match: ["/spending"],
        },
        {
          href: "/ministries",
          label: "Ministries",
          note: "What each ministry spent, year by year",
          match: ["/ministries"],
        },
        ...(latest
          ? [
              {
                href: `/${latest}/operating`,
                label: "Operating votes",
                note: "Operating spending, vote by vote",
                match: [],
              },
              {
                href: `/${latest}/development`,
                label: "Development projects",
                note: "Every project, with its budget and spending",
                match: [],
              },
            ]
          : []),
        {
          href: "/contracts",
          label: "Government contracts",
          note: "Every published tender and quotation award",
          match: ["/contracts"],
        },
        ...(covidYear
          ? [
              {
                href: `/${covidYear}/covid`,
                label: "COVID-19 Fund",
                note: "Pandemic relief, programme by programme",
                match: [],
              },
            ]
          : []),
      ],
      years: years.map((y) => ({ href: `/${y}`, label: String(y), match: [`/${y}`] })),
    },
    { kind: "link", href: "/revenue", label: "Revenue", match: ["/revenue"] },
    ...(books.length > 0
      ? [
          {
            kind: "menu" as const,
            label: "Budget",
            links: books.map(({ budget_year: b, grand_total_sen }) => ({
              href: `/budget/${b}`,
              label: `Budget ${b}`,
              note: grand_total_sen === null ? `The ${b} estimates` : `${formatSenCompact(grand_total_sen)} as tabled`,
              match: [`/budget/${b}`],
            })),
          },
        ]
      : []),
    { kind: "link", href: "/methodology", label: "Methodology", match: ["/methodology"] },
    { kind: "link", href: "/blog", label: "Blog", match: ["/blog"] },
    { kind: "link", href: "/about", label: "About", match: ["/about"] },
  ];
  return {
    items,
    cta: { href: "/tax", label: "Your taxes", match: ["/tax"] },
    latest,
    budgetYear: books[0]?.budget_year,
  };
}
