// Link previews: 1200 × 630, the logo, the page's title and, where the page has one, its headline figure.
import { ImageResponse } from "next/og";
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

export function ogImage({ kicker, title, figure, note }: OgContent): ImageResponse {
  return new ImageResponse(
    (
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
        {/* eslint-disable-next-line @next/next/no-img-element -- satori renders <img>, not next/image */}
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
            <div style={{ fontSize: figure ? 52 : 72, lineHeight: 1.05, marginTop: 14, letterSpacing: -1 }}>
              {title}
            </div>
            {figure && (
              <div style={{ fontSize: 88, lineHeight: 1, marginTop: 22, color: PALETTE.biru.hex, letterSpacing: -2 }}>
                {figure}
              </div>
            )}
            {figure && note && <div style={{ fontSize: 26, marginTop: 10, color: MUTED }}>{note}</div>}
          </div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 10, background: PALETTE.biru.hex }} />
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Cal Sans", data: font, weight: 600, style: "normal" }] },
  );
}
