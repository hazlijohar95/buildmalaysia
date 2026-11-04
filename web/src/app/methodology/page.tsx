import type { Metadata } from "next";
import { getDevelopmentReconciliation, getReconciliationSummary } from "@/lib/queries/reconciliation";

export const metadata: Metadata = {
  title: "Methodology",
};

const YEAR = 2025;

export default async function MethodologyPage() {
  const [recon, development] = await Promise.all([
    getReconciliationSummary(YEAR),
    getDevelopmentReconciliation(YEAR),
  ]);
  const allMatch =
    recon.total > 0 &&
    recon.matched === recon.total &&
    development.total > 0 &&
    development.matched === development.total;

  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Methodology</h1>

      <section className="prose-like mb-8 max-w-2xl space-y-4">
        <p>
          Every number on this site comes from the{" "}
          <strong>Penyata Kewangan Kerajaan Persekutuan 2025</strong>, published
          by Jabatan Akauntan Negara Malaysia (JANM) and audited by the National
          Audit Department. The document is public and freely downloadable from
          the JANM website.
        </p>

        <p>
          The specific table is Lampiran 1,{" "}
          <em>Penyata Perbelanjaan Mengurus</em> (Statement of Operating
          Expenditure), on PDF pages 103–212. For each vote, it shows, by
          programme, activity, and object group: the original estimate (Asal),
          supplementary allocation (Tambahan/(Kurangan)), virement
          (Viremen/(Kurangan)), revised total (Jumlah), and actual spending
          (Sebenar). Variance (Varian) and utilisation percentage (% Prestasi)
          are derived from those five columns and not stored separately.
        </p>

        <p>
          Development spending comes from Lampiran 2,{" "}
          <em>Penyata Perbelanjaan Pembangunan</em> (Statement of Development
          Expenditure), on PDF pages 214–249. Each row is printed across a
          two-page spread. The left page gives the project code, name, total
          cost and spending under the Twelfth Malaysia Plan (RMKe-12) up to the
          end of the previous year. The right page gives the year&apos;s
          estimate and actual spending, each split into direct (Cara Langsung)
          and loan-funded (Pinjaman), and RMKe-12 spending to date. Projects are
          grouped under agency headings, and every group, vote and statement
          total is checked in all nine columns. Within each row, previous plan
          spending plus the year&apos;s actual must equal plan spending to
          date, which also proves the two halves of the spread were paired
          correctly.
        </p>

        <p>
          Total federal spending is operating plus development, less the
          transfer from the operating account to the Development Fund
          (Kumpulan Wang Pembangunan). That fund pays for development spending,
          so the transfer would otherwise be counted twice. The result matches
          data.gov.my&apos;s published operating and development figures to the
          million.
        </p>

        <p>
          Numbers are extracted from the PDF and stored in integer sen (1 RM =
          100 sen) to avoid floating-point rounding. Every total the document
          prints is stored alongside the leaf data and recomputed from those
          leaves before any load is accepted. A load that produces even one
          mismatch is rejected.
        </p>

        <p>
          Each number on the site links to the PDF page it was read from, so
          you can verify the extraction yourself. The link opens the JANM PDF at
          the exact page.
        </p>

        <h2 className="text-lg font-semibold mt-6">SHA-256 of source document</h2>
        <p className="font-mono text-xs break-all">
          5dd1673c6c42420be1b1f70cd68881358e21768e82850e864c26f2421b24a515
        </p>
      </section>

      {/* Live reconciliation block */}
      <section
        className="p-4 rounded-lg border max-w-2xl"
        style={{
          borderColor: allMatch ? "var(--accent)" : "var(--over)",
          background: "var(--table-stripe)",
        }}
      >
        <h2 className="text-base font-semibold mb-2">
          Live Verification — FY{YEAR}
        </h2>
        <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
          Recomputed from leaf data against every printed total in the source.
        </p>

        {recon.total === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No data loaded yet.
          </p>
        ) : (
          <>
            <p className="text-sm font-medium mb-1">
              Development (Lampiran 2): {development.matched} of {development.total} printed totals
              match.
            </p>
            <p className="text-sm font-medium mb-1">
              Operating (Lampiran 1): {recon.matched} of {recon.total} printed totals checked.{" "}
              {allMatch ? (
                <span style={{ color: "var(--accent)" }}>All match.</span>
              ) : (
                <span style={{ color: "var(--over)" }}>
                  {recon.total - recon.matched} mismatch
                  {recon.total - recon.matched !== 1 ? "es" : ""}.
                </span>
              )}
            </p>

            {recon.mismatches.length > 0 && (
              <div className="mt-3">
                <p
                  className="text-xs font-semibold mb-1"
                  style={{ color: "var(--over)" }}
                >
                  Mismatches:
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Scope</th>
                        <th>Vote</th>
                        <th>Programme</th>
                        <th>Activity</th>
                        <th className="text-right">Revised diff (sen)</th>
                        <th className="text-right">Actual diff (sen)</th>
                        <th>PDF p.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recon.mismatches.map((m) => (
                        <tr key={m.printed_total_id}>
                          <td>{m.scope}</td>
                          <td>{m.vote_code ?? "—"}</td>
                          <td>{m.programme_code ?? "—"}</td>
                          <td>{m.activity_code ?? "—"}</td>
                          <td className="num">{m.revised_diff_sen}</td>
                          <td className="num">{m.actual_diff_sen}</td>
                          <td>{m.pdf_page}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
