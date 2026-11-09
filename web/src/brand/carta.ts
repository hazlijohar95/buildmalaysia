// Carta: the Jalur Gemilang drawn to the government's construction sheet, with its fourteen stripes cut as a
// ranked bar chart. The header, footer, loaders, icons, link previews and downloads all draw from this module.
// Construction sheet: https://www.asean.org/wp-content/uploads/2012/05/NATIONAL-FLAG-OF-MALAYSIA.pdf
import { WORDMARK } from "./wordmark";

/** Drawing units per stripe. The sheet's unit is one stripe. */
export const STRIPE = 10;

/**
 * Print values: Jabatan Penerangan, Bendera Kita: Jalur Gemilang (2017), Jadual 1. The government publishes no
 * screen values; the hex codes are those of Wikimedia's reference drawing of the flag.
 */
export const PALETTE = {
  biru: { name: "Biru", hex: "#000066", pantone: "2768 C", cmyk: "100 100 0 0", role: "Canton" },
  merah: { name: "Merah", hex: "#cc0000", pantone: "199 C", cmyk: "0 100 100 0", role: "Seven stripes" },
  kuning: { name: "Kuning", hex: "#ffcc00", pantone: "108 C", cmyk: "0 0 100 0", role: "Crescent and star" },
  putih: { name: "Putih", hex: "#ffffff", pantone: null, cmyk: "0 0 0 0", role: "Seven stripes" },
} as const;
export type FlagColour = keyof typeof PALETTE;

export const FLAG = { width: 28 * STRIPE, height: 14 * STRIPE } as const;
export const CANTON = { width: 14 * STRIPE, height: 8 * STRIPE } as const;

/** The sheet's measurements, in stripes from the canton's top-left corner. */
export const SHEET = {
  crescent: { cy: 4, outer: { cx: 5.75, r: 3 }, inner: { cx: 6.5, r: 2.75 } },
  star: { cx: 8.75, cy: 4, outer: 2.5, inner: 1, points: 14 },
} as const;

export interface Stripe {
  n: number;
  x: number;
  y: number;
  width: number;
  colour: "merah" | "putih";
}

/** Stripe n (0 at the top) ends at 28 − n stripes, so the fly edge runs at 45°. The top eight start at the canton. */
export const STRIPES: readonly Stripe[] = Array.from({ length: 14 }, (_, n) => {
  const x = n < 8 ? CANTON.width : 0;
  return { n, x, y: n * STRIPE, width: FLAG.width - n * STRIPE - x, colour: n % 2 === 0 ? "merah" : "putih" };
});

const num = (v: number) => +v.toFixed(2);

/** Where the crescent's two circles cross: its horns, unrounded. */
export const CRESCENT_HORNS = (() => {
  const { cy, outer, inner } = SHEET.crescent;
  const R = outer.r * STRIPE;
  const r = inner.r * STRIPE;
  const d = (inner.cx - outer.cx) * STRIPE;
  const a = (R * R - r * r + d * d) / (2 * d);
  const h = Math.sqrt(R * R - a * a);
  return { x: outer.cx * STRIPE + a, top: cy * STRIPE - h, bottom: cy * STRIPE + h };
})();

/** The crescent is the part of the outer circle the inner circle does not cover; it opens toward the fly. */
export const CRESCENT_PATH = (() => {
  const R = SHEET.crescent.outer.r * STRIPE;
  const r = SHEET.crescent.inner.r * STRIPE;
  const [x, top, bottom] = [num(CRESCENT_HORNS.x), num(CRESCENT_HORNS.top), num(CRESCENT_HORNS.bottom)];
  return `M${x} ${top}A${R} ${R} 0 1 0 ${x} ${bottom}A${r} ${r} 0 1 1 ${x} ${top}Z`;
})();

export const STAR_CENTRE = { x: SHEET.star.cx * STRIPE, y: SHEET.star.cy * STRIPE } as const;

/** Turning the star by one point leaves it looking exactly as it started, so motion stops on-spec. */
export const STAR_STEP_DEG = 360 / SHEET.star.points;

/** 14 points, the first straight up, inner vertices on the sheet's inner circle. */
export const STAR_VERTICES: readonly { x: number; y: number }[] = Array.from(
  { length: SHEET.star.points * 2 },
  (_, i) => {
    const angle = (i * Math.PI) / SHEET.star.points - Math.PI / 2;
    const radius = (i % 2 ? SHEET.star.inner : SHEET.star.outer) * STRIPE;
    return { x: num(STAR_CENTRE.x + radius * Math.cos(angle)), y: num(STAR_CENTRE.y + radius * Math.sin(angle)) };
  },
);
export const STAR_PATH = "M" + STAR_VERTICES.map((p) => `${p.x} ${p.y}`).join("L") + "Z";

export type Lockup = "stacked" | "inline" | "flag" | "icon";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  viewBox: Box;
  /** Where the flag's top-left corner sits; the icon draws only the canton. */
  flag: { x: number; y: number };
  word: { x: number; y: number; scale: number } | null;
}

const snapDown = (v: number) => Math.floor(v / 5) * 5;
const snapUp = (v: number) => Math.ceil(v / 5) * 5;

