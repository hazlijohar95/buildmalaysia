import Link from "next/link";

/** A visible note wherever operating figures were read by OCR because the statement's tables have no text layer. */
export default function OcrNote({ year, engine }: { year: number; engine: string | null }) {
  if (!engine) return null;
  return (
    <section className="border-b-2 border-foreground bg-linen-200 px-5 py-6 sm:px-8 md:px-16" role="note">
      <div className="mx-auto max-w-7xl">
        <p className="m-0 font-semibold">The {year} operating figures were read by OCR.</p>
        <p className="m-0 mt-2 max-w-4xl text-charcoal-800">
          The published {year} Statement of Operating Expenditure (Lampiran 1) draws its characters as outlines with no
          text layer, so its tables were read by OCR. Every amount was checked against the shape of the digits the PDF draws, and every
          printed total either equals the sum of its rows or is a misprint confirmed on the page. Programme and activity
          names are OCR readings and are not checked the same way.{" "}
          <Link href="/methodology#ocr">How this was done</Link>
        </p>
      </div>
    </section>
  );
}
