import type { Metadata } from "next";
import { getSourceChecks } from "@/lib/queries/reconciliation";

export const metadata: Metadata = {
  title: "Methodology",
};

export default async function MethodologyPage() {
  const sources = await getSourceChecks();

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
          code, name, total cost and spending under the Twelfth Malaysia Plan (RMKe-12) up to the end of the
          previous year. The right page gives the year&apos;s estimate and actual spending, each split into direct
          (Cara Langsung) and loan-funded (Pinjaman), and RMKe-12 spending to date. Within each row, previous plan
          spending plus the year&apos;s actual must equal plan spending to date, which also proves the two halves
          of the spread were paired correctly.
        </p>

        <p>
          Total federal spending is operating plus development, less the transfer from the operating account to
          the Development Fund (Kumpulan Wang Pembangunan). That fund pays for development spending, so the
          transfer would otherwise be counted twice. Operating and development totals for 2023 to 2025 match
          data.gov.my&apos;s published figures to the million, with one exception: for 2023 development,
          data.gov.my reports RM96,091 million and the statement prints RM96,089.7 million.
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
                  <td className="font-mono text-xs break-all" style={{ minWidth: 200 }}>
                    {s.sha256}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
