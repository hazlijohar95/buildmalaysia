import { formatFetchDate, newestFirst, sourceKindLabel, sourcePagePath, type SourceDocument } from "@/lib/sources";

export const FEED_PATH = "/feed.xml";
export const FEED_TITLE = "Build Malaysia: source documents";

/**
 * An Atom feed with one entry per loaded source document, newest fetch first. Atom rather than RSS because an entry
 * can carry two typed links: the site page that shows the document (alternate) and the official PDF (related).
 */
export function renderFeed(docs: readonly SourceDocument[], site: URL): string {
  const entries = newestFirst(docs);
  const feedUrl = new URL(FEED_PATH, site).href;
  const updated = entries[0]?.retrievedAt ?? "1970-01-01T00:00:00Z";
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom">`,
    `  <id>${xml(feedUrl)}</id>`,
    `  <title>${xml(FEED_TITLE)}</title>`,
    `  <subtitle>Each official document Build Malaysia reads its figures from, as it is loaded.</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${xml(feedUrl)}"/>`,
    `  <link rel="alternate" type="text/html" href="${xml(new URL("/", site).href)}"/>`,
    `  <author><name>Build Malaysia</name></author>`,
    `  <updated>${updated}</updated>`,
    ...entries.map((doc) => renderEntry(doc, site)),
    `</feed>`,
    ``,
  ].join("\n");
}

function renderEntry(doc: SourceDocument, site: URL): string {
  const page = new URL(sourcePagePath(doc), site).href;
  const summary =
    `${doc.title}, published by ${doc.publisher} (${doc.pageCount} pages). ` +
    `The date on this entry is when Build Malaysia fetched the document, ${formatFetchDate(doc)}, ` +
    `not when it was published. Official PDF: ${doc.url} (SHA-256 ${doc.sha256}).`;
  return [
    `  <entry>`,
    // The hash is in the id, so a corrected PDF republished under the same address is a new entry.
    `    <id>tag:buildmalaysia.com,2026:source/${xml(doc.id)}/${doc.sha256}</id>`,
    `    <title>${xml(`${sourceKindLabel(doc)}: ${doc.title}`)}</title>`,
    `    <link rel="alternate" type="text/html" href="${xml(page)}"/>`,
    `    <link rel="related" type="application/pdf" href="${xml(doc.url)}" title="Official PDF"/>`,
    `    <author><name>${xml(doc.publisher)}</name></author>`,
    `    <published>${doc.retrievedAt}</published>`,
    `    <updated>${doc.retrievedAt}</updated>`,
    `    <summary type="text">${xml(summary)}</summary>`,
    `  </entry>`,
  ].join("\n");
}

const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

function xml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}
