// The brand sheet's rules as data: typefaces, colour pairings and the terms for using the logo. The /brand page, its
// tests and the README in the download-all zip all read them.
import { CONTACT_EMAIL } from "@/lib/contact";
import { hex } from "@/styles/colours";
import { PALETTE } from "./carta";

export interface Typeface {
  name: string;
  /** The CSS family stack the site sets it with. */
  family: "display" | "sans" | "mono";
  role: string;
  weights: string;
  source: string;
}

export const TYPEFACES: readonly Typeface[] = [
  {
    name: "Cal Sans",
    family: "display",
    role: "Headings, headline figures, and the “Build” of the logo.",
    weights: "SemiBold 600",
    source: "https://github.com/calcom/font",
  },
  {
    name: "Geist",
    family: "sans",
    role: "Everything people read at length: body text, tables, forms.",
    weights: "Regular 400, Medium 500, SemiBold 600",
    source: "https://github.com/vercel/geist-font",
  },
  {
    name: "Paper Mono",
    family: "mono",
    role: "Labels set in capitals, exact figures under rounded ones, ranks, codes and file names.",
    weights: "Regular 400, Medium 500, SemiBold 600",
    source: "https://github.com/paper-design/paper-mono",
  },
];

/** What anyone may do with the logo without asking, and what needs asking. */
export const TERMS = {
  may: [
    "Use it to link to Build Malaysia, or when you write, report or speak about it.",
    "Use it as drawn, from these files, with four stripes of clear space around it.",
  ],
  mayNot: [
    "Use it in a way that suggests Build Malaysia made, checked or endorses your work.",
    "Put it in your own name, product, logo or merchandise.",
  ],
  ask: `For anything else, write to ${CONTACT_EMAIL}.`,
  flag: "The design is Build Malaysia's; the flag in it belongs to everyone.",
} as const;

/** README.txt for the download-all zip. */
export function readme(): string {
  const rule = "-".repeat(60);
  const colours = Object.values(PALETTE).map(
    (c) =>
      `${c.name.padEnd(8)}${c.hex.toUpperCase().padEnd(10)}CMYK ${c.cmyk.padEnd(14)}${c.pantone ? `Pantone ${c.pantone}` : "No ink (paper)"}`,
  );
  return [
    "BUILD MALAYSIA: BRAND FILES",
    rule,
    "The full sheet, with construction, lockups and rules: https://buildmalaysia.com/brand",
    "",
    "FILES",
    "build-malaysia.*         The primary logo, for light grounds. The PDF is for print, in CMYK.",
    "build-malaysia-on-biru.* For dark grounds.",
    "build-malaysia-inline.*  For one-line spaces.",
    "carta.*                  The flag alone, where “Build Malaysia” is written nearby.",
    "icon*, apple-touch-icon  The icon, for favicons, avatars and home screens.",
    "colours.css, tokens.json The palette as CSS custom properties and as design tokens.",
    "",
    "COLOURS",
    "Pantone and CMYK: Jabatan Penerangan, Bendera Kita: Jalur Gemilang (2017), Jadual 1.",
    "Screen hex: Wikimedia's reference drawing; the government publishes no screen values.",
    ...colours,
    "",
    "TYPE",
    ...TYPEFACES.map((t) => `${t.name.padEnd(12)}${t.role} ${t.source}`),
    "",
    "YOU MAY",
    ...TERMS.may.map((t) => `- ${t}`),
    "",
    "YOU MAY NOT",
    ...TERMS.mayNot.map((t) => `- ${t}`),
    "",
    TERMS.ask,
    "",
    TERMS.flag,
    "",
  ].join("\r\n");
}

/** The site's paper and ink, beside the flag's four. */
export const SECONDARY = [
  { name: "Dakwat", hex: hex("charcoal", "1000"), token: "charcoal-1000", role: "Rules and text" },
  { name: "Kertas", hex: hex("linen", "50"), token: "linen-50", role: "Panels and menus" },
  { name: "Linen", hex: hex("linen", "100"), token: "linen-100", role: "Page ground" },
  { name: "Abu", hex: hex("charcoal", "600"), token: "charcoal-600", role: "Captions and notes" },
] as const;

export interface Pairing {
  fg: string;
  bg: string;
  label: string;
  use: string;
  /** "text" pairings must pass AA for body text; a "never" pairing is listed to warn against it. */
  kind: "text" | "never";
}

/** The text and ground pairings the site uses, and the one it must not. */
export const PAIRINGS: readonly Pairing[] = [
  { fg: hex("charcoal", "1000"), bg: hex("linen", "100"), label: "Dakwat on Linen", use: "Body text", kind: "text" },
  {
    fg: hex("charcoal", "700"),
    bg: hex("linen", "100"),
    label: "Charcoal 700 on Linen",
    use: "Secondary text and captions",
    kind: "text",
  },
  {
    fg: hex("charcoal", "600"),
    bg: hex("linen", "50"),
    label: "Abu on Kertas",
    use: "Notes and labels on panels",
    kind: "text",
  },
  { fg: hex("biru", "800"), bg: hex("linen", "100"), label: "Biru on Linen", use: "Links", kind: "text" },
  {
    fg: hex("linen", "50"),
    bg: hex("biru", "800"),
    label: "Kertas on Biru",
    use: "The menu bar and Biru buttons",
    kind: "text",
  },
  { fg: PALETTE.putih.hex, bg: hex("merah", "600"), label: "Putih on Merah", use: "Action buttons", kind: "text" },
  { fg: hex("merah", "600"), bg: hex("linen", "100"), label: "Merah on Linen", use: "Overspending", kind: "text" },
  {
    fg: hex("linen", "200"),
    bg: hex("charcoal", "1000"),
    label: "Linen 200 on Dakwat",
    use: "The footer",
    kind: "text",
  },
  {
    fg: PALETTE.kuning.hex,
    bg: hex("charcoal", "1000"),
    label: "Kuning on Dakwat",
    use: "Links and focus rings on dark grounds",
    kind: "text",
  },
  {
    fg: PALETTE.kuning.hex,
    bg: PALETTE.putih.hex,
    label: "Kuning on white",
    use: "Never. Kuning is for the flag and dark grounds.",
    kind: "never",
  },
];
