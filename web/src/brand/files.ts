// Every downloadable logo and icon file, rendered on request from carta.ts by app/brand/files/[name]/route.tsx.
// The /brand page, the manifest and the layout's icon links all read this list.
import { svgImage } from "./carta";

interface Common {
  name: string;
  label: string;
  note: string;
  /** Background for the preview on /brand, where the file is meant for a dark ground. */
  ground?: "biru";
}
export type BrandFile = Common &
  ({ format: "svg"; svg: string } | { format: "png"; svg: string; width: number; height: number });

export const BRAND_FILES: readonly BrandFile[] = [
  {
    name: "build-malaysia.svg",
    label: "Logo",
    note: "Stacked. The primary lockup, for light grounds.",
    format: "svg",
    svg: svgImage("stacked").svg,
  },
  {
    name: "build-malaysia-on-biru.svg",
    label: "Logo on Biru",
    note: "Stacked, “Build” in Putih, for dark grounds.",
    format: "svg",
    svg: svgImage("stacked", { tone: "dark" }).svg,
    ground: "biru",
  },
  {
    name: "build-malaysia-inline.svg",
    label: "Logo, inline",
    note: "For one-line spaces.",
    format: "svg",
    svg: svgImage("inline").svg,
  },
  {
    name: "carta.svg",
    label: "Flag",
    note: "Where “Build Malaysia” is written nearby.",
    format: "svg",
    svg: svgImage("flag").svg,
  },
  { name: "icon.svg", label: "Icon", note: "Favicon and avatar.", format: "svg", svg: svgImage("icon").svg },
  {
    name: "build-malaysia.png",
    label: "Logo",
    note: "1120px wide, for documents and slides.",
    format: "png",
    ...svgImage("stacked", { width: 1120 }),
  },
  {
    name: "apple-touch-icon.png",
    label: "Apple touch icon",
    note: "180 × 180.",
    format: "png",
    ...svgImage("icon", { width: 180 }),
  },
  { name: "icon-192.png", label: "App icon", note: "192 × 192.", format: "png", ...svgImage("icon", { width: 192 }) },
  { name: "icon-512.png", label: "App icon", note: "512 × 512.", format: "png", ...svgImage("icon", { width: 512 }) },
  {
    name: "icon-maskable-512.png",
    label: "Maskable icon",
    note: "512 × 512, padded for Android’s icon masks.",
    format: "png",
    ...svgImage("icon", { width: 512, maskable: true }),
  },
];

export const brandFileUrl = (name: string) => `/brand/files/${name}`;
