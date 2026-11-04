import Link from "next/link";
import { NoteBand } from "@/components/Boxed";
import { getOcrEngine } from "@/lib/queries/gaps";

/** Shown wherever a year's operating figures appear, when that year's Lampiran 1 was read by OCR. */
export default async function OcrNote({ year }: { year: number }) {
  if (!(await getOcrEngine(year))) return null;
  return (
    <NoteBand tone="linen" title={`The ${year} operating figures were read by OCR.`}>
      The published statement draws these tables without a text layer, so every amount was read from the page and
      checked against its printed totals. Programme and activity names are OCR readings.{" "}
      <Link href="/methodology#ocr">How this was done</Link>
    </NoteBand>
  );
}
