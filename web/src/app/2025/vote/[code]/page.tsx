import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getVoteHeader,
  getProgrammeTotals,
  getActivityTotals,
  getLeafLines,
  type ProgrammeTotal,
  type ActivityTotal,
  type LeafLine,
} from "@/lib/queries/vote-detail";
import { formatSen, utilisation, type Sen } from "@/lib/money";
import { slugToVoteCode } from "@/lib/citations";
import CitationLink from "@/components/CitationLink";
import UtilBar from "@/components/UtilBar";

const YEAR = 2025;

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code: slug } = await params;
  const voteCode = slugToVoteCode(slug);
  const header = await getVoteHeader(YEAR, voteCode);
  if (!header) return { title: "Vote not found" };
  return { title: `${header.code} ${header.name_ms}` };
}

export default async function VoteDetailPage({ params }: Props) {
  const { code: slug } = await params;
  const voteCode = slugToVoteCode(slug);

  const [header, programmes, activities, lines] = await Promise.all([
    getVoteHeader(YEAR, voteCode),
    getProgrammeTotals(YEAR, voteCode),
    getActivityTotals(YEAR, voteCode),
    getLeafLines(YEAR, voteCode),
  ]);

  if (!header) notFound();

  const varian = (header.revised_sen - header.actual_sen) as Sen;
  const pct = utilisation(header.revised_sen, header.actual_sen);
  const over = header.actual_sen > header.revised_sen;

  const actsByProg = groupBy(activities, (a) => a.programme_code);
  const linesByActivity = groupBy(lines, (l) => l.activity_code);

  return (
    <>
      {/* Back + breadcrumb */}
      <div className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        <Link href="/">← Semua Undian</Link>
      </div>

      {/* Vote header */}
      <div className="mb-8">
        <div className="font-mono text-xs mb-1" style={{ color: "var(--muted)" }}>
          {header.code} · {header.section === "charged" ? "Tanggungan" : "Bekalan"}
        </div>
        <h1 className="text-2xl font-semibold mb-4">{header.name_ms}</h1>

        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg border"
          style={{ borderColor: "var(--border)" }}
        >
          <HeadStat label="Asal" value={formatSen(header.original_sen)} />
          <HeadStat label="Jumlah (Semak)" value={formatSen(header.revised_sen)} />
          <HeadStat
            label="Sebenar"
            value={formatSen(header.actual_sen)}
            className={over ? "over-budget" : ""}
          />
          <HeadStat label="Prestasi" value={`${pct.toFixed(2)}%`} />
        </div>

        <div className="mt-2 flex items-center gap-4">
          <UtilBar revised={header.revised_sen} actual={header.actual_sen} />
          <span className={`text-sm tabnum ${over ? "over-budget" : ""}`}>
            Varian: {formatSen(varian)}
          </span>
          <CitationLink
            docUrl={header.doc_url}
            pdfPage={header.pdf_page}
            bookPage={header.book_page}
          />
        </div>
      </div>

      {/* Programmes */}
      {programmes.map((prog) => {
        const progActivities = actsByProg[prog.programme_code] ?? [];
        return (
          <section key={prog.programme_code} className="mb-10">
            <ProgrammeHeader prog={prog} />
            {progActivities.map((act) => {
              const actLines = linesByActivity[act.activity_code] ?? [];
              return (
                <ActivitySection
                  key={act.activity_code}
                  act={act}
                  lines={actLines}
                />
              );
            })}
          </section>
        );
      })}
    </>
  );
}

function ProgrammeHeader({ prog }: { prog: ProgrammeTotal }) {
  const over = prog.actual_sen > prog.revised_sen;
  return (
    <div
      className="flex flex-wrap items-baseline gap-4 py-2 px-3 mb-2 rounded"
      style={{ background: "var(--table-stripe)", borderLeft: "3px solid var(--accent)" }}
    >
      <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
        {prog.programme_code}
      </span>
      <span className="font-semibold flex-1">{prog.programme_name_ms}</span>
      <span className="tabnum text-sm" style={{ color: "var(--muted)" }}>
        Semak: {formatSen(prog.revised_sen)}
      </span>
      <span className={`tabnum text-sm ${over ? "over-budget" : ""}`}>
        Sebenar: {formatSen(prog.actual_sen)}
      </span>
      <CitationLink
        docUrl={prog.doc_url}
        pdfPage={prog.pdf_page}
        bookPage={prog.book_page}
      />
    </div>
  );
}

function ActivitySection({
  act,
  lines,
}: {
  act: ActivityTotal;
  lines: LeafLine[];
}) {
  const over = act.actual_sen > act.revised_sen;
  return (
    <div className="mb-6 ml-4">
      <div
        className="flex flex-wrap items-baseline gap-3 py-1 px-2 mb-1"
        style={{ borderLeft: "2px solid var(--border)" }}
      >
        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
          {act.activity_code}
        </span>
        <span className="font-medium">{act.activity_name_ms}</span>
        <span className="tabnum text-xs" style={{ color: "var(--muted)" }}>
          Jumlah: {formatSen(act.revised_sen)} | Sebenar:{" "}
          <span className={over ? "over-budget" : ""}>{formatSen(act.actual_sen)}</span>
        </span>
        <CitationLink
          docUrl={act.doc_url}
          pdfPage={act.pdf_page}
          bookPage={act.book_page}
        />
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Objek</th>
              <th>Nama (EN)</th>
              <th className="text-right">Asal (RM)</th>
              <th className="text-right">Tambahan (RM)</th>
              <th className="text-right">Viremen (RM)</th>
              <th className="text-right">Jumlah (RM)</th>
              <th className="text-right">Sebenar (RM)</th>
              <th>Prestasi</th>
              <th className="text-right">Varian (RM)</th>
              <th>Sumber</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const varian = (l.revised_sen - l.actual_sen) as Sen;
              const lineOver = l.actual_sen > l.revised_sen;
              return (
                <tr key={l.object_code} className={lineOver ? "over-budget" : ""}>
                  <td className="font-mono text-xs">{l.object_code}</td>
                  <td>
                    <span>{l.object_name_en}</span>
                    <br />
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {l.object_name_ms}
                    </span>
                  </td>
                  <td className="num">{formatSen(l.original_sen)}</td>
                  <td className="num">{formatSen(l.supplementary_sen)}</td>
                  <td className="num">{formatSen(l.virement_sen)}</td>
                  <td className="num">{formatSen(l.revised_sen)}</td>
                  <td className={`num ${lineOver ? "over-budget" : ""}`}>
                    {formatSen(l.actual_sen)}
                  </td>
                  <td>
                    <UtilBar revised={l.revised_sen} actual={l.actual_sen} />
                  </td>
                  <td className={`num ${lineOver ? "over-budget" : ""}`}>
                    {formatSen(varian)}
                  </td>
                  <td>
                    <CitationLink
                      docUrl={l.doc_url}
                      pdfPage={l.pdf_page}
                      bookPage={l.book_page}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeadStat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className={`text-sm font-semibold tabnum ${className ?? ""}`}>{value}</div>
    </div>
  );
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}
