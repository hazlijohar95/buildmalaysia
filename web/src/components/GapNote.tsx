import Link from "next/link";
import { NoteBand } from "@/components/Boxed";
import { gapExtent, type OperatingGap } from "@/lib/queries/gaps";

/** A visible note wherever figures are affected by a page missing from the published statement. */
export default function GapNote({ gaps }: { gaps: OperatingGap[] }) {
  if (gaps.length === 0) return null;
  const g = gaps[0];
  return (
    <NoteBand tone="copper" title={`A page is missing from the published ${g.fiscal_year} statement.`}>
      JANM&apos;s PDF skips one page of Lampiran 1 between PDF pages {g.after_pdf_page} and {g.before_pdf_page}, and no
      complete copy is published anywhere we could find. Affected here:{" "}
      {gaps.map((x, i) => (
        <span key={`${x.vote_code}-${x.programme_code}`}>
          {i > 0 && "; "}
          {x.vote_code} programme {x.programme_code} ({gapExtent(x)})
        </span>
      ))}
      . Every row that is printed is shown; the vote totals come from where the same statement prints them elsewhere.{" "}
      <Link href="/methodology#gaps">How this is handled</Link>
    </NoteBand>
  );
}
