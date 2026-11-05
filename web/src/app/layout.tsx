import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Header, { type NavItem } from "@/components/MainLayout/Header";
import Footer from "@/components/MainLayout/Footer";
import { getLoadedYears } from "@/lib/years";
import { getCovidYears } from "@/lib/queries/covid";
import { getTabledBooks } from "@/lib/queries/budget";
import { formatSenCompact } from "@/lib/money";
import { PALETTE } from "@/brand/carta";
import { brandFileUrl } from "@/brand/files";

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

// Every page renders from the database at request time, so a build never needs one;
// worker.ts caches the rendered pages.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://buildmalaysia.com"),
  title: { default: "Build Malaysia: the facts about government spending", template: "%s | Build Malaysia" },
  description:
    "How the Malaysian federal government budgets and spends public money, from the audited statements and the budget books. Every figure links to the page it came from.",
  icons: {
    icon: [{ url: brandFileUrl("icon.svg"), type: "image/svg+xml" }],
    apple: [{ url: brandFileUrl("apple-touch-icon.png"), sizes: "180x180" }],
  },
  openGraph: { siteName: "Build Malaysia", locale: "en_MY", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: PALETTE.biru.hex };

// Runs before first paint: the logo's intro plays on the first page view of a session, and never on a later one.
const INTRO_SCRIPT = `try{if(!sessionStorage.getItem("carta-intro")){sessionStorage.setItem("carta-intro","1");document.documentElement.setAttribute("data-intro","")}}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
    { kind: "link", href: "/about", label: "About", match: ["/about"] },
  ];
  return (
    <html lang="en" className={`${body.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      </head>
      <body className="min-h-screen p-[var(--frame)]">
        <div className="min-h-[calc(100vh-2*var(--frame))] border-x-2 border-b-2 border-foreground flex flex-col">
          <div aria-hidden className="fixed inset-x-0 top-0 z-40 h-[var(--frame)] bg-background" />
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
          <Footer spendingYear={latest} budgetYear={books[0]?.budget_year} />
        </div>
      </body>
    </html>
  );
}
