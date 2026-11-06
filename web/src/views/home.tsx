// Home page in the style of buildcanada.com (dark grid hero, boxed sections) with CanadaSpends'
// content blocks (MIT, Build Canada). Every figure is read from the loaded documents.
import { LuLandmark, LuReceipt, LuUsersRound } from "react-icons/lu";
import { Band, H2, StatRow, kicker } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";
import Findings from "@/components/Findings";
import { SubscribeForm } from "@/components/SubscribeForm";
import { cn } from "@/lib/cn";
import { formatSen, formatSenCompact, parseSen } from "@/lib/money";
import { getBudgetTotals, getBudgetYears } from "@/lib/queries/budget";
import { getRevenueTotal } from "@/lib/queries/revenue";
import { getFederalSpending } from "@/lib/queries/spending";
import { getLoadedYears } from "@/lib/years";
import Streamed from "@/components/Streamed";
import type { Page } from "@/lib/route";

function Arc({ className }: { className: string }) {
  return (
    <div aria-hidden className={`absolute ${className}`}>
      <div className="h-full w-full rounded-full border border-linen-50/25" />
      <div className="absolute inset-[14%] rounded-full border border-linen-50/15" />
    </div>
  );
}

const button = cn(kicker, "inline-flex min-h-12 items-center px-6 py-3.5 no-underline border-2 transition-colors");

export default function homePage(): Page {
  return { head: {}, body: <Streamed load={HomeBody} /> };
}

