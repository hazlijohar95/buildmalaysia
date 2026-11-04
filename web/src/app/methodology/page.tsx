import type { Metadata } from "next";
import { getBudgetChecks, getPrintedMismatches, getSourceChecks } from "@/lib/queries/reconciliation";
import { formatSen, parseSen } from "@/lib/money";
import CitationLink from "@/components/CitationLink";

export const metadata: Metadata = {
  title: "Methodology",
};

export default async function MethodologyPage() {
  const [sources, misprints, budgets] = await Promise.all([getSourceChecks(), getPrintedMismatches(), getBudgetChecks()]);

  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Methodology</h1>

      <section className="mb-8 max-w-2xl space-y-4">
        <p>
          Every number on this site comes from the <strong>Penyata Kewangan Kerajaan Persekutuan</strong> (Federal
          Government Financial Statements), published each year by Jabatan Akauntan Negara Malaysia (JANM) and
          audited by the National Audit Department. The documents are public and freely downloadable from the JANM
          website.
        </p>

        <p>
          Operating spending comes from Lampiran 1, <em>Penyata Perbelanjaan Mengurus</em> (Statement of Operating
          Expenditure). For each vote it shows, by programme, activity and object group, the original estimate
          (Asal), supplementary allocation (Tambahan/(Kurangan)), virement (Viremen), revised total (Jumlah) and
          actual spending (Sebenar). Variance (Varian) and utilisation (% Prestasi) are derived from those columns
          and not stored. The printed % Prestasi sometimes contradicts its own row; the site computes it instead.
        </p>

        <p>
          Development spending comes from Lampiran 2, <em>Penyata Perbelanjaan Pembangunan</em> (Statement of
          Development Expenditure). Each row is printed across a two-page spread. The left page gives the project
          code, name, total cost and spending under the current Malaysia Plan up to the end of the previous year.
          The right page gives the year&apos;s estimate and actual spending, each split into direct (Cara
          Langsung) and loan-funded (Pinjaman), and plan spending to date. Within each row, previous plan spending
          plus the year&apos;s actual must equal plan spending to date, which also proves the two halves of the
          spread were paired correctly. 2021 is the first year of the Twelfth Malaysia Plan: its left column counts
          the Eleventh Plan to 2020 and its right column the Twelfth Plan, so there the year&apos;s actual must
          equal plan spending to date.
        </p>

        <p>
          From 2020 to 2023 the statements also include Lampiran 3, <em>Penyata Perbelanjaan Kumpulan Wang
          COVID-19</em>: the COVID-19 Fund&apos;s programmes, each with its ceiling, the year&apos;s allocation and
          spending, and spending since 2020. The fund was financed outside the operating account, so its spending
          adds to operating and development spending.
        </p>

        <p>
          Total federal spending is operating plus development, less the transfer from the operating account to
          the Development Fund (Kumpulan Wang Pembangunan). That fund pays for development spending, so the
          transfer would otherwise be counted twice. Operating, development and COVID-19 Fund spending for every
          loaded year match data.gov.my&apos;s published figures to the million, with one exception: for 2023
          development, data.gov.my reports RM96,091 million and the statement prints RM96,089.7 million.
        </p>

        <p>
          2020 is not loaded yet. Its operating statement is printed as drawn shapes with no text layer, so it can
          only be read by optical character recognition, which this site does not yet rely on.
        </p>

        <p>
          Numbers are stored in integer sen (1 RM = 100 sen). Every total the documents print is stored alongside
          the rows and recomputed from them before a load is accepted. A load with even one mismatch is rejected.
          Where the PDF&apos;s text cannot be read literally (an empty cell, a misprinted code, text the page does
          not draw), a named rule handles that one pattern, every use is logged with its page, and the totals check
          still covers the result. Each number links to the PDF page it was read from.
        </p>
      </section>

      <section className="max-w-4xl">
        <h2 className="text-lg font-semibold mb-3">Sources and live checks</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Document</th>
                <th>Operating totals matched</th>
                <th>Development totals matched</th>
                <th>COVID-19 Fund total</th>
                <th>SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.fiscal_year}>
                  <td>{s.fiscal_year}</td>
                  <td>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                  </td>
                  <td className="num">
                    <Check matched={s.operating_matched} total={s.operating_total} />
                  </td>
                  <td className="num">
                    <Check matched={s.development_matched} total={s.development_total} />
                  </td>
                  <td className="num">
                    {s.covid_matches === null ? "–" : <Check matched={s.covid_matches ? 1 : 0} total={1} />}
                  </td>
                  <td className="font-mono text-xs break-all" style={{ minWidth: 200 }}>
                    {s.sha256}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {budgets.map((b) => (
        <section key={b.budget_year} className="max-w-3xl mt-10 space-y-3">
          <h2 className="text-lg font-semibold">Budget {b.budget_year}</h2>
          <p className="text-sm">
            The budget pages come from the Ministry of Finance&apos;s{" "}
            <a href={b.url} target="_blank" rel="noopener noreferrer">
              <em>{b.title}</em>
            </a>{" "}
            (SHA-256 <span className="font-mono text-xs break-all">{b.sha256}</span>). Its summary pages give each
            vote&apos;s actual spending for two years, the current budget and the proposed one. Its detail tables
            give every operating vote&apos;s programmes and activities by object group, with established posts, and
            every development vote&apos;s projects with total cost and the proposed direct and loan-funded amounts.
          </p>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li>
              Operating detail: <Check matched={b.operating_matched} total={b.operating_total} /> printed totals equal
              the sum of their activity lines.
            </li>
            <li>
              Development detail: <Check matched={b.development_matched} total={b.development_total} /> group and
              vote totals equal the sum of their projects, and every vote agrees with the book&apos;s development
              appendix (Lampiran D).
            </li>
            <li>
              <Check matched={b.votes_consistent} total={b.votes} /> vote totals in the detail tables equal the
              same votes in the summary pages.
            </li>
            <li>
              MOF&apos;s printed actuals agree with the audited statements for{" "}
              <Check matched={b.actual_agree} total={b.actual_figures} /> vote figures, all within{" "}
              {formatSen(parseSen(b.actual_worst_sen))}: MOF prints whole ringgit, and rounds either each figure
              or the parts it adds.
            </li>
            {b.original_votes > 0 && (
              <li>
                The book&apos;s original estimate for {b.budget_year - 1} equals the audited statement&apos;s original
                estimate (Asal) for <Check matched={b.original_matched} total={b.original_votes} /> operating votes.
                {b.original_matched < b.original_votes &&
                  (b.original_net_diff_sen === 0
                    ? " The other differences add up to exactly zero: the book restates the year in its own ministry structure, after money moved between votes when ministries were reorganised."
                    : ` The differences do not net to zero (${formatSen(parseSen(b.original_net_diff_sen))}).`)}
                Below vote level the book restates {b.budget_year - 1} in its own structure (Budget 2026, for
                example, spreads the 2025 public service pay adjustment, SSPA, which the statement keeps as an
                activity of its own, across other activities), so its activity figures for that year are not the
                ones Parliament approved.
              </li>
            )}
          </ul>
          <p className="text-sm">
            Activity codes are reused for different activities from one year to the next (B.64 020400 is Universiti
            Putra Malaysia in the 2025 statement and Universiti Sains Malaysia in Budget 2027), so the site compares
            budgets with spending by vote, where the budget restates past actuals itself, and never matches
            activities across documents by code.
          </p>
        </section>
      ))}

      {misprints.length > 0 && (
        <section className="max-w-4xl mt-10">
          <h2 className="text-lg font-semibold mb-3">Totals the statements misprint</h2>
          <p className="text-sm mb-3 max-w-2xl">
            These printed totals disagree with the rows under them in the published statement itself. Each one is
            listed in the pipeline with the evidence, and the load accepts exactly this difference and no other.
            The site shows the printed figure.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Total</th>
                  <th className="text-right">Printed actual</th>
                  <th className="text-right">Sum of its rows</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {misprints.map((m) => {
                  const printed = parseSen(m.printed_actual_sen);
                  const rows = parseSen(m.printed_actual_sen) - parseSen(m.actual_diff_sen);
                  return (
                    <tr key={`${m.fiscal_year}-${m.scope}-${m.vote_code}-${m.programme_code}-${m.activity_code}`}>
                      <td>{m.fiscal_year}</td>
                      <td>
                        {m.scope} {[m.vote_code, m.programme_code, m.activity_code].filter(Boolean).join(" ")}
                      </td>
                      <td className="num">{formatSen(printed)}</td>
                      <td className="num">{formatSen(parseSen(rows))}</td>
                      <td>
                        <CitationLink year={m.fiscal_year} docUrl={m.doc_url} pdfPage={m.pdf_page} bookPage={m.book_page} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Check({ matched, total }: { matched: number; total: number }) {
  const ok = total > 0 && matched === total;
  return (
    <span style={{ color: ok ? "var(--accent)" : "var(--over)" }}>
      {matched.toLocaleString("en-MY")} of {total.toLocaleString("en-MY")}
    </span>
  );
}
