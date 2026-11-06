import type { Metadata } from "next";
import { gapExtent, getOperatingGaps } from "@/lib/queries/gaps";
import { getMethodologyChecks } from "@/lib/queries/reconciliation";
import { formatSen, parseSen } from "@/lib/money";
import { GLOSSARY } from "@/lib/glossary";
import { Band, H2, PageHeader } from "@/components/Boxed";
import CitationLink from "@/components/CitationLink";

export const metadata: Metadata = {
  title: "Methodology",
};

export default async function MethodologyPage() {
  const [{ sources, misprints, budgets }, gaps] = await Promise.all([getMethodologyChecks(), getOperatingGaps()]);
  const ocr = sources.filter((s) => s.operating_ocr_engine);

  return (
    <>
      <PageHeader
        wide
        eyebrow="Methodology"
        title="How the numbers are made"
        intro="What the documents' terms mean, where every figure comes from, and the checks each load must pass before it reaches this site."
      />

      <Band wide id="glossary">
        <H2>What the terms mean</H2>
        <dl className="mt-8 grid gap-x-12 md:grid-cols-2 m-0">
          {GLOSSARY.map((t) => (
            <div key={t.id} id={t.id} className="border-t-2 border-foreground py-5 target:bg-linen-200 target:px-4">
              <dt className="font-display text-xl font-semibold">
                {t.term}{" "}
                <span lang="ms" className="font-sans text-sm font-normal text-charcoal-700">
                  {t.ms}
                </span>
              </dt>
              <dd className="m-0 mt-2 text-charcoal-800">{t.body}</dd>
            </div>
          ))}
        </dl>
      </Band>

      <Band wide>
        <H2>Where the numbers come from</H2>
        <div className="mt-8 max-w-3xl space-y-4 text-charcoal-800">
          <p>
            Every number on this site comes from the <strong>Penyata Kewangan Kerajaan Persekutuan</strong> (Federal
            Government Financial Statements), published each year by Jabatan Akauntan Negara Malaysia (JANM) and audited
            by the National Audit Department. The documents are public and freely downloadable from the JANM website.
          </p>

          <p>
            Operating spending comes from Lampiran 1, <em>Penyata Perbelanjaan Mengurus</em> (Statement of Operating
            Expenditure). For each vote it shows, by programme, activity and object group, the original estimate (Asal),
            supplementary allocation (Tambahan/(Kurangan)), virement (Viremen), revised total (Jumlah) and actual
            spending (Sebenar). Variance (Varian) and utilisation (% Prestasi) are derived from those columns and not
            stored. The printed % Prestasi sometimes contradicts its own row; the site computes it instead.
          </p>

          <p>
            Development spending comes from Lampiran 2, <em>Penyata Perbelanjaan Pembangunan</em> (Statement of
            Development Expenditure). Each row is printed across a two-page spread. The left page gives the project
            code, name, total cost and spending under the current Malaysia Plan up to the end of the previous year. The
            right page gives the year&apos;s estimate and actual spending, each split into direct (Cara Langsung) and
            loan-funded (Pinjaman), and plan spending to date. Within each row, previous plan spending plus the
            year&apos;s actual must equal plan spending to date, which also proves the two halves of the spread were
            paired correctly. 2021 is the first year of the Twelfth Malaysia Plan: its left column counts the Eleventh
            Plan to 2020 and its right column the Twelfth Plan, so there the year&apos;s actual must equal plan spending
            to date.
          </p>

          <p>
            From 2020 to 2023 the statements also include Lampiran 3,{" "}
            <em>Penyata Perbelanjaan Kumpulan Wang COVID-19</em>: the COVID-19 Fund&apos;s programmes, each with its
            ceiling, the year&apos;s allocation and spending, and spending since 2020. The fund was financed outside the
            operating account, so its spending adds to operating and development spending.
          </p>

          <p>
            Total federal spending is operating plus development, less the transfer from the operating account to the
            Development Fund (Kumpulan Wang Pembangunan). That fund pays for development spending, so the transfer would
            otherwise be counted twice. Operating, development and COVID-19 Fund spending for every loaded year match
            data.gov.my&apos;s published figures to the million, with one exception: for 2023 development, data.gov.my
            reports RM 96,091 million and the statement prints RM 96,089.7 million.
          </p>

          <p>
            Numbers are stored in integer sen (1 RM = 100 sen). Every total the documents print is stored alongside the
            rows and recomputed from them before a load is accepted. A load with even one mismatch is rejected. Where
            the PDF&apos;s text cannot be read literally (an empty cell, a misprinted code, text the page does not
            draw), a named rule handles that one pattern, every use is logged with its page, and the totals check still
            covers the result. Each number links to the PDF page it was read from.
          </p>
        </div>
      </Band>

      <Band wide>
        <H2>Sources and live checks</H2>
        <div className="table-scroll mt-8">
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
                    <Check
                      matched={s.operating_matched}
                      total={s.operating_total}
                      accounted={s.operating_misprinted + s.operating_missing_page}
                    />
                    {(s.operating_misprinted > 0 || s.operating_missing_page > 0) && (
                      <span className="block text-xs text-charcoal-700">
                        {[
                          s.operating_misprinted > 0 &&
                            `${s.operating_misprinted} printed ${s.operating_misprinted === 1 ? "misprint" : "misprints"}`,
                          s.operating_missing_page > 0 && (
                            <a key="gap" href="#gaps">
                              {s.operating_missing_page} on the missing page
                            </a>
                          ),
                        ]
                          .filter(Boolean)
                          .map((x, i) => (
                            <span key={i}>
                              {i > 0 && " · "}
                              {x}
                            </span>
                          ))}
                      </span>
                    )}
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
      </Band>

      {budgets.map((b) => (
        <Band wide key={b.budget_year}>
          <H2>Budget {b.budget_year}</H2>
          <div className="mt-8 max-w-3xl space-y-4 text-charcoal-800">
            <p>
              The budget pages come from the Ministry of Finance&apos;s{" "}
              <a href={b.url} target="_blank" rel="noopener noreferrer">
                <em>{b.title}</em>
              </a>{" "}
              (SHA-256 <span className="font-mono text-xs break-all">{b.sha256}</span>). Its summary pages give each
              vote&apos;s actual spending for two years, the current budget and the proposed one. Its detail tables give
              every operating vote&apos;s programmes and activities by object group, with established posts, and every
              development vote&apos;s projects with total cost and the proposed direct and loan-funded amounts.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Operating detail: <Check matched={b.operating_matched} total={b.operating_total} /> printed totals equal
                the sum of their activity lines.
              </li>
              <li>
                Development detail: <Check matched={b.development_matched} total={b.development_total} /> group and vote
                totals equal the sum of their projects, and every vote agrees with the book&apos;s development appendix
                (Lampiran D).
              </li>
              <li>
                <Check matched={b.votes_consistent} total={b.votes} /> vote totals in the detail tables equal the same
                votes in the summary pages.
              </li>
              <li>
                MOF&apos;s printed actuals agree with the audited statements for{" "}
                <Check matched={b.actual_agree} total={b.actual_figures} /> vote figures, all within{" "}
                {formatSen(parseSen(b.actual_worst_sen))}: MOF prints whole ringgit, and rounds either each figure or
                the parts it adds.
              </li>
              {b.original_votes > 0 && (
                <li>
                  The book&apos;s original estimate for {b.budget_year - 1} equals the audited statement&apos;s original
                  estimate (Asal) for <Check matched={b.original_matched} total={b.original_votes} /> operating votes.
                  {b.original_matched < b.original_votes &&
                    (b.original_net_diff_sen === 0
                      ? " The other differences add up to exactly zero: the book restates the year in its own ministry structure, after money moved between votes when ministries were reorganised."
                      : ` The differences do not net to zero (${formatSen(parseSen(b.original_net_diff_sen))}).`)}
                  Below vote level the book restates {b.budget_year - 1} in its own structure (Budget 2026, for example,
                  spreads the 2025 public service pay adjustment, SSPA, which the statement keeps as an activity of its
                  own, across other activities), so its activity figures for that year are not the ones Parliament
                  approved.
                </li>
              )}
            </ul>
            <p>
              Activity codes are reused for different activities from one year to the next (B.64 020400 is Universiti
              Putra Malaysia in the 2025 statement and Universiti Sains Malaysia in Budget 2027), so the site compares
              budgets with spending by vote, where the budget restates past actuals itself, and never matches activities
              across documents by code.
            </p>
          </div>
        </Band>
      ))}

      {ocr.length > 0 && (
        <Band wide id="ocr">
          <H2>Statements read by OCR</H2>
          <div className="mt-3 max-w-3xl space-y-4 text-charcoal-800">
            <p>
              The published {ocr.map((s) => s.fiscal_year).join(", ")} Statement of Operating Expenditure (Lampiran 1)
              has no text layer, so its figures were read from the page. The PDF still draws every character as a vector
              outline, so the position of each character, and the pattern of digits, commas, periods and dashes in each
              cell, come from the PDF itself rather than from OCR.
            </p>
            <p>
              Each amount cell is read by OCR at 15 settings. A reading counts only if it fits the cell&apos;s drawn
              pattern character for character, and the cell takes a reading that at least 8 settings agree on, with no
              rival reading held by more than half as many. Where no reading clears that bar, the cell is read by eye
              from the page image and registered with an image of the cell. Every printed total is then recomputed from
              its rows exactly as in other years: it either matches or is a misprint confirmed on the page and listed
              below. Programme and activity names are OCR readings; the totals check does not cover them.
            </p>
            {ocr.map((s) => (
              <p key={s.fiscal_year} className="text-sm text-charcoal-700">
                {s.fiscal_year}: {s.operating_ocr_engine}.
              </p>
            ))}
          </div>
        </Band>
      )}

      {gaps.length > 0 && (
        <Band wide id="gaps">
          <H2>Pages missing from a published statement</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            The FY2019 PDF skips one page of Lampiran 1, and no complete copy is published anywhere we could find. Every
            row that is printed is loaded. A total whose rows were on the missing page cannot be recomputed, so it is
            checked against the totals printed above and below it instead, and the vote totals come from the same
            statement&apos;s English Attachment 1. No figure is estimated or filled in.
          </p>
          <ul className="mt-6 max-w-4xl space-y-4">
            {[...new Set(gaps.map((g) => g.evidence))].map((evidence) => (
              <li key={evidence}>
                <span className="font-semibold">
                  {gaps
                    .filter((g) => g.evidence === evidence)
                    .map((g) => `${g.fiscal_year} ${g.vote_code} programme ${g.programme_code} (${gapExtent(g)})`)
                    .join("; ")}
                </span>
                <span className="mt-1 block text-sm text-charcoal-700">{evidence}</span>
              </li>
            ))}
          </ul>
        </Band>
      )}

      {misprints.length > 0 && (
        <Band wide>
          <H2>Totals the statements misprint</H2>
          <p className="mt-3 max-w-3xl text-charcoal-800">
            These printed totals disagree with the rows under them in the published statement itself: errors in the
            document, not in the load. Each is registered in the pipeline with the evidence, the load accepts exactly
            this difference and no other, and the site shows the printed figure. A misprint in one row repeats in every
            total above it, so one error can appear at programme, vote, section and statement level.
          </p>
          <div className="table-scroll mt-8">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Total</th>
                  <th>Column</th>
                  <th className="text-right">Printed minus its rows</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {misprints.map((m, i) => (
                  <tr key={i}>
                    <td>{m.fiscal_year}</td>
                    <td>
                      {m.scope} {[m.vote_code, m.programme_code, m.activity_code].filter(Boolean).join(" ")}
                      {m.object_code && <span className="text-charcoal-700"> · object {m.object_code}</span>}
                    </td>
                    <td>{m.diffs.map((d) => COLUMN_LABEL[d.column]).join(", ")}</td>
                    <td className="num">
                      {m.diffs.map((d) => (
                        <span key={d.column} className="block">
                          {Number(d.sen) > 0 ? "+" : ""}
                          {formatSen(parseSen(d.sen))}
                        </span>
                      ))}
                    </td>
                    <td>
                      <CitationLink
                        year={m.fiscal_year}
                        docUrl={m.doc_url}
                        pdfPage={m.pdf_page}
                        bookPage={m.book_page}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Band>
      )}
    </>
  );
}

const COLUMN_LABEL = {
  original: "Original budget",
  supplementary: "Supplementary",
  virement: "Virement",
  revised: "Revised budget",
  actual: "Spent",
} as const;

/** Green when every total reconciles, or when the rest are all registered misprints or missing-page totals. */
function Check({ matched, total, accounted = 0 }: { matched: number; total: number; accounted?: number }) {
  const ok = total > 0 && matched + accounted === total;
  return (
    <span className={ok ? "text-pine-700" : "over-budget"}>
      {matched.toLocaleString("en-MY")} of {total.toLocaleString("en-MY")}
    </span>
  );
}