// Loads in the body, so the layout and its skeleton stream before the figures arrive.
async function HomeBody() {
  const [[latest], [budgetYear]] = await Promise.all([getLoadedYears(), getBudgetYears()]);
  const [spending, revenue, budget] = await Promise.all([
    latest ? getFederalSpending(latest) : null,
    latest ? getRevenueTotal(latest) : null,
    budgetYear ? getBudgetTotals(budgetYear) : [],
  ]);
  const tabled = budget.at(-1);
  // The budget book's own actual for the latest year, counted the same way as its estimate.
  const bookActual = [...budget].reverse().find((b) => b.basis === "actual");
  const gap = spending && revenue ? spending.total_actual_sen - revenue.actual_sen : null;

  return (
    <>
      <section className="p-2 md:p-4 border-b-2 border-foreground">
        <div className="relative overflow-hidden bg-charcoal-1000 text-linen-50 px-5 py-14 sm:px-10 md:py-20 [--focus-ring:var(--color-kuning)]">
          <div aria-hidden className="absolute inset-y-0 left-[6%] w-px bg-linen-50/15" />
          <div aria-hidden className="absolute inset-y-0 right-[6%] w-px bg-linen-50/15" />
          <Arc className="-left-[120px] top-[6%] h-[240px] w-[240px]" />
          <Arc className="-right-[120px] bottom-[4%] h-[240px] w-[240px]" />
          <div className="relative">
            <h1 className="m-0 text-center font-display font-medium tracking-tight leading-[1.08] text-[2.5rem] sm:text-[4rem] lg:text-[5.5rem]">
              <span className="block">See where every</span>
              <span className="block border-y border-linen-50/15">
                <span className="text-transparent [-webkit-text-stroke:1.5px_var(--color-linen-50)]">ringgit</span>{" "}
                goes.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-center text-lg text-linen-200">
              Clear, sourced facts on how the federal government raises and spends public money.
            </p>

            {spending && latest && (
              <dl className="mx-auto mt-10 grid max-w-4xl grid-cols-1 sm:grid-cols-3 gap-[2px] bg-linen-50/20 border border-linen-50/20">
                {[
                  ...(revenue ? [{ k: `Raised in ${latest}`, v: revenue.actual_sen }] : []),
                  { k: `Spent in ${latest}`, v: spending.total_actual_sen },
                  ...(gap !== null && gap > 0 ? [{ k: "Borrowed to cover the gap", v: parseSen(gap) }] : []),
                ].map((s) => (
                  <div key={s.k} className="bg-charcoal-1000 px-6 py-5 text-center">
                    <dt className={cn(kicker, "text-linen-300")}>{s.k}</dt>
                    <dd
                      className="m-0 mt-2 font-display text-3xl md:text-4xl font-semibold tabular-nums"
                      title={formatSen(s.v)}
                    >
                      {formatSenCompact(s.v)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a
                href="/tax"
                className={cn(
                  button,
                  "border-merah-500 bg-merah-600 text-white hover:bg-merah-700 active:bg-merah-800",
                )}
              >
                Where your taxes go
              </a>
              <a
                href="/spending"
                className={cn(button, "border-linen-50/60 text-linen-50 hover:bg-linen-50/10 active:bg-linen-50/20")}
              >
                Where the money went
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-foreground">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,460px)]">
          <div className="px-5 py-14 sm:px-8 md:px-16 lg:px-24 lg:py-20">
            <H2 className="md:text-5xl">You deserve the facts.</H2>
            <p className="mt-4 text-xl md:text-2xl leading-relaxed">
              Government spending shouldn&apos;t be a black box.
            </p>
            <p className="mt-6 text-lg leading-relaxed">
              The figures are public, in the Accountant General&apos;s audited financial statements and the Ministry of
              Finance&apos;s budget books, but they run to hundreds of pages of tables in Bahasa Malaysia that few
              people ever read. Build Malaysia turns them into clear facts. Every total those documents print is
              recomputed from its line items before we publish it, and every number links to the page it came from.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              {[
                { href: "/revenue", label: "Revenue" },
                { href: "/ministries", label: "Ministries" },
                ...(budgetYear ? [{ href: `/budget/${budgetYear}`, label: `Budget ${budgetYear}` }] : []),
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className={cn(button, "border-foreground text-foreground hover:bg-linen-200 active:bg-linen-300")}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>

          {tabled && budgetYear && (
            <aside className="bg-biru-800 text-linen-50 px-5 py-14 sm:px-8 md:px-12 lg:py-20 flex flex-col justify-center gap-6 [--focus-ring:var(--color-kuning)]">
              <div className={cn(kicker, "text-linen-200")}>Budget {budgetYear}, as tabled</div>
              <div>
                <div
                  className="font-display text-5xl font-semibold tracking-tight"
                  title={formatSen(tabled.grand_total_sen)}
                >
                  {formatSenCompact(tabled.grand_total_sen)}
                </div>
                <div className="mt-1 text-lg text-linen-100">planned federal spending in {tabled.fiscal_year}</div>
              </div>
              {bookActual && (
                <p className="m-0 text-linen-100">
                  The same book puts {bookActual.fiscal_year} spending at {formatSenCompact(bookActual.grand_total_sen)}
                  , counted the same way, so the plan is{" "}
                  {(((tabled.grand_total_sen - bookActual.grand_total_sen) / bookActual.grand_total_sen) * 100).toFixed(
                    1,
                  )}
                  % higher. Its totals include the transfer to the Development Fund, which our spending figures count
                  once.
                </p>
              )}
              <div className="text-sm text-linen-200">
                Kementerian Kewangan, <em>Anggaran Perbelanjaan Persekutuan {budgetYear}</em>, book page{" "}
                {tabled.book_page}.{" "}
                <a href={`/budget/${budgetYear}`} className="text-linen-50 underline">
                  See the budget
                </a>
              </div>
            </aside>
          )}
        </div>
      </section>

      <section className="border-b-2 border-foreground grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-foreground">
        {[
          {
            icon: <LuLandmark />,
            title: "Facts about spending",
            body: "We turn the federal government's accounts into clear figures, ministry by ministry and programme by programme.",
          },
          {
            icon: <LuReceipt />,
            title: "Based on official documents",
            body: "Every figure comes from Jabatan Akauntan Negara's audited statements or Kementerian Kewangan's budget books, and links to the exact page.",
          },
          {
            icon: <LuUsersRound />,
            title: "Non-partisan",
            body: "We don't judge policies or debate spending decisions. Our only goal is that everyone can see how the federal government spends money.",
          },
        ].map((p) => (
          <div key={p.title} className="bg-background flex flex-col gap-3 px-6 py-12 md:px-8">
            <div className="text-4xl mb-2" aria-hidden>
              {p.icon}
            </div>
            <h3 className="m-0 font-display text-xl font-semibold">{p.title}</h3>
            <p className="m-0 text-charcoal-800">{p.body}</p>
          </div>
        ))}
      </section>

      {latest && <Findings year={latest} />}

      <Band className="bg-linen-200">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <H2>Know when new figures land.</H2>
          <SubscribeForm tone="light" />
        </div>
      </Band>

      {spending && latest && (
        <>
          <StatRow
            stats={[
              {
                label: `Spent in ${latest}`,
                value: formatSenCompact(spending.total_actual_sen),
                title: formatSen(spending.total_actual_sen),
              },
              {
                label: "Operating",
                value: formatSenCompact(spending.operating_net_actual_sen),
                title: formatSen(spending.operating_net_actual_sen),
              },
              {
                label: "Development",
                value: formatSenCompact(spending.development_actual_sen),
                title: formatSen(spending.development_actual_sen),
              },
              ...(revenue
                ? [
                    {
                      label: `Revenue ${latest}`,
                      value: formatSenCompact(revenue.actual_sen),
                      title: formatSen(revenue.actual_sen),
                    },
                  ]
                : []),
            ]}
          />
          <Band className="py-8 md:py-8">
            <p className="m-0 text-sm text-charcoal-700">
              Source: Jabatan Akauntan Negara, <em>Penyata Kewangan Kerajaan Persekutuan {latest}</em>
              {revenue && (
                <>
                  {" "}
                  (revenue:{" "}
                  <CitationLink
                    year={latest}
                    docUrl={revenue.doc_url}
                    pdfPage={revenue.pdf_page}
                    bookPage={revenue.book_page}
                  />
                  )
                </>
              )}
              . <a href="/methodology">How we check every number</a>
            </p>
          </Band>
        </>
      )}
    </>
  );
}
