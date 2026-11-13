import { cn } from "@/lib/cn";
import { citationHref } from "@/lib/citations";
import { stateCitationLabel } from "@/lib/states";

/** A link to the page of a state's statement a figure was read from, styled like CitationLink. */
export default function StateCitation({
  name,
  year,
  docUrl,
  pdfPage,
  title,
  className,
}: {
  name: string;
  year: number;
  docUrl: string;
  pdfPage: number;
  /** The printed lines the figure was read from, shown on hover. */
  title?: string;
  className?: string;
}) {
  return (
    <a
      href={citationHref(docUrl, pdfPage)}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cn(
        "text-xs whitespace-nowrap text-charcoal-600 underline decoration-1 underline-offset-[0.18em] hover:decoration-2",
        className,
      )}
    >
      {stateCitationLabel(name, year, pdfPage)}
    </a>
  );
}
