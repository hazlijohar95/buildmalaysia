// Laid out after buildcanada.com/about: a split hero, an anchor row, numbered principles and a two-column FAQ.
// The coverage figures are counted live from the database.
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Band, H2, StatRow, kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";
import { CONTACT_EMAIL } from "@/lib/contact";
import { getCoverage } from "@/lib/queries/coverage";
import { LuUsersRound } from "react-icons/lu";
import { SiClaude } from "react-icons/si";

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

interface Member {
  name: string;
  role: string;
  aside?: string; // set smaller after the role, on the same line
  portrait: React.ReactNode; // fills the card's square: a photo, or a mark when there is none yet
}

// Portraits are cropped square and graded warm and slightly muted, so they sit together on the linen page.
const photo = (src: string, alt: string) => (
  <Image src={src} alt={alt} width={224} height={224} className="h-full w-full object-cover" />
);

const TEAM: Member[] = [
  { name: "Hazli Johar", role: "Chief Designer & Maintainer", portrait: photo("/team/hazli-johar.jpg", "Hazli Johar") },
  {
    name: "Claude Code Ultra",
    role: "Principal Engineer",
    aside: "($200, 10x usage)",
    portrait: (
      <span className="flex h-full w-full items-center justify-center bg-linen-50">
        <SiClaude aria-hidden="true" className="h-14 w-14 text-[#D97757]" />
      </span>
    ),
  },
  { name: "Mochi", role: "Chief Morale Officer", portrait: photo("/team/mochi.jpg", "Mochi the cat, asleep") },
];

const sections = [
  { id: "team", label: "Core team" },
  { id: "board", label: "Board" },
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
      q: "Are you a partisan group?",
      a: "No. Build Malaysia does not support or oppose any party, politician or government. It publishes what the government's own documents say, the same way whoever is in power.",
    },
    {
      q: "Is this a lobby group?",
      a: "No. We don't argue for or against any policy or spending decision. The aim is a shared set of facts that anyone can argue from.",
    },
    {
      q: "Why are you doing this?",
      a: "Because public money is public. The records already exist, audited and published, but almost nobody can read them. A country argues better about where it should go when everyone can see where the money went.",
    },
    {
      q: "How is Build Malaysia funded?",
      a: "Build Malaysia is self-funded by its founders and takes no government or political money.",
    },
    {
      q: "How can I contact you?",
      a: (
        <>
          Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If a figure looks wrong, send the page you saw
          it on; we check it against the source document and correct or explain it on the{" "}
          <Link href="/methodology">methodology page</Link>.
        </>
      ),
    },
    {
      q: "Where do the numbers come from?",
      a: (
        <>
          Two sets of official documents: Jabatan Akauntan Negara&apos;s{" "}
          <em lang="ms">Penyata Kewangan Kerajaan Persekutuan</em>, the audited federal statements, for what was raised
          and spent{c.years && ` from ${c.years.first} to ${c.years.last}`}; and Kementerian Kewangan&apos;s{" "}
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
      <Band wide className="py-14 md:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-0">
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
      </Band>

      <nav aria-label="On this page" className="border-b-2 border-foreground px-5 sm:px-8 md:px-16">
        <ul className="mx-auto m-0 flex max-w-7xl list-none flex-wrap gap-x-8 p-0">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={cn(
                  kicker,
                  "inline-flex min-h-12 items-center text-charcoal-700 no-underline hover:text-biru-800",
                )}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Band id="team" wide>
        <H2>Core team</H2>
        <ul className="m-0 mt-10 grid list-none gap-6 p-0 lg:grid-cols-2 xl:grid-cols-3">
          {TEAM.map((m) => (
            <li key={m.name} className="flex border border-foreground/40">
              <div className="h-28 w-28 shrink-0 overflow-hidden border-r border-foreground/40">{m.portrait}</div>
              <div className="flex min-w-0 flex-1 flex-col px-5 py-4">
                <span className="font-display text-2xl font-semibold tracking-tight">{m.name}</span>
                <span className="mt-1 text-sm text-charcoal-700">
                  {m.role}
                  {m.aside && <span className="mt-0.5 block text-xs text-charcoal-600">{m.aside}</span>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Band>

      <Band id="board" wide>
        <H2>Board</H2>
        <div className="mt-10 flex flex-col border border-foreground/40 sm:flex-row">
          <div className="flex h-28 shrink-0 items-center justify-center bg-foreground text-linen-50 sm:h-auto sm:w-56">
            <LuUsersRound aria-hidden="true" className="h-12 w-12" />
          </div>
          <div className="px-6 py-6 md:px-8 md:py-8">
            <span className="font-display text-2xl font-semibold tracking-tight">The Rakyat</span>
            <span className="mt-1 block text-charcoal-700">Every Malaysian · Board of journalists</span>
            <p className="m-0 mt-5 max-w-3xl text-lg leading-relaxed text-charcoal-800">
              Our board is every one of us. We believe every Malaysian has a fiduciary duty to the truth: to report what
              happened, and to count what should be counted. That makes all of us journalists, held to a
              journalist&apos;s ethics. This site is our part of the count.
            </p>
          </div>
        </div>
      </Band>

      <Band id="principles" wide>
        <H2>Principles</H2>
        <ol className="m-0 mt-10 grid list-none gap-x-12 p-0 md:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} className="flex gap-6 border-t border-foreground/25 pb-10 pt-6">
              <span className="font-display text-2xl font-semibold tabular-nums text-merah-600">
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

      <Band id="coverage" wide className="pb-10 md:pb-12">
        <H2>What we&apos;ve read</H2>
        <p className="m-0 mt-4 max-w-3xl text-lg text-charcoal-800">
          Everything loaded so far, counted live. Each check is listed on the{" "}
          <Link href="/methodology">methodology page</Link>.
        </p>
      </Band>
      <StatRow
        stats={[
          {
            label: "Audited statements",
            value: c.statements,
            sub: c.years ? `FY${c.years.first} to FY${c.years.last}` : "None loaded yet",
          },
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

      <Band id="faqs" wide>
        <H2>FAQs</H2>
        <div className="mt-10 grid gap-x-12 md:grid-cols-2">
          {[faqs.slice(0, half), faqs.slice(half)].map((column, i) => (
            <div key={i}>
              {column.map((f) => (
                <details
                  key={f.q}
                  className={cn(
                    "reveal group border-b border-foreground/25",
                    i === 0 ? "first:border-t" : "md:first:border-t",
                  )}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-lg font-semibold tracking-tight [&::-webkit-details-marker]:hidden hover:text-biru-800">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="text-xs text-biru-800 motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180"
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
