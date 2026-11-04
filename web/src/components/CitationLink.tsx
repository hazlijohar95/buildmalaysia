import { citationHref, citationLabel } from "@/lib/citations";

interface Props {
  /** Fiscal year of the statement the page belongs to. */
  year: number;
  docUrl: string;
  pdfPage: number;
  bookPage: number;
  /** The row is printed across a two-page spread starting at pdfPage. */
  spread?: boolean;
  className?: string;
}

export default function CitationLink({
  year,
  docUrl,
  pdfPage,
  bookPage,
  spread = false,
  className,
}: Props) {
  return (
    <a
      href={citationHref(docUrl, pdfPage)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={{ color: "var(--muted)", fontSize: "0.7rem", whiteSpace: "nowrap" }}
    >
      {citationLabel(year, bookPage, spread)}
    </a>
  );
}
