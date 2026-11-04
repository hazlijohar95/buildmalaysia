import type { Metadata } from "next";
import Link from "next/link";
import { getVoteSummaries, getFiscalTotals, type SortKey } from "@/lib/queries/overview";
import { formatSen, formatSenCompact, utilisation } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import CitationLink from "@/components/CitationLink";
import { getFederalSpending } from "@/lib/queries/spending";
import { getLoadedYears, requireYear } from "@/lib/years";
import YearNav from "@/components/YearNav";
import UtilBar from "@/components/UtilBar";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Operating expenditure ${(await params).year}` };
}

interface Props {
  params: Promise<{ year: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function sortParam(raw: string | string[] | undefined): SortKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "revised_sen" || v === "actual_sen") return v;
  return "code";
}

function SortLink({
  year,
  col,
  current,
  label,
}: {
  year: number;
  col: SortKey;
  current: SortKey;
  label: string;
}) {
  const active = col === current;
  return (
    <Link
      href={`/${year}/operating?sort=${col}`}
      style={{
        color: active ? "var(--fg)" : "var(--muted)",
        fontWeight: active ? 600 : 400,
        textDecoration: "none",
      }}
    >
      {label}
      {active && " ↓"}
    </Link>
  );
}

export default async function OperatingPage({ params, searchParams }: Props) {
  const year = await requireYear((await params).year);
  const sort = sortParam((await searchParams).sort);
  const [votes, totals, spending, years] = await Promise.all([
    getVoteSummaries(year, sort),
    getFiscalTotals(year),
    getFederalSpending(year),
    getLoadedYears(),
  ]);

  if (!totals || !spending) {
    return <p>No statement has been loaded for {year} yet.</p>;
  }

  const pct = utilisation(totals.total_revised_sen, totals.total_actual_sen);

  return (
    <>
      <div className="mb-8">
        <YearNav year={year} years={years} suffix="/operating" />
        <h1 className="text-2xl font-semibold mb-1">
          Operating expenditure {year}
        </h1>
        <p style={{ color: "var(--muted)" }} className="text-sm">
          Perbelanjaan Mengurus (Lampiran 1): budget vs actual for every vote.{" "}
          <Link href="/methodology">How these numbers are sourced.</Link>
        </p>
      </div>

      {/* Headline stats */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 p-4 rounded-lg border"
        style={{ borderColor: "var(--border)" }}
      >
        <Stat label="Anggaran Asal" value={formatSenCompact(totals.total_original_sen)} />
        <Stat label="Anggaran Semak" value={formatSenCompact(totals.total_revised_sen)} />
        <Stat label="Sebenar" value={formatSenCompact(totals.total_actual_sen)} />
        <Stat
          label="Prestasi"
          value={`${pct.toFixed(1)}%`}
        />
      </div>
      <p className="text-xs -mt-6 mb-8" style={{ color: "var(--muted)" }}>
        Totals as printed in the statement (JUMLAH KESELURUHAN MENGURUS),{" "}
        <CitationLink year={year} docUrl={totals.doc_url} pdfPage={totals.pdf_page} bookPage={totals.book_page} />.
        Actual spending includes the {formatSen(spending.development_fund_transfer_sen)} transfer to the
        Development Fund (Kumpulan Wang Pembangunan,{" "}
        <CitationLink
          year={year}
          docUrl={spending.doc_url}
          pdfPage={spending.transfer_pdf_page}
          bookPage={spending.transfer_book_page}
        />
        ). data.gov.my reports operating expenditure without it.
      </p>

      {/* Charged vs Supply split */}
      {(totals.charged_revised_sen > 0 || totals.supply_revised_sen > 0) && (
        <div
          className="grid grid-cols-2 gap-4 mb-8 p-4 rounded-lg border"
          style={{ borderColor: "var(--border)" }}
        >
          <SectionStat
            label="Tanggungan (Charged)"
            revised={formatSenCompact(totals.charged_revised_sen)}
            actual={formatSenCompact(totals.charged_actual_sen)}
          />
          <SectionStat
            label="Bekalan (Supply)"
            revised={formatSenCompact(totals.supply_revised_sen)}
            actual={formatSenCompact(totals.supply_actual_sen)}
          />
        </div>
      )}

      {/* Vote table */}
      <div className="mb-3 flex flex-wrap gap-4 text-xs" style={{ color: "var(--muted)" }}>
        <span>Sort by:</span>
        <SortLink year={year} col="code" current={sort} label="Vote code" />
        <SortLink year={year} col="revised_sen" current={sort} label="Revised" />
        <SortLink year={year} col="actual_sen" current={sort} label="Actual" />
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Maksud Perbelanjaan</th>
              <th className="text-right">Asal (RM)</th>
              <th className="text-right">Jumlah (RM)</th>
              <th className="text-right">Sebenar (RM)</th>
              <th>Prestasi</th>
              <th className="text-right">Varian (RM)</th>
              <th>Sumber</th>
            </tr>
          </thead>
          <tbody>
            {votes.map((v) => {
              const varian = v.revised_sen - v.actual_sen;
              const over = v.actual_sen > v.revised_sen;
              return (
                <tr key={v.code}>
                  <td className="font-mono text-xs whitespace-nowrap">
                    <Link href={`/${year}/vote/${voteCodeToSlug(v.code)}`}>
                      {v.code}
                    </Link>
                  </td>
                  <td className="max-w-xs">
                    <Link href={`/${year}/vote/${voteCodeToSlug(v.code)}`}>
                      {v.name_ms}
                    </Link>
                  </td>
                  <td className="num">{formatSen(v.original_sen)}</td>
                  <td className="num">{formatSen(v.revised_sen)}</td>
                  <td className={`num ${over ? "over-budget" : ""}`}>
                    {formatSen(v.actual_sen)}
                  </td>
                  <td>
                    <UtilBar revised={v.revised_sen} actual={v.actual_sen} />
                  </td>
                  <td className={`num ${over ? "over-budget" : ""}`}>
                    {formatSen(varian as Parameters<typeof formatSen>[0])}
                  </td>
                  <td>
                    <CitationLink
                      year={year}
                      docUrl={v.doc_url}
                      pdfPage={v.pdf_page}
                      bookPage={v.book_page}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="text-lg font-semibold tabnum">{value}</div>
    </div>
  );
}

function SectionStat({
  label,
  revised,
  actual,
}: {
  label: string;
  revised: string;
  actual: string;
}) {
  return (
    <div>
      <div className="font-medium mb-1">{label}</div>
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Semak: <span className="tabnum">{revised}</span>
      </div>
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Sebenar: <span className="tabnum">{actual}</span>
      </div>
    </div>
  );
}
