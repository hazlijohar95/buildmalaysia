// Draws the logo builder's files. The choices and names are in make-spec.ts, which the browser shares.
import { linen } from "@/styles/colours/linen";
import { PALETTE, svgImage, type Tone } from "./carta";
import type { BrandFile } from "./files";
import { GROUNDS, LOCKUPS, aspectKey, makeCaption, makeName, type Ground, type MakeSpec } from "./make-spec";

export const GROUND_STYLE: Record<Ground, { hex: string | null; tone: Tone }> = {
  clear: { hex: null, tone: "light" },
  white: { hex: PALETTE.putih.hex, tone: "light" },
  kertas: { hex: linen["50"], tone: "light" },
  linen: { hex: linen["100"], tone: "light" },
  biru: { hex: PALETTE.biru.hex, tone: "dark" },
};

/** The spec's image: on its ground with clear space, or cropped and transparent for "clear". */
export function makeImage(spec: MakeSpec): ReturnType<typeof svgImage> {
  const { hex, tone } = GROUND_STYLE[spec.ground];
  return svgImage(spec.lockup, {
    tone,
    ground: hex ?? undefined,
    width: spec.format === "png" ? spec.width : undefined,
  });
}

/** The spec as a brand file, for the download route to serve like any other. */
export function makeFile(spec: MakeSpec): BrandFile {
  const image = makeImage(spec);
  const name = makeName(spec);
  return spec.format === "svg"
    ? { name, format: "svg", svg: image.svg }
    : { name, format: "png", svg: image.svg, width: image.width, height: image.height };
}

/** Height over width for every lockup on every ground, so the browser can size a caption without drawing. */
export function makeAspects(): Record<string, number> {
  return Object.fromEntries(
    LOCKUPS.flatMap((l) =>
      GROUNDS.map((g) => {
        const { width, height } = makeImage({ lockup: l.id, ground: g.id, format: "svg" });
        return [aspectKey({ lockup: l.id, ground: g.id }), height / width];
      }),
    ),
  );
}

export const serverCaption = (spec: MakeSpec) => makeCaption(spec, makeAspects()[aspectKey(spec)]);