function stacked(): Layout {
  // "Build" exactly as wide as the flag; the flag starts on a whole stripe below it.
  const scale = FLAG.width / WORDMARK.width;
  const flagY = Math.ceil((WORDMARK.height * scale + 1.5 * STRIPE) / STRIPE) * STRIPE;
  return {
    viewBox: { x: 0, y: 0, width: FLAG.width, height: flagY + FLAG.height },
    flag: { x: 0, y: flagY },
    word: { x: 0, y: 0, scale },
  };
}

function inline(): Layout {
  // The cap height of "B" matches the flag; the baseline sits on the flag's bottom edge.
  const scale = FLAG.height / WORDMARK.capHeight;
  const wordY = FLAG.height - WORDMARK.baseline * scale;
  const flagX = Math.ceil((WORDMARK.width * scale + 3 * STRIPE) / STRIPE) * STRIPE;
  const top = snapDown(Math.min(0, wordY));
  const bottom = snapUp(Math.max(FLAG.height, wordY + WORDMARK.height * scale));
  return {
    viewBox: { x: 0, y: top, width: flagX + FLAG.width, height: bottom - top },
    flag: { x: flagX, y: 0 },
    word: { x: 0, y: wordY, scale },
  };
}

/** The canton cropped square around the crescent and star, whose drawing is centred at (7, 4) stripes. */
export const ICON_VIEWBOX: Box = { x: 2 * STRIPE, y: -1 * STRIPE, width: 10 * STRIPE, height: 10 * STRIPE };
/** Android masks crop to as little as the inner 80%; this keeps the crescent and star inside it. */
export const MASKABLE_VIEWBOX: Box = { x: 0.2 * STRIPE, y: -2.8 * STRIPE, width: 13.6 * STRIPE, height: 13.6 * STRIPE };

export function layout(lockup: Lockup): Layout {
  switch (lockup) {
    case "stacked":
      return stacked();
    case "inline":
      return inline();
    case "flag":
      return { viewBox: { x: 0, y: 0, ...FLAG }, flag: { x: 0, y: 0 }, word: null };
    case "icon":
      return { viewBox: ICON_VIEWBOX, flag: { x: 0, y: 0 }, word: null };
  }
}

export const viewBoxAttr = (b: Box) => `${num(b.x)} ${num(b.y)} ${num(b.width)} ${num(b.height)}`;

export type Tone = "light" | "dark";
export const wordColour = (tone: Tone) => (tone === "dark" ? PALETTE.putih.hex : PALETTE.biru.hex);

const cantonMarkup = () =>
  `<rect width="${CANTON.width}" height="${CANTON.height}" fill="${PALETTE.biru.hex}"/>` +
  `<path d="${CRESCENT_PATH}" fill="${PALETTE.kuning.hex}"/><path d="${STAR_PATH}" fill="${PALETTE.kuning.hex}"/>`;

/** The clear space every lockup keeps on each side: four stripes. */
export const CLEAR_SPACE = 4 * STRIPE;

/**
 * Self-contained SVG for files, icons and link previews: fills only, no classes, so it renders the same in a
 * browser, an image renderer, or a design tool. With a `ground`, the image is set on that colour with its clear
 * space around it; without one it is cropped to the lockup on a transparent ground.
 */
export function svgImage(
  lockup: Lockup,
  opts: { tone?: Tone; width?: number; maskable?: boolean; ground?: string } = {},
): { svg: string; width: number; height: number } {
  const { tone = "light", maskable = false, ground } = opts;
  const l = layout(lockup);
  const art = maskable ? MASKABLE_VIEWBOX : l.viewBox;
  const box = ground
    ? {
        x: art.x - CLEAR_SPACE,
        y: art.y - CLEAR_SPACE,
        width: art.width + 2 * CLEAR_SPACE,
        height: art.height + 2 * CLEAR_SPACE,
      }
    : art;
  const width = opts.width ?? box.width;
  const height = num((width * box.height) / box.width);
  const parts: string[] = [];
  if (ground) {
    parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${ground}"/>`);
  }
  if (lockup === "icon") {
    // The icon is the canton cropped to a square: clipped here, since a ground widens the viewBox past the crop.
    const square = `x="${art.x}" y="${art.y}" width="${art.width}" height="${art.height}"`;
    parts.push(
      `<clipPath id="icon-square"><rect ${square}/></clipPath>`,
      `<g clip-path="url(#icon-square)"><rect ${square} fill="${PALETTE.biru.hex}"/>${cantonMarkup()}</g>`,
    );
  } else {
    if (l.word) {
      const { x, y, scale } = l.word;
      parts.push(
        `<path transform="translate(${num(x)} ${num(y)}) scale(${scale})" d="${WORDMARK.path}" fill="${wordColour(tone)}"/>`,
      );
    }
    parts.push(`<g transform="translate(${l.flag.x} ${l.flag.y})">`);
    for (const s of STRIPES) {
      parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${STRIPE}" fill="${PALETTE[s.colour].hex}"/>`);
    }
    parts.push(cantonMarkup(), "</g>");
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxAttr(box)}" width="${width}" height="${height}" shape-rendering="geometricPrecision">` +
    parts.join("") +
    "</svg>";
  return { svg, width, height };
}

export const svgDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
