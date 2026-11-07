import { describe, expect, it } from "vitest";
import { CLEAR_SPACE, PALETTE, layout } from "@/brand/carta";
import { contrast, grade } from "@/brand/contrast";
import { BRAND_FILES } from "@/brand/files";
import { BRAND_ZIP } from "@/brand/paths";
import { PAIRINGS, SECONDARY, TERMS, TYPEFACES, readme } from "@/brand/guide";
import { makeAspects, makeImage, serverCaption } from "@/brand/make";
import {
  GROUNDS,
  LOCKUPS,
  WIDTHS,
  aspectKey,
  makeCaption,
  makeName,
  parseMakeName,
  parseMakeQuery,
  type MakeSpec,
} from "@/brand/make-spec";
import { tokensCss, tokensJson } from "@/brand/tokens";
import { logoPdf } from "@/brand/pdf";
import { CONTACT_EMAIL } from "@/lib/contact";
import { REST, SERIES, TRACK } from "@/styles/charts/series";
import { colours } from "@/styles/colours";

describe("contrast", () => {
  it("runs from 1 for a colour on itself to 21 for black on white, either way round", () => {
    expect(contrast("#777777", "#777777")).toBe(1);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("grades at WCAG's thresholds, without rounding up", () => {
    expect([7, 6.99, 4.5, 4.49, 3, 2.99].map(grade)).toEqual(["AAA", "AA", "AA", "AA large", "AA large", "Fails"]);
  });
});

describe("the brand sheet's colour claims", () => {
  it("lists only text pairings that pass AA, and a 'never' pairing that fails it", () => {
    for (const p of PAIRINGS) {
      const ratio = contrast(p.fg, p.bg);
      if (p.kind === "text") expect(ratio, p.label).toBeGreaterThanOrEqual(4.5);
      else expect(ratio, p.label).toBeLessThan(4.5);
    }
  });

  it("names each chart colour by the token it is", () => {
    const families: Record<string, Record<string, string>> = colours;
    for (const s of [...SERIES, REST, TRACK]) {
      const [family, step] = s.token.split("-");
      expect(families[family]?.[step], s.token).toBe(s.hex);
    }
  });

  it("keeps every chart series at least 4:1 against the bar track", () => {
    for (const s of SERIES) expect(contrast(s.hex, TRACK.hex), s.token).toBeGreaterThanOrEqual(4);
  });
});

describe("the print PDF", () => {
  const pdf = logoPdf();

  it("is a well-formed PDF whose cross-reference points at each object", () => {
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    const offsets = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("states the content stream's length exactly", () => {
    const m = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(pdf);
    expect(m?.[2].length).toBe(Number(m?.[1]));
  });

  it("is the stacked logo's size and paints in the flag's official CMYK", () => {
    const { width, height } = layout("stacked").viewBox;
    expect(pdf).toContain(`/MediaBox [0 0 ${width} ${height}]`);
    for (const c of Object.values(PALETTE)) {
      const op =
        c.cmyk
          .split(" ")
          .map((v) => String(Number(v) / 100))
          .join(" ") + " k";
      expect(pdf, c.name).toContain(op);
    }
  });
});

describe("brand files", () => {
  it("names every file once, and never the zip's name", () => {
    const names = BRAND_FILES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(BRAND_ZIP);
  });

  it("includes every icon the layout and the manifest link to", () => {
    const names = BRAND_FILES.map((f) => f.name);
    for (const icon of ["icon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
      expect(names).toContain(icon);
    }
  });

  it("ships a README with the colours, the typefaces, the terms and the contact", () => {
    const text = readme();
    for (const c of Object.values(PALETTE)) expect(text).toContain(c.hex.toUpperCase());
    for (const t of TYPEFACES) expect(text).toContain(t.source);
    for (const t of [...TERMS.may, ...TERMS.mayNot]) expect(text).toContain(t);
    expect(text).toContain(CONTACT_EMAIL);
  });
});

describe("the logo builder", () => {
  const specs: MakeSpec[] = LOCKUPS.flatMap((l) =>
    GROUNDS.flatMap((g) => [
      { lockup: l.id, ground: g.id, format: "svg" as const },
      ...WIDTHS.map((width) => ({ lockup: l.id, ground: g.id, format: "png" as const, width })),
    ]),
  );

  it("reads back every name it gives, and the same spec from the form's fields", () => {
    for (const spec of specs) {
      expect(parseMakeName(makeName(spec))).toEqual(spec);
      const q = new URLSearchParams({ lockup: spec.lockup, ground: spec.ground, format: spec.format });
      if (spec.format === "png") q.set("width", String(spec.width));
      expect(parseMakeQuery(q)).toEqual(spec);
    }
  });

  it("refuses any name or field outside what it offers, so the cache holds a bounded set", () => {
    for (const name of [
      "build-malaysia-stacked-biru-1000.png",
      "build-malaysia-stacked-biru-4096.png",
      "build-malaysia-stacked-red-1024.png",
      "build-malaysia-wide-biru-1024.png",
      "build-malaysia-stacked-biru-1024.svg",
      "build-malaysia-stacked-biru.png",
      "../build-malaysia-stacked-biru.svg",
    ]) {
      expect(parseMakeName(name), name).toBeNull();
    }
    expect(parseMakeQuery(new URLSearchParams("lockup=icon&ground=biru&format=png"))).toBeNull();
  });

  it("sets a ground with four stripes of clear space, and crops to the lockup without one", () => {
    const art = layout("stacked").viewBox;
    const onBiru = makeImage({ lockup: "stacked", ground: "biru", format: "svg" });
    expect(onBiru.width).toBe(art.width + 2 * CLEAR_SPACE);
    expect(onBiru.svg).toContain(`fill="${PALETTE.biru.hex}"`);
    expect(onBiru.svg).toContain(`fill="${PALETTE.putih.hex}"`);
    expect(makeImage({ lockup: "stacked", ground: "clear", format: "svg" }).width).toBe(art.width);
    expect(makeImage({ lockup: "icon", ground: "white", format: "png", width: 512 }).width).toBe(512);
  });

  it("crops the icon's canton to its square on any ground", () => {
    const { svg } = makeImage({ lockup: "icon", ground: "white", format: "svg" });
    expect(svg).toMatch(/<clipPath id="icon-square">/);
    expect(svg).toMatch(/<g clip-path="url\(#icon-square\)">/);
  });

  it("gives the browser the same caption the server writes", () => {
    const aspects = makeAspects();
    for (const spec of specs) expect(makeCaption(spec, aspects[aspectKey(spec)])).toBe(serverCaption(spec));
  });
});

describe("colour tokens", () => {
  it("carry every flag, site and series colour in both files", () => {
    const css = tokensCss();
    const json = tokensJson();
    expect(() => JSON.parse(json)).not.toThrow();
    for (const hex of [...Object.values(PALETTE), ...SECONDARY, ...SERIES].map((c) => c.hex)) {
      expect(css).toContain(hex);
      expect(json).toContain(hex);
    }
  });
});
