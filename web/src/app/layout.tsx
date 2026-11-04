import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Build Malaysia", template: "%s | Build Malaysia" },
  description:
    "How the Malaysian federal government budgets and spends public money. Every figure links to the page of the official source document.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen font-sans text-sm">
        <header className="border-b" style={{ borderColor: "var(--border)" }}>
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="font-semibold text-base no-underline" style={{ color: "var(--fg)" }}>
              Build Malaysia
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/2025/operating" style={{ color: "var(--muted)" }}>
                Operating
              </Link>
              <Link href="/2025/development" style={{ color: "var(--muted)" }}>
                Development
              </Link>
              <Link href="/methodology" style={{ color: "var(--muted)" }}>
                Methodology
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        <footer
          className="border-t mt-16 py-6 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          <div className="max-w-6xl mx-auto px-4">
            Data: Jabatan Akauntan Negara Malaysia,{" "}
            <em>Penyata Kewangan Kerajaan Persekutuan 2025</em>.{" "}
            <a
              href="https://www.anm.gov.my/images/JANM/Webmaster/BPOPA/Penyata-Kewangan/2025_Penyata_Kewangan_Kerajaan_Persekutuan.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official PDF
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
