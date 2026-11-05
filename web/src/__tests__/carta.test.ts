import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  CANTON,
  CRESCENT_PATH,
  FLAG,
  PALETTE,
  STAR_CENTRE,
  STAR_VERTICES,
  STRIPE,
  STRIPES,
  layout,
  svgImage,
} from "@/brand/carta";
import { WORDMARK } from "@/brand/wordmark";

const distance = (p: { x: number; y: number }) => Math.hypot(p.x - STAR_CENTRE.x, p.y - STAR_CENTRE.y);

describe("Carta against the construction sheet", () => {
  it("is 1:2, 28 by 14 stripes", () => {
    expect(FLAG.width).toBe(2 * FLAG.height);
    expect(FLAG.height).toBe(14 * STRIPE);
  });

  it("has fourteen equal stripes, red at the top and white at the bottom", () => {
    expect(STRIPES).toHaveLength(14);
    expect(STRIPES.map((s) => s.colour)).toEqual(Array.from({ length: 14 }, (_, n) => (n % 2 ? "putih" : "merah")));
    expect(STRIPES.every((s, n) => s.y === n * STRIPE)).toBe(true);
  });

  it("puts the canton over the top eight stripes and half the width", () => {
    expect(CANTON).toEqual({ width: FLAG.width / 2, height: 8 * STRIPE });
    expect(STRIPES.filter((s) => s.x === CANTON.width).map((s) => s.n)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(STRIPES.filter((s) => s.x === 0).map((s) => s.n)).toEqual([8, 9, 10, 11, 12, 13]);
  });

  it("cuts the fly edge at 45°: stripe n ends at 28 − n", () => {
    for (const s of STRIPES) expect(s.x + s.width + s.y).toBe(FLAG.width);
    expect(STRIPES[13].width).toBeGreaterThan(CANTON.width);
  });

  it("draws a fourteen-point star of diameter 5 with inner circle 2, first point straight up, centred 8¾ in", () => {
    expect(STAR_CENTRE).toEqual({ x: 8.75 * STRIPE, y: 4 * STRIPE });
    expect(STAR_VERTICES).toHaveLength(28);
    STAR_VERTICES.forEach((p, i) => expect(distance(p)).toBeCloseTo(i % 2 ? 1 * STRIPE : 2.5 * STRIPE, 1));
    expect(STAR_VERTICES[0]).toEqual({ x: STAR_CENTRE.x, y: STAR_CENTRE.y - 2.5 * STRIPE });
  });

  it("starts the crescent where its two circles cross, on the fly side of the outer centre", () => {
    const [, x, y] = CRESCENT_PATH.match(/^M([\d.]+) ([\d.]+)A/) ?? [];
    expect(Number(x)).toBeGreaterThan(5.75 * STRIPE);
    expect(Math.hypot(Number(x) - 5.75 * STRIPE, Number(y) - 4 * STRIPE)).toBeCloseTo(3 * STRIPE, 1);
    expect(Math.hypot(Number(x) - 6.5 * STRIPE, Number(y) - 4 * STRIPE)).toBeCloseTo(2.75 * STRIPE, 1);
  });
});

describe("lockups", () => {
  it("makes stacked “Build” exactly as wide as the flag, with the flag on a whole stripe", () => {
    const { word, flag, viewBox } = layout("stacked");
    expect(WORDMARK.width * (word?.scale ?? 0)).toBeCloseTo(FLAG.width);
    expect(flag.y % STRIPE).toBe(0);
    expect(viewBox.height).toBe(flag.y + FLAG.height);
  });

  it("puts every flag edge on a whole pixel at a whole-pixel stripe", () => {
    for (const lockup of ["stacked", "inline", "flag"] as const) {
      const { flag, viewBox } = layout(lockup);
      expect((flag.x - viewBox.x) % 5).toBe(0);
      expect((flag.y - viewBox.y) % 5).toBe(0);
    }
  });

  it("exports self-contained SVG with only the flag colours", () => {
    const { svg } = svgImage("stacked");
    expect(svg).not.toMatch(/class=|var\(/);
    const fills = new Set([...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]));
    expect(fills).toEqual(new Set(Object.values(PALETTE).map((c) => c.hex)));
  });
});

describe("theme tokens", () => {
  it("match the palette, so Tailwind's biru, merah and kuning are the flag's colours", () => {
    const css = readFileSync(resolve(__dirname, "../styles/brand.css"), "utf8");
    for (const key of ["biru", "merah", "kuning"] as const) {
      expect(css).toContain(`--color-${key}: ${PALETTE[key].hex};`);
    }
  });
});
