import Link from "next/link";
import { NoteBand } from "@/components/Boxed";
import GapNote from "@/components/GapNote";
import type { SourceNotes as Notes } from "@/lib/queries/gaps";

/** Every caveat on the operating figures below it: a missing statement page, and an OCR reading. */
export default function SourceNotes({ notes }: { notes: Notes }) {
  return (
    <>
      <GapNote gaps={notes.gaps} />
      {notes.ocrEngine && (
        <NoteBand tone="linen" title={`The ${notes.year} operating figures were read by OCR.`}>
          The published statement draws these tables without a text layer, so every amount was read from the page. Each
          printed total equals the sum of its rows or is a misprint confirmed on the page. Programme and activity names
          are OCR readings. <Link href="/methodology#ocr">How this was done</Link>
        </NoteBand>
      )}
    </>
  );
}
