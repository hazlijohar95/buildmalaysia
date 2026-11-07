/** The two forms a page is served in: the HTML a browser renders, and the same page as Markdown. */
export type PageFormat = "html" | "markdown";

/** What a request asks for: the page, and the form it wants it in. */
export interface PageRequest {
  /** The HTML page's path, with any `.md` suffix removed. */
  pathname: string;
  format: PageFormat;
}

const MARKDOWN_SUFFIX = ".md";

/**
 * Reads the page and its form from a request. `/2025.md` (and `/index.md` for the home page) asks for Markdown by
 * its address; any other path asks by its Accept header.
 */
export function pageRequest(url: URL, accept: string | null): PageRequest {
  if (url.pathname.endsWith(MARKDOWN_SUFFIX)) {
    const base = url.pathname.slice(0, -MARKDOWN_SUFFIX.length);
    return { pathname: base === "/index" || base === "" ? "/" : base, format: "markdown" };
  }
  return { pathname: url.pathname, format: prefersMarkdown(accept) ? "markdown" : "html" };
}

/** The Markdown address of a page: `/2025` -> `/2025.md`, `/` -> `/index.md`. */
export function markdownPath(pathname: string): string {
  return pathname === "/" ? `/index${MARKDOWN_SUFFIX}` : `${pathname}${MARKDOWN_SUFFIX}`;
}

/**
 * True when the client names text/markdown and rates it at least as high as HTML. Browsers never name it, so they
 * keep getting HTML; `text/*` or `*\/*` alone is not a request for Markdown.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const ranges = accept.split(",").map(parseRange);
  const markdown = ranges.find((r) => r.type === "text/markdown")?.q ?? 0;
  const html =
    ranges.find((r) => r.type === "text/html")?.q ??
    ranges.find((r) => r.type === "text/*")?.q ??
    ranges.find((r) => r.type === "*/*")?.q ??
    0;
  return markdown > 0 && markdown >= html;
}

function parseRange(range: string): { type: string; q: number } {
  const [type, ...params] = range.split(";").map((part) => part.trim().toLowerCase());
  const q = params.find((p) => p.startsWith("q="));
  const value = q ? Number(q.slice(2)) : 1;
  return { type, q: Number.isFinite(value) ? value : 0 };
}
