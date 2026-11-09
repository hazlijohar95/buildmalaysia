// Every downloadable logo and icon file, rendered on request from carta.ts by src/pages/brand/files/[name].ts.
// The /brand page, the manifest, the layout's icon links and the download-all zip all read these lists.
import { svgImage } from "./carta";
import { logoPdf } from "./pdf";
import { tokensCss, tokensJson } from "./tokens";

export type BrandFile = { name: string; note?: string } & (
  | { format: "svg"; svg: string }
  | { format: "png"; svg: string; width: number; height: number }
  | { format: "pdf"; pdf: string }
  | { format: "css" | "json"; text: string }
);

export interface Artwork {
  title: string;
  note: string;
  /** Preview ground on /brand, for artwork meant for a dark ground. */
  ground?: "biru";
  files: readonly BrandFile[];
}

const svg = (name: string, image: ReturnType<typeof svgImage>): BrandFile => ({ name, format: "svg", svg: image.svg });
const png = (name: string, image: ReturnType<typeof svgImage>, note?: string): BrandFile => ({
  name,
  note,
  format: "png",
  ...image,
});

export const BRAND_ARTWORKS: readonly Artwork[] = [
  {
    title: "Logo",
    note: "Stacked. The primary lockup, for light grounds.",
    files: [
      svg("build-malaysia.svg", svgImage("stacked")),
      png("build-malaysia.png", svgImage("stacked", { width: 1120 })),
      { name: "build-malaysia.pdf", note: "Print, in the flag's CMYK", format: "pdf", pdf: logoPdf() },
    ],
  },
  {
    title: "Logo on Biru",
    note: "Stacked, “Build” in Putih, for dark grounds.",
    ground: "biru",
    files: [
      svg("build-malaysia-on-biru.svg", svgImage("stacked", { tone: "dark" })),
      png("build-malaysia-on-biru.png", svgImage("stacked", { tone: "dark", width: 1120 })),
    ],
  },
  {
    title: "Inline",
    note: "For one-line spaces: signatures, slide footers.",
    files: [
      svg("build-malaysia-inline.svg", svgImage("inline")),
      png("build-malaysia-inline.png", svgImage("inline", { width: 1600 })),
    ],
  },
  {
    title: "Flag",
    note: "Where “Build Malaysia” is written nearby.",
    files: [svg("carta.svg", svgImage("flag")), png("carta.png", svgImage("flag", { width: 1120 }))],
  },
  {
    title: "Icon",
    note: "Favicon, avatar and home-screen icon.",
    files: [
      svg("icon.svg", svgImage("icon")),
      png("icon-512.png", svgImage("icon", { width: 512 })),
      png("icon-192.png", svgImage("icon", { width: 192 })),
      png("apple-touch-icon.png", svgImage("icon", { width: 180 }), "Apple touch icon"),
      png("icon-maskable-512.png", svgImage("icon", { width: 512, maskable: true }), "Maskable, for Android"),
    ],
  },
];

/** The palette as code: every flag, site, scale and chart colour. */
export const TOKEN_FILES: readonly BrandFile[] = [
  { name: "colours.css", note: "CSS custom properties", format: "css", text: tokensCss() },
  { name: "tokens.json", note: "Design tokens, for Figma", format: "json", text: tokensJson() },
];

export const BRAND_FILES: readonly BrandFile[] = [...BRAND_ARTWORKS.flatMap((a) => a.files), ...TOKEN_FILES];

const MEDIA_TYPES = {
  svg: "image/svg+xml; charset=utf-8",
  png: "image/png",
  pdf: "application/pdf",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
} as const;
export const mediaType = (file: BrandFile) => MEDIA_TYPES[file.format];

/** "SVG", "PNG · 1120 px", "PNG · 180 × 180". */
export function formatLabel(file: BrandFile): string {
  if (file.format !== "png") return file.format.toUpperCase();
  const size = file.width === file.height ? `${file.width} × ${file.height}` : `${file.width} px`;
  return `PNG · ${size}`;
}
