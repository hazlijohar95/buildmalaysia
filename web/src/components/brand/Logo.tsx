// The Carta logo as inline SVG, so each stripe and the star can move (src/styles/brand.css). Every coordinate comes
// from src/brand/carta.ts; this file only arranges it.
import {
  CANTON,
  CRESCENT_PATH,
  PALETTE,
  STAR_PATH,
  STAR_STEP_DEG,
  STRIPE,
  STRIPES,
  layout,
  viewBoxAttr,
  wordColour,
  type Lockup,
  type Tone,
} from "@/brand/carta";
import { WORDMARK } from "@/brand/wordmark";
import { cn } from "@/lib/cn";

type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>;

/** The canton: blue field, crescent and star. Classed so the intro and loaders can move it. */
function Canton() {
  return (
    <g className="carta-canton">
      <rect width={CANTON.width} height={CANTON.height} fill={PALETTE.biru.hex} shapeRendering="crispEdges" />
      <path d={CRESCENT_PATH} fill={PALETTE.kuning.hex} />
      <path className="carta-star" d={STAR_PATH} fill={PALETTE.kuning.hex} />
    </g>
  );
}

/**
 * The flag at the origin. `ghost` draws no stripes, only a dashed outline of where they would stand: nothing
 * ranked.
 */
export function Flag({ ghost = false }: { ghost?: boolean }) {
  if (ghost) {
    const steps = STRIPES.map((s) => `H${s.x + s.width}V${s.y + STRIPE}`).join("");
    return (
      <>
        <path
          d={`M${CANTON.width} 0${steps}H0V${CANTON.height}`}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <Canton />
      </>
    );
  }
  return (
    <>
      {STRIPES.map((s) => {
        const style: CSSVars = { "--i": s.n, "--g": ((s.width + STRIPE) / s.width).toFixed(4) };
        return (
          <rect
            key={s.n}
            className="carta-stripe"
            style={style}
            x={s.x}
            y={s.y}
            width={s.width}
            height={STRIPE}
            fill={PALETTE[s.colour].hex}
            shapeRendering="crispEdges"
          />
        );
      })}
      <Canton />
    </>
  );
}

export interface LogoProps {
  lockup?: Lockup;
  /** CSS pixels per stripe. Whole or half pixels keep the stripes crisp: 1.5 in the header, 2 in the footer. */
  unit: number;
  tone?: Tone;
  /** Play the intro on the first page view of a session. */
  intro?: boolean;
  /** Move on hover of the surrounding link. */
  interactive?: boolean;
  /** Hidden from assistive tech when something nearby already names it, such as a loader's status text. */
  decorative?: boolean;
  ghost?: boolean;
  className?: string;
}

export function Logo({
  lockup = "stacked",
  unit,
  tone = "light",
  intro = false,
  interactive = false,
  decorative = false,
  ghost = false,
  className,
}: LogoProps) {
  const l = layout(lockup);
  const box = l.viewBox;
  const px = unit / STRIPE;
  const style: CSSVars = { "--carta-star-step": `${STAR_STEP_DEG}deg` };
  return (
    <svg
      viewBox={viewBoxAttr(box)}
      width={box.width * px}
      height={box.height * px}
      className={cn("carta block", className)}
      style={style}
      data-intro={intro || undefined}
      data-interactive={interactive || undefined}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Build Malaysia" })}
    >
      {lockup === "icon" && <rect {...box} fill={PALETTE.biru.hex} />}
      {l.word && (
        <g className="carta-word">
          <path
            transform={`translate(${l.word.x} ${l.word.y}) scale(${l.word.scale})`}
            d={WORDMARK.path}
            fill={wordColour(tone)}
          />
        </g>
      )}
      <g transform={`translate(${l.flag.x} ${l.flag.y})`}>{lockup === "icon" ? <Canton /> : <Flag ghost={ghost} />}</g>
    </svg>
  );
}
