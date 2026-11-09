// The stacked logo as a vector PDF in the flag's official process colours, for print. An SVG carries only screen
// colours, so a printer converting it would guess the CMYK; this file states the Jadual 1 values outright.
import {
  CANTON,
  CRESCENT_HORNS,
  PALETTE,
  SHEET,
  STAR_VERTICES,
  STRIPE,
  STRIPES,
  layout,
  type FlagColour,
} from "./carta";
import { WORDMARK } from "./wordmark";

const n = (v: number) => String(+v.toFixed(3));

/** Fill colour operator: PALETTE's "C M Y K" percentages as PDF's 0–1 components. */
const fill = (colour: FlagColour) =>
  PALETTE[colour].cmyk
    .split(" ")
    .map((c) => n(Number(c) / 100))
    .join(" ") + " k";

/** The wordmark's SVG path (absolute M, H, V, Q and Z only) as PDF path operators; quadratics become cubics. */
function wordmarkOps(): string {
  const tokens = WORDMARK.path.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const ops: string[] = [];
  let [x, y] = [0, 0];
  let i = 0;
  const next = () => Number(tokens[i++]);
  let command = "";
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) command = tokens[i++];
    switch (command) {
      case "M":
        [x, y] = [next(), next()];
        ops.push(`${n(x)} ${n(y)} m`);
        break;
      case "H":
        x = next();
        ops.push(`${n(x)} ${n(y)} l`);
        break;
      case "V":
        y = next();
        ops.push(`${n(x)} ${n(y)} l`);
        break;
      case "Q": {
        const [qx, qy, ex, ey] = [next(), next(), next(), next()];
        const c1 = [x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y)];
        const c2 = [ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey)];
        ops.push(`${c1.map(n).join(" ")} ${c2.map(n).join(" ")} ${n(ex)} ${n(ey)} c`);
        [x, y] = [ex, ey];
        break;
      }
      case "Z":
        ops.push("h");
        if (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) throw new Error("A number follows Z in the wordmark");
        break;
      default:
        throw new Error(`The wordmark uses ${command}; only absolute M, H, V, Q and Z are converted`);
    }
  }
  return ops.join("\n");
}

/**
 * A circular arc from angle `from` to `to` (radians, y down, either direction) as cubic Béziers of at most 90°
 * each, continuing the current path.
 */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const count = Math.ceil(Math.abs(to - from) / (Math.PI / 2));
  const step = (to - from) / count;
  const k = (4 / 3) * Math.tan(step / 4) * r;
  const ops: string[] = [];
  for (let i = 0; i < count; i++) {
    const [a, b] = [from + i * step, from + (i + 1) * step];
    const [x0, y0, x3, y3] = [cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b)];
    const [x1, y1] = [x0 - k * Math.sin(a), y0 + k * Math.cos(a)];
    const [x2, y2] = [x3 + k * Math.sin(b), y3 - k * Math.cos(b)];
    ops.push(`${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x3)} ${n(y3)} c`);
  }
  return ops.join("\n");
}

/** The outer circle's arc round the hoist side from horn to horn, then the inner circle's arc back. */
function crescentOps(): string {
  const { cy, outer, inner } = SHEET.crescent;
  const { x, top, bottom } = CRESCENT_HORNS;
  const [ox, ix, y] = [outer.cx * STRIPE, inner.cx * STRIPE, cy * STRIPE];
  const angle = (cx: number, py: number) => Math.atan2(py - y, x - cx);
  const outerTop = angle(ox, top);
  const innerBottom = angle(ix, bottom);
  return [
    `${n(x)} ${n(top)} m`,
    arc(ox, y, outer.r * STRIPE, outerTop, angle(ox, bottom) - 2 * Math.PI),
    arc(ix, y, inner.r * STRIPE, innerBottom, angle(ix, top) + 2 * Math.PI),
    "h f",
  ].join("\n");
}

function flagOps(): string {
  const ops = STRIPES.map((s) => `${fill(s.colour)}\n${s.x} ${s.y} ${s.width} ${STRIPE} re f`);
  ops.push(`${fill("biru")}\n0 0 ${CANTON.width} ${CANTON.height} re f`);
  ops.push(`${fill("kuning")}\n${crescentOps()}`);
  const [first, ...rest] = STAR_VERTICES;
  ops.push(`${n(first.x)} ${n(first.y)} m\n${rest.map((p) => `${n(p.x)} ${n(p.y)} l`).join("\n")}\nh f`);
  return ops.join("\n");
}

/** One page, the size of the stacked logo at 1pt a drawing unit (99mm wide), y flipped to match the SVG. */
export function logoPdf(): string {
  const l = layout("stacked");
  const { width, height } = l.viewBox;
  if (!l.word) throw new Error("The stacked lockup has a wordmark");
  const { x, y, scale } = l.word;
  const content = [
    `1 0 0 -1 0 ${n(height)} cm`,
    `q\n${scale.toFixed(8)} 0 0 ${scale.toFixed(8)} ${n(x)} ${n(y)} cm\n${fill("biru")}\n${wordmarkOps()}\nf\nQ`,
    `q\n1 0 0 1 ${l.flag.x} ${l.flag.y} cm\n${flagOps()}\nQ`,
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /TrimBox [0 0 ${n(width)} ${n(height)}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Title (Build Malaysia) /Author (Build Malaysia) /Producer (buildmalaysia.com/brand) >>",
  ];

  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
