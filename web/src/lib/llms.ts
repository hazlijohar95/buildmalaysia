import type { NavLink } from "@/components/MainLayout/Header";
import { FEED_PATH } from "@/lib/feed";
import type { SiteNav } from "@/lib/nav";
import { markdownPath } from "@/lib/representation";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { formatFetchDate, sourceKindLabel, sourcePagePath, type SourceDocument } from "@/lib/sources";

/**
 * The site's /llms.txt (https://llmstxt.org): what the site is, how its citations work, and links to the Markdown
 * form of each section and source. Built from the header's nav and the loaded documents, so it lists what the site
 * shows.
 */
export function renderLlmsTxt(nav: SiteNav, docs: readonly SourceDocument[], site: URL): string {
  const md = (path: string) => new URL(markdownPath(path), site).href;
  const link = ({ href, label, note }: Pick<NavLink, "href" | "label" | "note">) =>
    `- [${label}](${md(href)})${note ? `: ${note}` : ""}`;

  const pages = nav.items.flatMap((item) => {
    if (item.kind === "link") return [link(item)];
    const years = item.years?.length
      ? [`- ${item.label} by year: ${item.years.map((y) => `[${y.label}](${md(y.href)})`).join(", ")}`]
      : [];
    return [...item.links.map(link), ...years];
  });

  const sources = [...docs]
    .sort((a, b) => kindOrder(a) - kindOrder(b) || year(b) - year(a))
    .map(
      (doc) =>
        `- [${doc.title}](${doc.url}): ${sourceKindLabel(doc)}, ${doc.publisher}, ${doc.pageCount} pages, ` +
        `SHA-256 ${doc.sha256}, fetched ${formatFetchDate(doc)}. Figures on the site: ${md(sourcePagePath(doc))}`,
    );

  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Every figure links to the page of the official PDF it was read from. A citation link's text names the document " +
      "and the page number printed on that page, as `JANM <year>, p. <page>` for the Accountant General's audited " +
      "federal financial statements or `MOF Budget <year>, p. <page>` for the Ministry of Finance budget book; " +
      "its URL is the publisher's PDF with `#page=<n>`, the page's position in the PDF file. A document is loaded " +
      "only when every total it prints is recomputed exactly from its extracted line items.",
    "",
    "Every page is also served as Markdown: add `.md` to its path (the home page is `/index.md`), or request the " +
      "page with `Accept: text/markdown`. The Markdown keeps each figure and its citation link, and tables stay " +
      "tables; navigation and charts are left out.",
    "",
    "## Pages",
    "",
    link({ href: "/", label: "Home" }),
    ...pages,
    link(nav.cta),
    "",
    "## Sources",
    "",
    ...sources,
    "",
    "## Data",
    "",
    link({
      href: "/data",
      label: "Download data",
      note: "Every figure as CSV, with its source page and URL in every row",
    }),
    `- [Source documents feed](${new URL(FEED_PATH, site).href}): Atom, one entry per document as it is loaded`,
    "",
    "## Optional",
    "",
    link({
      href: "/subscribe",
      label: "Get alerts",
      note: "One email when a new budget book or audited statement is loaded",
    }),
    link({ href: "/brand", label: "Brand" }),
    "",
  ].join("\n");
}

function kindOrder(doc: SourceDocument): number {
  return doc.kind === "statement" ? 0 : 1;
}

function year(doc: SourceDocument): number {
  return doc.kind === "statement" ? doc.fiscalYear : doc.budgetYear;
}
