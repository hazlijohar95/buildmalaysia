import { citationHref, citationLabel } from "@/lib/citations";

interface Props {
  docUrl: string;
  pdfPage: number;
  bookPage: number;
  className?: string;
}

export default function CitationLink({
  docUrl,
  pdfPage,
  bookPage,
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
      {citationLabel(bookPage)}
    </a>
  );
}
