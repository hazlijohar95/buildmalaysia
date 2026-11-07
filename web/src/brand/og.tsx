// Link previews: 1200 × 630, the logo, the page's title and, where the page has one, its headline figure.
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import type { ReactNode } from "react";
import satori, { init as initSatori } from "satori/standalone";
import yogaWasm from "satori/yoga.wasm";
import { colours } from "@/styles/colours";
import { PALETTE, svgDataUri, svgImage } from "./carta";
import { OG_FONT_BASE64 } from "./og-font";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const font = Uint8Array.from(atob(OG_FONT_BASE64), (c) => c.charCodeAt(0)).buffer;
const LOGO = svgImage("stacked", { width: 364 });
const INK = colours.charcoal["1000"];
const MUTED = colours.charcoal["600"];

export interface OgContent {
  kicker: string;
  title: string;
  /** The page's headline number, e.g. "RM 412.70 bn". */
  figure?: string;
  /** What the figure is, in a few words. */
  note?: string;
}

// Workers can't compile WebAssembly at run time, so both engines start from modules compiled at build time.
// A failed start is not remembered, so the next image retries it.
let engines: Promise<void> | undefined;
const startEngines = () =>
  (engines ??= Promise.all([initSatori(yogaWasm), initWasm(resvgWasm)]).then(
    () => undefined,
    (error: unknown) => {
      engines = undefined;
      throw error;
    },
  ));

type Fonts = Parameters<typeof satori>[1]["fonts"];

/** Rasterises an SVG with resvg, freeing its buffers at once: WebAssembly memory never shrinks, so waiting for GC
 * would hold the peak. */
function rasterise(svg: string, width?: number): Response {
  const resvg = new Resvg(svg, width ? { fitTo: { mode: "width", value: width } } : undefined);
  const image = resvg.render();
  const png = image.asPng();
  image.free();
  resvg.free();
  return new Response(png, { headers: { "content-type": OG_CONTENT_TYPE } });
}

/** Renders satori-flavoured JSX (inline styles, flexbox only) to a PNG response. */
export async function pngResponse(node: ReactNode, size: { width: number; height: number }, fonts: Fonts = []) {
  await startEngines();
  return rasterise(await satori(node, { ...size, fonts }));
}

export function ogImage({ kicker, title, figure, note }: OgContent): Promise<Response> {
  return pngResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#ffffff",
        fontFamily: "Cal Sans",
        color: INK,
        position: "relative",
      }}
    >
      <img
        src={svgDataUri(LOGO.svg)}
        width={LOGO.width}
        height={LOGO.height}
        alt=""
        style={{ position: "absolute", right: 72, top: 72 }}
      />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 72 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
          <div style={{ fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: MUTED }}>{kicker}</div>
          <div style={{ fontSize: figure ? 52 : 72, lineHeight: 1.05, marginTop: 14, letterSpacing: -1 }}>{title}</div>
          {figure && (
            <div style={{ fontSize: 88, lineHeight: 1, marginTop: 22, color: PALETTE.biru.hex, letterSpacing: -2 }}>
              {figure}
            </div>
          )}
          {figure && note && <div style={{ fontSize: 26, marginTop: 10, color: MUTED }}>{note}</div>}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, background: PALETTE.biru.hex }} />
    </div>,
    OG_SIZE,
    [{ name: "Cal Sans", data: font, weight: 600, style: "normal" }],
  );
}

/**
 * A PNG of a brand SVG at `width`. The SVG needs no layout, so it skips satori and goes to resvg alone, which
 * roughly halves the memory a 2048 px render takes.
 */
export async function svgPng(svg: string, width: number): Promise<Response> {
  await startEngines();
  return rasterise(svg, width);
}
