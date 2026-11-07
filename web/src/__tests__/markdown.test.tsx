import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CitationLink from "@/components/CitationLink";
import { Money } from "@/components/Figures";
import { citationHref, citationLabel } from "@/lib/citations";
import { htmlToMarkdown } from "@/lib/markdown";
import { parseSen } from "@/lib/money";

const PDF = "https://www.anm.gov.my/statements/2025.pdf";
const PAGE_URL = new URL("https://buildmalaysia.com/2025");

function page(main: string): string {
  return `<!doctype html><html><head><title>Federal spending 2025 | Build Malaysia</title>
    <meta name="description" content="What the government spent"></head>
    <body><header><nav><a href="/spending">Spending menu</a></nav></header>
    <main id="main">${main}</main>
    <footer><a href="/about">Footer link</a></footer><script>window.tracker = 1</script></body></html>`;
}

const main = renderToStaticMarkup(
  <>
    <div aria-hidden="true">Reading the statements</div>
    <h1>Federal spending 2025</h1>
    <p>
      Operating is <Money sen={parseSen(33_606_926_296_850)} /> (
      <CitationLink year={2025} docUrl={PDF} pdfPage={211} bookPage={197} />
      ).
    </p>
    <svg>
      <text>Chart label</text>
    </svg>
    <table>
      <thead>
        <tr>
          <th>Year</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <a href="/2024">2024</a>
          </td>
          <td>
            <Money sen={parseSen(40_552_054_385_525)} />
          </td>
        </tr>
        <tr>
          <td>2025</td>
          <td>A | B</td>
        </tr>
      </tbody>
    </table>
  </>,
);

describe("htmlToMarkdown", () => {
  const markdown = htmlToMarkdown(page(main), PAGE_URL);

  it("keeps a citation link's text and its PDF page anchor", () => {
    expect(markdown).toContain(`[${citationLabel(2025, 197)}](${citationHref(PDF, 211)})`);
  });

  it("gives the exact figure a screen reader hears, not the rounded one", () => {
    expect(markdown).toContain("Operating is RM\u00a0336,069,262,968.50 (");
    expect(markdown).not.toContain("336.07");
  });

  it("turns a table into a Markdown table with absolute links", () => {
    expect(markdown).toContain(
      [
        "| Year | Total |",
        "| --- | --- |",
        "| [2024](https://buildmalaysia.com/2024) | RM\u00a0405,520,543,855.25 |",
        "| 2025 | A \\| B |",
      ].join("\n"),
    );
  });

  it("starts with front matter naming the page", () => {
    expect(markdown.startsWith('---\ntitle: "Federal spending 2025 | Build Malaysia"\n')).toBe(true);
    expect(markdown).toContain('url: "https://buildmalaysia.com/2025"');
    expect(markdown).toContain("# Federal spending 2025");
  });

  it("leaves out the site's navigation, footer, scripts, charts and hidden content", () => {
    for (const dropped of ["Spending menu", "Footer link", "tracker", "Chart label", "Reading the statements"]) {
      expect(markdown).not.toContain(dropped);
    }
  });

  it("keeps a paragraph that starts like a list item or heading a paragraph, without changing its text", () => {
    const markdown = htmlToMarkdown(page(`<p>2018. Printed total cost rose</p><p># 5 votes</p>`), PAGE_URL);
    expect(markdown).toContain("\n2018\\. Printed total cost rose\n");
    expect(markdown).toContain("\n\\# 5 votes\n");
  });

  it("keeps apart text that a phone lays out apart", () => {
    const html = page(
      `<span class="flex gap-2"><span>Revised RM 1</span><span>Spent RM 2</span></span>` +
        `<h3><span class="font-mono mr-3">010000</span>Pengurusan</h3>` +
        `<p class="max-lg:hidden">Desktop header</p><p class="hidden group-has-checked:block">Revealed column</p>`,
    );
    const markdown = htmlToMarkdown(html, PAGE_URL);
    expect(markdown).toContain("Revised RM 1 Spent RM 2");
    expect(markdown).toContain("### 010000 Pengurusan");
    expect(markdown).toContain("Revealed column");
    expect(markdown).not.toContain("Desktop header");
  });
});
