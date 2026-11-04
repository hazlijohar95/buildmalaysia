// Home page in the style of buildcanada.com (dark grid hero, boxed sections) with CanadaSpends'
// content blocks (MIT, Build Canada). Every figure is read from the loaded documents.
import type { Metadata } from "next";
import Link from "next/link";
import { LuReceipt, LuUsersRound } from "react-icons/lu";
import { PiBank } from "react-icons/pi";
import { H3, P } from "@/components/Layout";
import CitationLink from "@/components/CitationLink";
import { getFederalSpending } from "@/lib/queries/spending";
import { getRevenueTotal } from "@/lib/queries/revenue";
import { getBudgetTotals, getBudgetYears } from "@/lib/queries/budget";
import { getLoadedYears } from "@/lib/years";
import { formatSenCompact, parseSen } from "@/lib/money";

export const metadata: Metadata = { title: { absolute: "Build Malaysia: the facts about government spending" } };

const rule = "bg-linen-50/15";

function Arc({ className }: { className: string }) {
  return (
    <div aria-hidden className={`absolute ${className}`}>
      <div className="h-full w-full rounded-full border border-linen-50/25" />
      <div className="absolute inset-[14%] rounded-full border border-linen-50/15" />
    </div>
  );
}

const buttonBase =
  "inline-flex items-center px-6 py-3.5 font-mono text-[13px] uppercase tracking-[0.22em] no-underline border-2 border-foreground transition-colors";

export default async function HomePage() {
  const [[latest], [budgetYear]] = await Promise.all([getLoadedYears(), getBudgetYears()]);
  const [spending, revenue, budget] = await Promise.all([
    latest ? getFederalSpending(latest) : null,
    latest ? getRevenueTotal(latest) : null,
    budgetYear ? getBudgetTotals(budgetYear) : [],
  ]);
  const tabled = budget.at(-1);

  return (
    <>
      <section className="p-2 md:p-4 border-b-2 border-foreground">
        <div className="relative overflow-hidden bg-charcoal-1000 text-linen-50 min-h-[460px] md:min-h-[620px] flex items-center">
          <div aria-hidden className={`absolute inset-y-0 left-[7%] w-px ${rule}`} />
          <div aria-hidden className={`absolute inset-y-0 right-[7%] w-px ${rule}`} />
          <Arc className="-left-[120px] top-[10%] h-[240px] w-[240px]" />
          <Arc className="-right-[120px] bottom-[6%] h-[240px] w-[240px]" />
          <h1 className="relative w-full m-0 text-center font-display font-medium tracking-tight leading-[1.08] text-[2.75rem] sm:text-[4.5rem] lg:text-[6.5rem]">
            <span className="block">Building a</span>
            <span className="block border-y border-linen-50/15">
              <span className="text-transparent [-webkit-text-stroke:1.5px_var(--color-linen-50)]">Better</span>{" "}
              Malaysia.
            </span>
          </h1>
        </div>
      </section>

      <section className="border-b-2 border-foreground">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,460px)]">
          <div className="px-6 py-14 md:px-16 lg:px-24 lg:py-20">
            <h2 className="font-display text-4xl md:text-5xl font-semibold tracking-tight m-0">You deserve the facts.</h2>
            <p className="mt-4 text-xl md:text-2xl leading-relaxed">
              Government spending shouldn&apos;t be a black box.
            </p>
            <p className="mt-6 text-lg leading-relaxed font-semibold">
              Build Malaysia turns the federal government&apos;s official accounts into clear, accurate facts, so every
              Malaysian can see where public money comes from and where it goes.
            </p>
            <p className="mt-4 text-lg leading-relaxed">
              The figures are public, in the Accountant General&apos;s audited financial statements and the Ministry of
              Finance&apos;s budget books, but they run to hundreds of pages of tables in Bahasa Malaysia that few people
              ever read. Every total those documents print is recomputed from its line items before we publish it, and
              every number links to the page it came from.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/spending" className={`${buttonBase} bg-foreground text-background hover:bg-charcoal-800`}>
                Federal spending
              </Link>
              {budgetYear && (
                <Link href={`/budget/${budgetYear}`} className={`${buttonBase} text-foreground hover:bg-linen-200`}>
                  Budget {budgetYear}
                </Link>
              )}
              <Link href="/ministries" className={`${buttonBase} text-foreground hover:bg-linen-200`}>
                Ministries
              </Link>
            </div>
          </div>

          {spending && latest && (
            <aside className="bg-auburn-800 text-linen-50 px-8 py-14 md:px-12 lg:py-20 flex flex-col justify-center gap-8">
              <div className="font-mono text-[13px] uppercase tracking-[0.22em] text-linen-200">
                The federal accounts, {latest}
              </div>
              {revenue && (
                <div>
                  <div className="font-display text-5xl font-semibold tracking-tight">
                    {formatSenCompact(revenue.actual_sen)}
                  </div>
                  <div className="mt-1 text-lg text-linen-100">raised in revenue</div>
                </div>
              )}
              <div>
                <div className="font-display text-5xl font-semibold tracking-tight">
                  {formatSenCompact(spending.total_actual_sen)}
                </div>
                <div className="mt-1 text-lg text-linen-100">spent</div>
              </div>
              {revenue && spending.total_actual_sen > revenue.actual_sen && (
                <div>
                  <div className="font-display text-5xl font-semibold tracking-tight">
                    {formatSenCompact(parseSen(spending.total_actual_sen - revenue.actual_sen))}
                  </div>
                  <div className="mt-1 text-lg text-linen-100">more spent than raised</div>
                </div>
              )}
              <div className="text-sm text-linen-200">
                Jabatan Akauntan Negara, <em>Penyata Kewangan Kerajaan Persekutuan {latest}</em>
                {revenue && (
                  <>
                    {" "}
                    (revenue:{" "}
                    <CitationLink year={latest} docUrl={revenue.doc_url} pdfPage={revenue.pdf_page} bookPage={revenue.book_page} className="text-linen-50 underline" />
                    )
                  </>
                )}
              </div>
            </aside>
          )}
        </div>
      </section>

      <section className="border-b-2 border-foreground">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {[
            {
              icon: <PiBank />,
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
            <div
              key={p.title}
              className="flex flex-col gap-2 px-8 py-14 border-b-2 md:border-b-0 md:border-r-2 last:border-0 border-foreground"
            >
              <div className="text-4xl mb-4">{p.icon}</div>
              <H3>{p.title}</H3>
              <P>{p.body}</P>
            </div>
          ))}
        </div>
      </section>

      {spending && latest && (
        <section className="border-b-2 border-foreground">
          <div className="grid grid-cols-2 lg:grid-cols-4">
            {[
              { label: `Spent in ${latest}`, value: formatSenCompact(spending.total_actual_sen), href: "/spending" },
              { label: "Operating", value: formatSenCompact(spending.operating_net_actual_sen), href: `/${latest}` },
              { label: "Development", value: formatSenCompact(spending.development_actual_sen), href: `/${latest}` },
              ...(tabled && budgetYear
                ? [{ label: `Budget ${budgetYear} as tabled`, value: formatSenCompact(tabled.grand_total_sen), href: `/budget/${budgetYear}` }]
                : []),
            ].map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className="group px-8 py-10 border-r-2 border-b-2 lg:border-b-0 border-foreground last:border-r-0 no-underline text-foreground hover:bg-linen-200"
              >
                <div className="font-mono text-[12px] uppercase tracking-[0.22em] text-charcoal-700">{s.label}</div>
                <div className="mt-3 font-display text-4xl font-semibold tracking-tight">{s.value}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
