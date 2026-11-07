import { XMLParser } from "fast-xml-parser";
import { SyntaxValidator } from "fast-xml-validator";
import { describe, expect, it } from "vitest";
import { renderFeed } from "@/lib/feed";
import type { SourceDocument } from "@/lib/sources";

const SITE = new URL("https://buildmalaysia.com");

const statement: SourceDocument = {
  kind: "statement",
  fiscalYear: 2025,
  id: "janm-penyata-kewangan-2025",
  publisher: "Jabatan Akauntan Negara Malaysia",
  title: "Penyata Kewangan Kerajaan Persekutuan 2025",
  url: "https://www.anm.gov.my/2025_Penyata_Kewangan.pdf",
  sha256: "a".repeat(64),
  pageCount: 458,
  retrievedAt: "2026-11-03T21:54:34Z",
};

const budget: SourceDocument = {
  kind: "budget",
  budgetYear: 2027,
  id: "mof-anggaran-perbelanjaan-2027",
  publisher: "Kementerian Kewangan Malaysia",
  title: "Anggaran Perbelanjaan Persekutuan 2027 & <Lampiran>",
  url: "https://belanjawan.mof.gov.my/Anggaran.pdf?a=1&b=2",
  sha256: "b".repeat(64),
  pageCount: 586,
  retrievedAt: "2026-11-04T04:43:07Z",
};

const older: SourceDocument = { ...statement, fiscalYear: 2016, id: "janm-2016", retrievedAt: "2026-11-01T00:00:00Z" };

interface Link {
  "@_rel": string;
  "@_href": string;
}
interface Entry {
  title: string;
  updated: string;
  link: Link[];
  summary: { "#text": string };
}

function entries(xml: string): Entry[] {
  const parsed: { feed: { entry: Entry[] } } = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === "entry",
  }).parse(xml);
  return parsed.feed.entry;
}

describe("renderFeed", () => {
  const xml = renderFeed([older, statement, budget], SITE);

  it("is well-formed XML, with titles and URLs that need escaping", () => {
    expect(() => SyntaxValidator.validate("<feed><title>A & B</title></feed>")).toThrow();
    expect(SyntaxValidator.validate(xml)).toBe(true);
  });

  it("lists one entry per document, newest fetch first", () => {
    expect(entries(xml).map((e) => e.updated)).toEqual([budget.retrievedAt, statement.retrievedAt, older.retrievedAt]);
  });

  it("names the document and year, and links the site page and the official PDF", () => {
    const [first, second] = entries(xml);
    expect(first.title).toBe("Budget 2027: Anggaran Perbelanjaan Persekutuan 2027 & <Lampiran>");
    expect(first.link).toEqual([
      expect.objectContaining({ "@_rel": "alternate", "@_href": "https://buildmalaysia.com/budget/2027" }),
      expect.objectContaining({ "@_rel": "related", "@_href": budget.url }),
    ]);
    expect(second.title).toBe("Financial statements 2025: Penyata Kewangan Kerajaan Persekutuan 2025");
    expect(second.link[0]["@_href"]).toBe("https://buildmalaysia.com/2025");
  });

  it("says the entry's date is when the document was fetched", () => {
    expect(entries(xml)[1].summary["#text"]).toContain("when Build Malaysia fetched the document, 4 November 2026");
  });
});
