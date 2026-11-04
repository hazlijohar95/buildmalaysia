// Laid out after buildcanada.com/about: a split hero, an anchor row, numbered principles and a two-column FAQ.
// The coverage figures are counted live from the database.
import type { Metadata } from "next";
import Link from "next/link";
import { Band, H2, StatRow, kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";
import { getCoverage } from "@/lib/queries/coverage";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "About",
  description: "Why Build Malaysia exists, the principles it is built on, and how it reads the public record.",
};

const PRINCIPLES = [
  {
    title: "Every number has a source.",
    body: "Each figure on the site links to the PDF page it was read from, so anyone can hold it up against the original.",
  },
  {
    title: "Check every total.",
    body: "Before a document is loaded, every total it prints is recomputed from its own rows. One unexplained difference and the load is rejected.",
  },
  {
    title: "Never fill a gap.",
    body: "When a page is missing or a table could only be read by OCR, we say so where it matters. No figure is estimated, or typed in to make a total fit.",
  },
  {
    title: "Show the documents' own mistakes.",
    body: "Where a statement misprints a total, the misprint is confirmed on the page and listed openly on our methodology page, not quietly corrected.",
  },
  {
    title: "Plain English, original terms.",
    body: "Explanations are in English, beside the Bahasa Malaysia terms each document prints, so every figure can be found again in its source.",
  },
  {
    title: "Non-partisan.",
    body: "We don't judge policies or argue for spending decisions. The aim is that anyone, of any view, can see how public money is raised and spent.",
  },
];

const sections = [
  { id: "principles", label: "Principles" },
  { id: "coverage", label: "What we've read" },
  { id: "faqs", label: "FAQs" },
];

export default async function AboutPage() {
  const c = await getCoverage();
  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: "What is Build Malaysia?",
      a: "A website that shows how the Malaysian federal government raises and spends public money, read directly from the audited financial statements and the budget books.",
    },
    {
      q: "Where do the numbers come from?",
      a: (
        <>
          Two sets of official documents: Jabatan Akauntan Negara&apos;s{" "}
          <em lang="ms">Penyata Kewangan Kerajaan Persekutuan</em>, the audited federal statements, for what was raised
          and spent from {c.firstYear} to {c.lastYear}; and Kementerian Kewangan&apos;s{" "}
          <em lang="ms">Anggaran Perbelanjaan Persekutuan</em>, the budget books, for what the government plans to
          spend. Each document is listed on the <Link href="/methodology">methodology page</Link> with a link to the
          original and its SHA-256 fingerprint.
        </>
      ),
    },
    {
      q: "How do you know the figures are right?",
      a: (
        <>
          Every total a document prints is recomputed from the rows beneath it, and the result of each check is shown
          live on the <Link href="/methodology">methodology page</Link>. Where the document itself is wrong, the
          misprint is listed there with its page.
        </>
      ),
    },
    {
      q: "Why doesn't your total match the budget speech?",
      a: "The budget books add operating and development spending as printed, and operating spending includes the transfer to the Development Fund, which then pays for development projects. Our spending figures count that money once. The budget pages show each book's totals exactly as printed.",
    },
    {
      q: "Are the figures adjusted for inflation?",
      a: "No. Every amount is in ringgit as printed in that year's document, so changes over time are before inflation.",
    },
    {
      q: "Does it cover state governments or government-linked companies?",
      a: "No. It covers the federal government's own accounts. States and government-linked companies publish separate accounts of their own.",
    },
    {
      q: "Is Build Malaysia part of Build Canada?",
      a: (
        <>
          No. The site&apos;s design and parts of its code are adapted from Build Canada&apos;s open-source{" "}
          <a href="https://github.com/BuildCanada/CanadaSpends">CanadaSpends</a> project, under its MIT licence. Build
          Malaysia is not affiliated with Build Canada.
        </>
      ),
    },
  ];
  const half = Math.ceil(faqs.length / 2);

  return (
    <>
      <section className="border-b-2 border-foreground px-5 py-14 sm:px-8 md:px-16 md:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:gap-0">
          <h1 className="m-0 self-center font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl lg:pr-12">
            Every ringgit should be easy to follow.
          </h1>
          <div className="flex flex-col gap-6 text-lg leading-relaxed text-charcoal-800 md:text-xl md:leading-relaxed lg:border-l lg:border-foreground/30 lg:pl-12">
            <p className="m-0">
              Malaysia&apos;s federal accounts are public. Every year the Accountant General publishes the audited
              financial statements, and the Ministry of Finance tables the budget in Parliament. Between them they
              record, to the sen, what the government planned to spend, what it actually spent, and where the money came
              from.
            </p>
            <p className="m-0">
              But they run to hundreds of pages of tables in Bahasa Malaysia that few people ever read. Build Malaysia
              reads them for you: it turns every table into clear figures, checks each one against the document&apos;s
              own totals, and links every number back to the page it came from.
            </p>
          </div>
        </div>
      </section>

      <nav aria-label="On this page" className="border-b-2 border-foreground px-5 sm:px-8 md:px-16">
        <ul className="mx-auto m-0 flex max-w-6xl list-none flex-wrap gap-x-8 p-0">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={cn(
                  kicker,
                  "inline-flex min-h-12 items-center text-charcoal-700 no-underline hover:text-auburn-800",
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Band id="principles">
        <H2>Principles</H2>
        <ol className="m-0 mt-10 grid list-none gap-x-12 p-0 md:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} className="flex gap-6 border-t border-foreground/25 pb-10 pt-6">
              <span className="font-display text-2xl font-semibold tabular-nums text-auburn-800">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="m-0 font-display text-2xl font-semibold tracking-tight">{p.title}</h3>
                <p className="m-0 mt-2 text-lg leading-relaxed text-charcoal-700">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Band>

      <Band id="coverage" className="pb-10 md:pb-12">
        <H2>What we&apos;ve read</H2>
        <p className="m-0 mt-4 max-w-3xl text-lg text-charcoal-800">
          Everything loaded so far, counted live. Each check is listed on the{" "}
          <Link href="/methodology">methodology page</Link>.
        </p>
      </Band>
      <StatRow
        stats={[
          { label: "Audited statements", value: c.statements, sub: `FY${c.firstYear} to FY${c.lastYear}` },
          { label: "Budget books", value: c.budgetBooks, sub: "As tabled in Parliament" },
          {
            label: "Line items",
            value: c.lineItems.toLocaleString("en-MY"),
            sub: "Read from the statements, to the sen",
          },
          {
            label: "Totals recomputed",
            value: c.totalsChecked.toLocaleString("en-MY"),
            sub: "Every printed total, from its own rows",
          },
        ]}
      />

      <Band id="faqs">
        <H2>FAQs</H2>
        <div className="mt-10 grid gap-x-12 md:grid-cols-2">
          {[faqs.slice(0, half), faqs.slice(half)].map((column, i) => (
            <div key={i}>
              {column.map((f) => (
                <details
                  key={f.q}
                  className={cn(
                    "group border-b border-foreground/25",
                    i === 0 ? "first:border-t" : "md:first:border-t",
                  )}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-lg font-semibold tracking-tight [&::-webkit-details-marker]:hidden hover:text-auburn-800">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="text-xs text-auburn-800 transition-transform duration-200 group-open:rotate-180"
                    >
                      ▼
                    </span>
                  </summary>
                  <div className="pb-6 text-lg leading-relaxed text-charcoal-800">{f.a}</div>
                </details>
              ))}
            </div>
          ))}
        </div>
      </Band>
    </>
  );
}
