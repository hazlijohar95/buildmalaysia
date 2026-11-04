// Adapted from CanadaSpends' Footer (MIT, Build Canada).
import Link from "next/link";
import { Wordmark } from "./Header";

const FooterLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="text-sm/6 hover:text-primary no-underline">
    {children}
  </Link>
);

export default function Footer({ spendingYear, budgetYear }: { spendingYear?: number; budgetYear?: number }) {
  return (
    <footer className="border-t-2 border-solid border-t-foreground bg-foreground text-background">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mx-auto max-w-7xl px-6 pb-8 pt-20 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div>
              <span className="inline-block bg-auburn-800 px-4 py-3 text-linen-50">
                <Wordmark className="text-[26px]" />
              </span>
              <p className="mt-4 text-sm/6 text-linen-200 max-w-xs">
                How the Malaysian federal government budgets and spends, from the official documents, with every figure
                linked to its page.
              </p>
            </div>
            <ul role="list" className="space-y-3">
              {[
                { href: "/spending", label: "Spending" },
                { href: "/revenue", label: "Revenue" },
                { href: "/ministries", label: "Ministries" },
                { href: "/tax", label: "Your taxes" },
                ...(budgetYear ? [{ href: `/budget/${budgetYear}`, label: `Budget ${budgetYear}` }] : []),
                ...(spendingYear ? [{ href: `/${spendingYear}`, label: "By year" }] : []),
                { href: "/methodology", label: "Methodology" },
              ].map((l) => (
                <li key={l.href}>
                  <FooterLink href={l.href}>{l.label}</FooterLink>
                </li>
              ))}
            </ul>
            <div className="text-sm/6 text-linen-200 space-y-2">
              <p>
                Data: Jabatan Akauntan Negara Malaysia, <em>Penyata Kewangan Kerajaan Persekutuan</em>; Kementerian
                Kewangan, <em>Anggaran Perbelanjaan Persekutuan</em>.
              </p>
              <p>
                Design adapted from Build Canada&apos;s{" "}
                <a href="https://github.com/BuildCanada/CanadaSpends" className="underline hover:text-primary">
                  CanadaSpends
                </a>{" "}
                (MIT). Not affiliated with Build Canada.
              </p>
            </div>
          </div>
          <div className="mt-16 border-t border-background/20 pt-8 text-sm/6 text-linen-300">
            Non-partisan. Every number comes from a public government document and links to the page it was read from.
          </div>
        </div>
      </div>
    </footer>
  );
}
