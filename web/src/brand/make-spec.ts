// The logo builder's choices and the file names that spell them. The name is the whole request, so each file has
// one URL and the cache holds a bounded set of them. Free of drawing code, so the browser can import it.
import type { Lockup } from "./carta";

export const LOCKUPS: readonly { id: Lockup; label: string }[] = [
  { id: "stacked", label: "Stacked" },
  { id: "inline", label: "Inline" },
  { id: "flag", label: "Flag" },
  { id: "icon", label: "Icon" },
];

export const GROUNDS = [
  { id: "clear", label: "None" },
  { id: "white", label: "White" },
  { id: "kertas", label: "Kertas" },
  { id: "linen", label: "Linen" },
  { id: "biru", label: "Biru" },
] as const;
export type Ground = (typeof GROUNDS)[number]["id"];

/** PNG widths on offer. 2048 is the most a Worker renders comfortably; larger needs belong to the SVG. */
export const WIDTHS = [512, 1024, 2048] as const;
export type Width = (typeof WIDTHS)[number];

export type MakeSpec =
  | { lockup: Lockup; ground: Ground; format: "svg" }
  | { lockup: Lockup; ground: Ground; format: "png"; width: Width };

export const DEFAULT_SPEC: MakeSpec = { lockup: "stacked", ground: "clear", format: "png", width: 1024 };

/** "build-malaysia-stacked-biru-1024.png", "build-malaysia-icon-clear.svg". */
export function makeName(spec: MakeSpec): string {
  const base = `build-malaysia-${spec.lockup}-${spec.ground}`;
  return spec.format === "png" ? `${base}-${spec.width}.png` : `${base}.svg`;
}

export const makeUrl = (spec: MakeSpec) => `/brand/make/${makeName(spec)}`;

/** The key a spec's height-to-width ratio is filed under: it depends on the lockup and the ground alone. */
export const aspectKey = (spec: Pick<MakeSpec, "lockup" | "ground">) => `${spec.lockup}-${spec.ground}`;

/** "build-malaysia-stacked-clear-1024.png · 1024 × 914 px", or the name alone for an SVG. */
export function makeCaption(spec: MakeSpec, aspect: number): string {
  const size = spec.format === "png" ? ` · ${spec.width} × ${Math.round(spec.width * aspect)} px` : "";
  return `${makeName(spec)}${size}`;
}

/** The spec these raw choices name, or null if any of them is not on offer. */
function toSpec(l: unknown, g: unknown, format: unknown, w: unknown): MakeSpec | null {
  const lockup = LOCKUPS.find((x) => x.id === l)?.id;
  const ground = GROUNDS.find((x) => x.id === g)?.id;
  if (!lockup || !ground) return null;
  if (format === "svg") return { lockup, ground, format };
  const width = WIDTHS.find((x) => String(x) === w);
  return format === "png" && width ? { lockup, ground, format, width } : null;
}

const NAME = /^build-malaysia-([a-z]+)-([a-z]+)(?:-(\d+))?\.(png|svg)$/;

/** The spec a file name spells, or null for any name makeName would not produce. */
export function parseMakeName(name: string): MakeSpec | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [, l, g, w, format] = m;
  if (format === "svg" && w !== undefined) return null;
  return toSpec(l, g, format, w);
}

/** The builder form's fields, as sent without JavaScript. */
export const parseMakeQuery = (q: URLSearchParams): MakeSpec | null =>
  toSpec(q.get("lockup"), q.get("ground"), q.get("format"), q.get("width"));
