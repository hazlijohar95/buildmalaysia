import Link from "next/link";
import type {
  DevelopmentAmounts,
  DevelopmentGroupTotal,
  DevelopmentProjectRow,
  DevelopmentVoteDetail,
  SpreadSource,
} from "@/lib/queries/development";
import { formatSen, utilisation } from "@/lib/money";
import { voteCodeToSlug } from "@/lib/citations";
import CitationLink from "@/components/CitationLink";
import UtilBar from "@/components/UtilBar";

/** A run of projects printed under one heading, or a parent total that sums the groups above it. */
type Section =
  | { kind: "projects"; group: DevelopmentGroupTotal | null; projects: DevelopmentProjectRow[] }
  | { kind: "parent"; group: DevelopmentGroupTotal; members: DevelopmentGroupTotal[] };

/** Sections in print order. Projects arrive in print order; a parent goes after its last member. */
function sections({ groups, projects }: DevelopmentVoteDetail): Section[] {
  const byOrdinal = new Map(groups.map((g) => [g.ordinal, g]));
  const out: Section[] = [];
  for (const project of projects) {
    const last = out.at(-1);
    if (last?.kind === "projects" && (last.group?.ordinal ?? null) === project.group_ordinal) {
      last.projects.push(project);
    } else {
      const group = project.group_ordinal === null ? null : (byOrdinal.get(project.group_ordinal) ?? null);
      out.push({ kind: "projects", group, projects: [project] });
    }
  }
  for (const parent of groups) {
    const members = groups.filter((g) => g.parent_ordinal === parent.ordinal);
    if (!members.length) continue;
    const after = out.findLastIndex((s) => s.kind === "projects" && s.group?.parent_ordinal === parent.ordinal);
    out.splice(after + 1, 0, { kind: "parent", group: parent, members });
  }
  return out;
}

export default function DevelopmentVote({
  detail,
  year,
  operatingVoteCode,
}: {
  detail: DevelopmentVoteDetail;
  year: number;
  operatingVoteCode: string | null;
}) {
  const { vote } = detail;
  const over = vote.actual_sen > vote.estimate_sen;
  return (
    <>
      <div className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        <Link href="/2025/development">← All development votes</Link>
      </div>

      <div className="mb-8">
        <div className="font-mono text-xs mb-1" style={{ color: "var(--muted)" }}>
          {vote.code} · Pembangunan (development)
          {operatingVoteCode && (
            <>
              {" · "}
              <Link href={`/2025/vote/${voteCodeToSlug(operatingVoteCode)}`}>
                operating vote {operatingVoteCode}
              </Link>
            </>
          )}
        </div>
        <h1 className="text-2xl font-semibold mb-4">{vote.name_ms}</h1>

        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg border"
          style={{ borderColor: "var(--border)" }}
        >
          <HeadStat label={`Estimate ${year}`} value={formatSen(vote.estimate_sen)} />
          <HeadStat label={`Actual ${year}`} value={formatSen(vote.actual_sen)} over={over} />
          <HeadStat label="Total cost of projects" value={formatSen(vote.total_cost_sen)} />
          <HeadStat label="RMKe-12 spent to date" value={formatSen(vote.plan_actual_to_date_sen)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <UtilBar revised={vote.estimate_sen} actual={vote.actual_sen} />
          {vote.actual_loan_sen > 0 && (
            <span className="tabnum" style={{ color: "var(--muted)" }}>
              Loan-funded: {formatSen(vote.actual_loan_sen)}
            </span>
          )}
          <Cite source={vote} />
        </div>
      </div>

      {sections(detail).map((s, i) =>
        s.kind === "parent" ? (
          <ParentTotal key={i} group={s.group} members={s.members} />
        ) : (
          <GroupSection key={i} group={s.group} projects={s.projects} labelUngrouped={detail.groups.length > 0} />
        ),
      )}
    </>
  );
}

function GroupSection({
  group,
  projects,
  labelUngrouped,
}: {
  group: DevelopmentGroupTotal | null;
  projects: DevelopmentProjectRow[];
  labelUngrouped: boolean;
}) {
  return (
    <section className="mb-8">
      {group === null && labelUngrouped && (
        <div className="py-2 px-3 mb-2 text-xs" style={{ color: "var(--muted)" }}>
          Projects printed without a group subtotal; they count toward the vote total.
        </div>
      )}
      {group && (
        <div
          className="flex flex-wrap items-baseline gap-4 py-2 px-3 mb-2 rounded"
          style={{ background: "var(--table-stripe)", borderLeft: "3px solid var(--accent)" }}
        >
          <span className="font-semibold flex-1">{group.name_ms}</span>
          <TotalFigures amounts={group} />
          <Cite source={group} />
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Project</th>
              <th className="text-right">Total cost (RM)</th>
              <th className="text-right">Estimate (RM)</th>
              <th className="text-right">Actual (RM)</th>
              <th>Spent</th>
              <th className="text-right">RMKe-12 to date (RM)</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const over = p.actual_sen > p.estimate_sen;
              return (
                <tr key={p.code}>
                  <td className="font-mono text-xs">{p.code}</td>
                  <td className="max-w-sm">
                    {p.name_ms}
                    {p.footnote && (
                      <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }} lang="ms">
                        Note: {p.footnote.replace(/^\*/, "")}
                      </div>
                    )}
                  </td>
                  <td className="num">{formatSen(p.total_cost_sen)}</td>
                  <td className="num">{formatSen(p.estimate_sen)}</td>
                  <td className={`num ${over ? "over-budget" : ""}`}>{formatSen(p.actual_sen)}</td>
                  <td>{p.estimate_sen > 0 || p.actual_sen > 0 ? <UtilBar revised={p.estimate_sen} actual={p.actual_sen} /> : null}</td>
                  <td className="num">{formatSen(p.plan_actual_to_date_sen)}</td>
                  <td>
                    <Cite source={p} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ParentTotal({ group, members }: { group: DevelopmentGroupTotal; members: DevelopmentGroupTotal[] }) {
  return (
    <div
      className="flex flex-wrap items-baseline gap-4 py-2 px-3 mb-8 rounded border"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="flex-1">
        <span className="font-semibold">Jumlah {group.name_ms}</span>
        <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>
          sums {members.map((m) => m.name_ms).join(", ")}
        </span>
      </span>
      <TotalFigures amounts={group} />
      <Cite source={group} />
    </div>
  );
}

function TotalFigures({ amounts }: { amounts: DevelopmentAmounts }) {
  const over = amounts.actual_sen > amounts.estimate_sen;
  return (
    <>
      <span className="tabnum text-sm" style={{ color: "var(--muted)" }}>
        Estimate: {formatSen(amounts.estimate_sen)}
      </span>
      <span className={`tabnum text-sm ${over ? "over-budget" : ""}`}>
        Actual: {formatSen(amounts.actual_sen)}
        {amounts.estimate_sen > 0 && ` (${utilisation(amounts.estimate_sen, amounts.actual_sen).toFixed(1)}%)`}
      </span>
    </>
  );
}

function Cite({ source }: { source: SpreadSource }) {
  return <CitationLink docUrl={source.doc_url} pdfPage={source.pdf_page} bookPage={source.book_page} spread />;
}

function HeadStat({ label, value, over = false }: { label: string; value: string; over?: boolean }) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className={`text-sm font-semibold tabnum ${over ? "over-budget" : ""}`}>{value}</div>
    </div>
  );
}
