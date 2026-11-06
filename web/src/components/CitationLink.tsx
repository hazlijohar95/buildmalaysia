import { cn } from "@/lib/cn";
import { citationHref, citationLabel, type CitedSource } from "@/lib/citations";

interface Props {
  /** Fiscal year of the statement the page belongs to. */
  year: number;
  docUrl: string;
  pdfPage: number;
  bookPage: number;
  /** The row is printed across a two-page spread starting at pdfPage. */
  spread?: boolean;
  /** Defaults to JANM; budget pages cite the MOF budget book. */
  source?: CitedSource;
  className?: string;
}

export default function CitationLink({
  year,
  docUrl,
  pdfPage,
  bookPage,
  spread = false,
  source = "JANM",
  className,
}: Props) {
  return (
    <a
      href={citationHref(docUrl, pdfPage)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "text-xs whitespace-nowrap text-charcoal-600 underline decoration-1 underline-offset-[0.18em] hover:decoration-2",
        className,
      )}
    >
      {citationLabel(year, bookPage, spread, source)}
    </a>
  );
}
