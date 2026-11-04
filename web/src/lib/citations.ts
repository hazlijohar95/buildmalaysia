/** Build a PDF citation href: base URL + #page=N (pdf_page, 1-based). */
export function citationHref(url: string, pdfPage: number): string {
  return `${url}#page=${pdfPage}`;
}

/** Human-readable citation label using the book page number; a spread names both pages. */
export function citationLabel(bookPage: number, spread = false): string {
  return spread ? `JANM 2025, pp. ${bookPage}–${bookPage + 1}` : `JANM 2025, p. ${bookPage}`;
}

/** Convert a vote code like "T.03" to its URL slug "T03". */
export function voteCodeToSlug(code: string): string {
  return code.replace(".", "");
}

/** Convert a URL slug like "T03" back to a vote code "T.03". */
export function slugToVoteCode(slug: string): string {
  if (/^[TBP]\d{2}$/.test(slug)) {
    return `${slug[0]}.${slug.slice(1)}`;
  }
  return slug;
}
