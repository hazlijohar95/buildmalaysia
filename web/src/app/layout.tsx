import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Header, { type NavItem } from "@/components/MainLayout/Header";
import Footer from "@/components/MainLayout/Footer";
import { getLoadedYears } from "@/lib/years";
import { getCovidYears } from "@/lib/queries/covid";
import { getBudgetTotals, getBudgetYears } from "@/lib/queries/budget";
import { formatSenCompact } from "@/lib/money";

const body = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
// Cal Sans (calcom/font) and Paper Mono (paper-design/paper-mono), both SIL OFL 1.1.
const sans = localFont({
  src: "../assets/fonts/CalSansVF.woff2",
  weight: "400 700",
  variable: "--font-cal-sans",
  display: "swap",
});
const mono = localFont({
  src: "../assets/fonts/PaperMono-VF.woff2",
  weight: "100 800",
  variable: "--font-paper-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Build Malaysia: the facts about government spending", template: "%s | Build Malaysia" },
  description:
    "How the Malaysian federal government budgets and spends public money, from the audited statements and the budget books. Every figure links to the page it came from.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [years, budgets, [covidYear]] = await Promise.all([getLoadedYears(), getBudgetYears(), getCovidYears()]);
  const [latest] = years;
  const budgetTotals = await Promise.all(budgets.map((b) => getBudgetTotals(b)));
  // Each book's grand total for the year it budgets, as tabled.
  const tabled = new Map(budgets.map((b, i) => [b, budgetTotals[i].find((t) => t.fiscal_year === b)]));
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
                note: "Running costs, vote by vote",
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
      ...(latest && {
        years: {
          title: "By year",
          links: years.map((y) => ({ href: `/${y}`, label: String(y), match: [`/${y}`] })),
        },
      }),
    },
    { kind: "link", href: "/revenue", label: "Revenue", match: ["/revenue"] },
    ...(budgets.length > 0
      ? [
          {
            kind: "menu" as const,
            label: "Budget",
            links: budgets.map((b) => {
              const book = tabled.get(b);
              return {
                href: `/budget/${b}`,
                label: `Budget ${b}`,
                note: book ? `${formatSenCompact(book.grand_total_sen)} as tabled` : `The ${b} estimates`,
                match: [`/budget/${b}`],
              };
            }),
          },
        ]
      : []),
    { kind: "link", href: "/methodology", label: "Methodology", match: ["/methodology"] },
    { kind: "link", href: "/about", label: "About", match: ["/about"] },
  ];
  return (
    <html lang="en" className={`${body.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen p-[10px]">
        <div className="min-h-[calc(100vh-20px)] border-x-2 border-b-2 border-foreground flex flex-col">
          <div aria-hidden className="fixed inset-x-0 top-0 z-40 h-[10px] bg-background" />
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:bg-foreground focus:px-4 focus:py-3 focus:text-background"
          >
            Skip to content
          </a>
          <Header items={items} cta={{ href: "/tax", label: "Your taxes", match: ["/tax"] }} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer spendingYear={latest} budgetYear={budgets[0]} />
        </div>
      </body>
    </html>
  );
}
