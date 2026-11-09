// /bills/[year]/[number]: one bill, through both houses of Parliament to its Act. Each house's record is as its own
// listing prints it, linked; the Act is as Laws of Malaysia lists it, with how the two were matched.
import { Band, H2, NoteBand, kicker } from "@/components/Boxed";
import BillStageTag from "@/components/BillStageTag";
import { notFound } from "@/lib/abort";
import {
  HOUSES,
  LOM_URL,
  STAGES,
  actLabel,
  billCode,
  getBill,
  houseSteps,
  lawTitle,
  outOfOrder,
  supplyBudgetYear,
  type ActRecord,
  type BillDetail,
  type HouseRecord,
} from "@/lib/bills";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { getBudgetYears } from "@/lib/queries/budget";
import type { Page, RouteContext } from "@/lib/route";

const button = cn(
  kicker,
  "tap inline-flex min-h-12 items-center gap-3 border-2 border-foreground px-5 no-underline text-foreground hover:bg-foreground hover:text-background",
);

/** Whether a bill moved within the last year: one passed since may simply not be law yet. Pages are cached for an
 * hour, so reading the clock here is no staler than they are. */
function recentlyMoved(lastMoved: string | null): boolean {
  return lastMoved !== null && Date.parse(lastMoved) > Date.now() - 365 * 86_400_000;
}

