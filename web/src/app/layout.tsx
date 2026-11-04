import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Header, { type NavItem } from "@/components/MainLayout/Header";
import Footer from "@/components/MainLayout/Footer";
import { getLoadedYears } from "@/lib/years";
import { getBudgetYears } from "@/lib/queries/budget";

const body = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
// Cal Sans (calcom/font) and Paper Mono (paper-design/paper-mono), both SIL OFL 1.1.
const sans = localFont({ src: "../assets/fonts/CalSansVF.woff2", weight: "400 700", variable: "--font-cal-sans", display: "swap" });
const mono = localFont({ src: "../assets/fonts/PaperMono-VF.woff2", weight: "100 800", variable: "--font-paper-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Build Malaysia: the facts about government spending", template: "%s | Build Malaysia" },
  description:
    "How the Malaysian federal government budgets and spends public money, from the audited statements and the budget books. Every figure links to the page it came from.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [[latest], [budget]] = await Promise.all([getLoadedYears(), getBudgetYears()]);
  const items: NavItem[] = [
    { href: "/", label: "Home", match: "/" },
    { href: "/spending", label: "Spending", match: "/spending" },
    { href: "/ministries", label: "Ministries", match: "/ministries" },
    ...(budget ? [{ href: `/budget/${budget}`, label: "Budget", match: "/budget" }] : []),
    ...(latest ? [{ href: `/${latest}`, label: "By year", match: `/${latest}` }] : []),
  ];
  return (
    <html lang="en" className={`${body.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen p-2 md:p-4">
        <div className="min-h-[calc(100vh-1rem)] md:min-h-[calc(100vh-2rem)] border-2 border-foreground flex flex-col">
          <Header items={items} cta={{ href: "/methodology", label: "Methodology", match: "/methodology" }} />
          <main className="flex-1">{children}</main>
          <Footer spendingYear={latest} budgetYear={budget} />
        </div>
      </body>
    </html>
  );
}