export default async function billPage({ params }: RouteContext): Promise<Page> {
  const [bill, budgetYears] = await Promise.all([getBill(params.year ?? "", params.number ?? ""), getBudgetYears()]);
  if (!bill) notFound();
  const supplyYear = supplyBudgetYear(bill.title);
  const budget = supplyYear !== null && budgetYears.includes(supplyYear) ? supplyYear : null;
  const odd = outOfOrder(bill.houses);
  const dnListed = bill.houses.some((h) => h.house === "dewan_negara");
  const title = `${bill.title}${bill.titleTruncated ? "…" : ""}`;

  return {
    head: {
      title: `${billCode(bill)} ${title.length > 60 ? `${title.slice(0, 57).trimEnd()}…` : title}`,
      description: `${billCode(bill)}, ${title}: ${STAGES[bill.stage].label.toLowerCase()}${bill.actNo ? ` as ${actLabel(bill.actNo)}` : ""}. Its readings in the Dewan Rakyat and Dewan Negara, and its Act.`,
    },
    body: (
      <>
        <Band>
          <nav aria-label="Breadcrumb" className={cn(kicker, "flex flex-wrap gap-x-3 text-charcoal-700")}>
            <a href="/bills" className="text-charcoal-700">
              Bills in Parliament
            </a>
            <span aria-hidden="true">/</span>
            <a href={`/bills?year=${bill.year}`} className="text-charcoal-700">
              {bill.year}
            </a>
            <span aria-hidden="true">/</span>
            <span>{billCode(bill)}</span>
          </nav>
          <h1
            lang="ms"
            className="mt-5 max-w-5xl font-display text-2xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] md:text-4xl"
          >
            {title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <BillStageTag stage={bill.stage} long />
            {bill.act?.royalAssent && (
              <span className="text-charcoal-800">Royal Assent {formatDate(bill.act.royalAssent)}</span>
            )}
          </div>
          {bill.titleTruncated && (
            <p className="mt-4 max-w-3xl text-charcoal-700">
              Parliament&apos;s archive cuts this title short;{" "}
              {bill.act ? "the Act below gives it in full" : "the bill's PDF gives it in full"}.
            </p>
          )}
          {budget !== null && (
            <p className="mt-6 max-w-3xl text-lg text-charcoal-800">
              This is the Supply Bill for {budget}: the law that lets the government spend its budget.{" "}
              <a href={`/budget/${budget}`}>See Budget {budget}, vote by vote</a>.
            </p>
          )}
        </Band>

        {odd.length > 0 && (
          <NoteBand title="Dates out of order" tone="copper">
            As printed, {odd.join("; ")}. The dates are shown as Parliament lists them; one of them is likely a typing
            slip in the listing.
          </NoteBand>
        )}

        <Band>
          <H2>In Parliament</H2>
          <div className="mt-8 grid gap-10 md:grid-cols-2">
            {(["dewan_rakyat", "dewan_negara"] as const).map((house) => {
              const record = bill.houses.find((h) => h.house === house);
              return record ? (
                <HouseCard key={house} record={record} />
              ) : (
                <section key={house} className="border-2 border-dashed border-foreground/40 p-6">
                  <h3 className="m-0 font-display text-xl font-semibold">{HOUSES[house].label}</h3>
                  <p className="m-0 mt-3 text-charcoal-700">
                    {house === "dewan_negara" && bill.stage === "enacted"
                      ? "The Dewan Negara's listing does not include this bill, though it became law."
                      : house === "dewan_negara"
                        ? "The Dewan Negara's listing does not include this bill."
                        : "The Dewan Rakyat's listing does not include this bill."}
                  </p>
                </section>
              );
            })}
          </div>
          {!dnListed && bill.stage === "passed_dewan_rakyat" && bill.year < 2011 && (
            <p className="mt-6 max-w-3xl text-sm text-charcoal-700">
              The Dewan Negara&apos;s archive leaves out many bills of the 1990s and 2000s, so a bill shown here as
              passed by the Dewan Rakyat alone may well have passed both houses.
            </p>
          )}
        </Band>

        <Band>
          <H2>The Act</H2>
          {bill.act ? (
            <ActCard act={bill.act} link={bill.actLink} note={bill.actLinkNote} />
          ) : (
            <p className="mt-6 max-w-3xl text-lg text-charcoal-800">
              {bill.actLink === "file"
                ? `No Act is linked to this bill: ${bill.actLinkNote}`
                : bill.stage === "passed" || bill.stage === "passed_dewan_rakyat"
                  ? recentlyMoved(bill.lastMoved)
                    ? "No Act on Laws of Malaysia matches this bill's title yet. A bill passed this recently may still await the Royal Assent or its gazette."
                    : "No Act on Laws of Malaysia matches this bill's title. Laws of Malaysia lists amending Acts only from 2011, and an Act's title can differ from its bill's."
                  : "The bill has not become law."}{" "}
              <a href={LOM_URL}>Search Laws of Malaysia</a>.
            </p>
          )}
        </Band>
      </>
    ),
  };
}

function HouseCard({ record: h }: { record: HouseRecord }) {
  const steps = houseSteps(h);
  return (
    <section className="border-2 border-foreground p-6">
      <h3 className="m-0 font-display text-xl font-semibold">
        {HOUSES[h.house].label}
        <span className="block text-sm font-normal text-charcoal-700">{HOUSES[h.house].en}</span>
      </h3>
      <p className="m-0 mt-4">
        <span className={cn(kicker, "text-charcoal-700")}>Status</span>{" "}
        <span lang="ms" className="font-semibold">
          {h.status}
        </span>
      </p>
      {steps.length > 0 ? (
        <ol role="list" className="m-0 mt-4 list-none space-y-2 border-l-2 border-foreground p-0 pl-4">
          {steps.map((s) => (
            <li key={s.label} className="flex flex-wrap justify-between gap-x-4">
              <span>
                {s.label}{" "}
                <span lang="ms" className="text-sm text-charcoal-700">
                  ({s.ms})
                </span>
              </span>
              <span className="font-mono tabular-nums">{formatDate(s.date)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 mt-4 text-charcoal-700">The listing gives no dates for this bill.</p>
      )}
      {(h.tabledBy || h.passedBy) && (
        <dl className="m-0 mt-5 space-y-2 text-sm">
          {h.tabledBy && (
            <div>
              <dt className={cn(kicker, "text-charcoal-700")}>Tabled by</dt>
              <dd className="m-0" lang="ms">
                {h.tabledBy}
              </dd>
            </div>
          )}
          {h.passedBy && h.passedBy !== h.tabledBy && (
            <div>
              <dt className={cn(kicker, "text-charcoal-700")}>Moved at its passing by</dt>
              <dd className="m-0" lang="ms">
                {h.passedBy}
              </dd>
            </div>
          )}
        </dl>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        {h.pdfUrl && (
          <a href={h.pdfUrl} className={button}>
            The bill (PDF)
          </a>
        )}
        <a href={h.sourceUrl} className={button}>
          {h.listing === "current" ? "Parliament's listing" : "Parliament's archive"}
        </a>
      </div>
    </section>
  );
}

function ActCard({ act, link, note }: { act: ActRecord; link: BillDetail["actLink"]; note: string | null }) {
  const rows: [string, React.ReactNode][] = [
    ["Royal Assent", act.royalAssent ? formatDate(act.royalAssent) : "Not listed"],
    ["Gazetted", act.published ? formatDate(act.published) : "Not listed"],
    [
      "In force",
      act.inForce ? (
        <>
          {formatDate(act.inForce)}
          {act.inForceNote && <span className="text-charcoal-700"> ({act.inForceNote})</span>}
        </>
      ) : (
        (act.inForceNote ?? "Not listed")
      ),
    ],
  ];
  if (act.repealedBy) rows.push(["Repealed by", `Act ${act.repealedBy}`]);
  return (
    <div className="mt-6 max-w-4xl">
      <p className={cn(kicker, "m-0 text-charcoal-700")}>
        {actLabel(act.actNo)} · {act.kind === "amendment" ? "Amending Act" : "Principal Act"}
      </p>
      <p lang="ms" className="m-0 mt-2 font-display text-xl font-semibold md:text-2xl">
        {lawTitle(act.titleMs)}
      </p>
      {act.titleEn && act.titleEn !== act.titleMs && (
        <p className="m-0 mt-1 text-lg text-charcoal-800">{lawTitle(act.titleEn)}</p>
      )}
      <dl className="m-0 mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className={cn(kicker, "text-charcoal-700")}>{label}</dt>
            <dd className="m-0">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        {act.pdfMsUrl && (
          <a href={act.pdfMsUrl} className={button} lang="ms">
            Akta (PDF)
          </a>
        )}
        {act.pdfEnUrl && (
          <a href={act.pdfEnUrl} className={button}>
            The Act in English (PDF)
          </a>
        )}
        <a href={act.sourceUrl} className={button}>
          Laws of Malaysia
        </a>
      </div>
      <p className="mt-6 max-w-3xl text-sm text-charcoal-700">
        {link === "file"
          ? `Linked by hand after review: ${note}`
          : "Matched by title. Laws of Malaysia names no bill, so this is the Act that carries the bill's title and, where Parliament dates the bill's passing, was assented after it."}
      </p>
    </div>
  );
}
