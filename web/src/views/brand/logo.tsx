// The sheet's sections about the mark itself: its construction, lockups, misuse and motion. Every drawing renders
// from src/brand/carta.ts, so the sheet cannot disagree with the logo.
import { kicker } from "@/components/Boxed";
import { Canton, Flag, Logo } from "@/components/brand/Logo";
import { Loader } from "@/components/brand/Loader";
import { FLAG, PALETTE, SHEET, STRIPE, STRIPES, type Lockup } from "@/brand/carta";
import { LuPlay } from "react-icons/lu";
import { cn } from "@/lib/cn";
import { DontMark, Section, cap, grid, iconStroke } from "./section";

const SHEET_URL = "https://www.asean.org/wp-content/uploads/2012/05/NATIONAL-FLAG-OF-MALAYSIA.pdf";

const FACTS = [
  { label: "Proportion", value: "1 : 2", note: "28 × 14 units. One unit is one stripe." },
  {
    label: "Stripes",
    value: "14, red first",
    note: "Seven red, seven white, equal height; the bottom stripe is white.",
  },
  { label: "Canton", value: "14 × 8", note: "Half the width, over the top eight stripes." },
  {
    label: "Crescent",
    value: "Ø6 less Ø5½",
    note: "Outer circle centred 5¾ in; the inner circle 1 unit nearer the fly.",
  },
  { label: "Star", value: "14 points, Ø5", note: "Centred 8¾ in, inner vertices on Ø2, first point straight up." },
  { label: "The Carta cut", value: "−1 unit a stripe", note: "Stripe n ends at 28 − n, so the fly edge runs at 45°." },
];

/** The construction drawing: the unit grid, the flag, the sheet's circles and the 45° cut, from carta.ts. */
function Construction() {
  const S = STRIPE;
  const { crescent, star } = SHEET;
  const gridLines = [
    ...Array.from({ length: 29 }, (_, i) => `M${i * S} 0V${FLAG.height}`),
    ...Array.from({ length: 15 }, (_, i) => `M0 ${i * S}H${FLAG.width}`),
  ].join("");
  const ticks = [0, 2.75, 5.75, 8.75, 11.25, 14];
  const spans = ["2¾", "3", "3", "2½", "2¾"];
  return (
    <svg viewBox="-44 -40 372 228" className="block w-full min-w-[620px]" role="img" aria-label="Construction drawing">
      <path d={gridLines} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />
      <Flag />
      <path d={`M${FLAG.width + 16} -16L${FLAG.width - 156} 156`} stroke="#2b5fd9" strokeDasharray="4 3" />
      <text x={236} y={-22} fontSize={7.5} fill="#2b5fd9" className="font-mono">
        fly edge: x + y = 28
      </text>
      <g fill="none" stroke="#fff" strokeWidth={0.7} strokeDasharray="2.5 2">
        <circle cx={crescent.outer.cx * S} cy={crescent.cy * S} r={crescent.outer.r * S} />
        <circle cx={crescent.inner.cx * S} cy={crescent.cy * S} r={crescent.inner.r * S} />
        <circle cx={star.cx * S} cy={star.cy * S} r={star.outer * S} />
        <circle cx={star.cx * S} cy={star.cy * S} r={star.inner * S} />
      </g>
      <g stroke="currentColor" strokeWidth={0.6}>
        <path d={`M0 -10H${14 * S}` + ticks.map((t) => `M${t * S} -14V-6`).join("")} />
        <path d={`M0 162H${FLAG.width}M0 158V166M${14 * S} 158V166M${FLAG.width} 158V166`} />
        <path d={`M-14 0V${FLAG.height}M-18 0H-10M-18 80H-10M-18 ${FLAG.height}H-10`} />
      </g>
      <g fontSize={7.5} fill="currentColor" textAnchor="middle" className="font-mono">
        {spans.map((label, i) => (
          <text key={i} x={((ticks[i] + ticks[i + 1]) / 2) * S} y={-17}>
            {label}
          </text>
        ))}
        <text x={70} y={176}>
          14 · canton
        </text>
        <text x={210} y={176}>
          14 · fly
        </text>
        <text x={-30} y={43}>
          8
        </text>
        <text x={-30} y={113}>
          6
        </text>
      </g>
    </svg>
  );
}

export function ConstructionSection() {
  return (
    <Section
      id="construction"
      title="Drawn on the official sheet"
      intro="Every flag dimension comes from the government construction sheet. The only departure is the fly edge."
    >
      <div className="mt-8 overflow-x-auto border-2 border-foreground bg-linen-50 p-5">
        <Construction />
      </div>
      <div className={cn(grid, "mt-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
        {FACTS.map((f) => (
          <div key={f.label} className="min-w-0 bg-linen-50 p-4">
            <div className={cn(kicker, "text-charcoal-600")}>{f.label}</div>
            <div className="mt-1 font-display text-2xl font-semibold">{f.value}</div>
            <div className="mt-1 text-sm text-charcoal-700">{f.note}</div>
          </div>
        ))}
      </div>
      <p className={cn(cap, "mt-4")}>
        Source: the construction sheet in <a href={SHEET_URL}>ASEAN&apos;s copy of the national flag specification</a>.
        It dimensions the outer crescent and the star; the inner crescent circle is dimensioned only at its hoist edge,
        and its Ø5½ follows <a href="https://www.crwflags.com/fotw/flags/my'.html">Flags of the World&apos;s reading</a>{" "}
        of the same sheet, which lands its horns where the sheet draws them.
      </p>
    </Section>
  );
}

const LOCKUPS: { name: string; note: string; lockup: Lockup; unit: number }[] = [
  { name: "Stacked", note: "The primary lockup: “Build” exactly as wide as the flag.", lockup: "stacked", unit: 4 },
  { name: "Inline", note: "For one-line spaces: email signatures, slide footers.", lockup: "inline", unit: 2.5 },
  { name: "Flag", note: "Where “Build Malaysia” is written nearby.", lockup: "flag", unit: 4 },
  { name: "Icon", note: "Favicon and avatar: the canton, squared on its own blue.", lockup: "icon", unit: 7 },
];

/** Pixels a stripe, for the clear-space overlay to size itself in stripes. */
const unitStyle = (unit: number): React.CSSProperties & Record<`--${string}`, string> => ({ "--u": `${unit}px` });

export function LockupsSection() {
  return (
    <Section id="lockups" title="Four arrangements, one drawing">
      <button
        type="button"
        data-clearspace-toggle
        aria-pressed="false"
        aria-controls="lockup-grid"
        hidden
        className={cn(
          kicker,
          "tap mt-6 inline-flex min-h-11 items-center gap-2.5 border-2 border-foreground pr-4 pl-3.5",
        )}
      >
        <span aria-hidden="true" className="clearspace-key size-3.5" />
        Clear space
      </button>
      <div id="lockup-grid" className={cn(grid, "mt-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4")}>
        {LOCKUPS.map(({ name, note, lockup, unit }) => (
          <figure key={name} className="m-0 grid min-w-0 grid-rows-[200px_auto] bg-white">
            <div className="grid place-items-center">
              <span className="relative block" style={unitStyle(unit)}>
                <Logo lockup={lockup} unit={unit} />
                <span aria-hidden="true" className="clearspace" />
              </span>
            </div>
            <figcaption className="border-t-2 border-foreground bg-linen-50 p-4">
              <div className="font-display text-lg font-semibold">{name}</div>
              <div className="text-sm text-charcoal-700">{note}</div>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className={cn(cap, "mt-4")}>
        Clear space is four stripes on every side: the tint, when it is shown. The smallest stacked logo is 1.5px a
        stripe, as in the header; below that, use the icon. Sizes at whole or half pixels a stripe keep every stripe
        edge sharp.
      </p>
    </Section>
  );
}

/** Stripe ends, in units, for a flag cut any way but the 45° edge: a chart of made-up data. */
const MISCUT_ENDS = [26, 21, 28, 19, 24, 17, 27, 22, 12, 25, 9, 20, 15, 23];

/** The flag with its stripes cut to MISCUT_ENDS instead of the 45° edge. */
function MiscutFlag() {
  return (
    <svg viewBox={`0 0 ${FLAG.width} ${FLAG.height}`} width={140} height={70} className="block" aria-hidden="true">
      {STRIPES.map((s) => (
        <rect
          key={s.n}
          x={s.x}
          y={s.y}
          width={MISCUT_ENDS[s.n] * STRIPE - s.x}
          height={STRIPE}
          fill={PALETTE[s.colour].hex}
          shapeRendering="crispEdges"
        />
      ))}
      <Canton />
    </svg>
  );
}

const flag = <Logo lockup="flag" unit={5} decorative />;

const MISUSE: { rule: string; why: string; drawing: React.ReactNode; ground?: string }[] = [
  {
    rule: "Mirror it.",
    why: "The canton stays at the hoist and the crescent opens toward the fly.",
    drawing: <div className="-scale-x-100">{flag}</div>,
  },
  {
    rule: "Cut the stripes any other way.",
    why: "The 45° edge is the only cut; other lengths read as a chart of made-up data.",
    drawing: <MiscutFlag />,
  },
  {
    rule: "Recolour it.",
    why: "There is no one-colour flag. Where only one colour prints, write “Build Malaysia” alone.",
    drawing: <div className="grayscale">{flag}</div>,
  },
  {
    rule: "Set it on red.",
    why: "The red stripes vanish. Use white, Kertas or Biru.",
    drawing: flag,
    ground: "bg-merah-600",
  },
  {
    rule: "Stretch it.",
    why: "Carta is 1 : 2 at every size. Scale it by its corner, never by one side.",
    drawing: <div className="scale-x-150 scale-y-75">{flag}</div>,
  },
  {
    rule: "Tilt or wave it.",
    why: "Carta is a chart, and charts sit level.",
    drawing: <div className="-rotate-12">{flag}</div>,
  },
];

export function MisuseSection() {
  return (
    <Section
      id="misuse"
      title="Six ways to break it"
      intro="Each of these turns the chart back into a picture of a flag, or into a flag that isn't Malaysia's."
    >
      <ul className={cn(grid, "m-0 mt-8 list-none grid-cols-1 p-0 sm:grid-cols-2 lg:grid-cols-3")}>
        {MISUSE.map((m) => (
          <li key={m.rule} className="m-0 grid min-w-0 grid-rows-[180px_auto] bg-white">
            <div className={cn("relative grid place-items-center overflow-hidden", m.ground)}>
              <DontMark className="absolute left-3 top-3" decorative />
              {m.drawing}
            </div>
            <div className="border-t-2 border-foreground bg-linen-50 p-4">
              <div className="font-display text-lg font-semibold">
                Don&apos;t {m.rule.charAt(0).toLowerCase() + m.rule.slice(1)}
              </div>
              <div className="text-sm text-charcoal-700">{m.why}</div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Plays a motion tile on any device. Shown once the page's script runs. */
function MotionButton({ action, children }: { action: "step" | "replay"; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-motion={action}
      hidden
      className={cn(
        kicker,
        "tap -my-1 inline-flex min-h-11 items-center gap-2 border border-foreground/25 bg-white pr-3 pl-2.5 hover:border-foreground",
      )}
    >
      <LuPlay aria-hidden="true" className="size-3.5" strokeWidth={iconStroke(14)} />
      {children}
    </button>
  );
}

export function MotionSection() {
  return (
    <Section
      id="motion"
      title="It moves like a chart"
      intro="Stripes only grow or shrink from the hoist, the way bars do. The star only turns in whole points: a fourteen-point star turned one point looks exactly as it started, so the flag is never left off-spec. With reduced motion on, nothing moves."
    >
      <div className={cn(grid, "mt-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4")}>
        <figure data-motion-tile className="m-0 grid min-w-0 grid-rows-[220px_auto] bg-white">
          <div data-hover-demo className="grid place-items-center">
            <Logo unit={5} interactive decorative />
          </div>
          <figcaption className="border-t-2 border-foreground bg-linen-50 p-4">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div className="font-display text-lg font-semibold">Hover</div>
              <MotionButton action="step">Play</MotionButton>
            </div>
            <div className="text-sm text-charcoal-700">
              The 45° edge steps out one stripe and the star turns one point. On a touch screen, press Play.
            </div>
          </figcaption>
        </figure>
        <figure data-motion-tile className="m-0 grid min-w-0 grid-rows-[220px_auto] bg-white">
          <div className="grid place-items-center">
            <Logo unit={5} decorative />
          </div>
          <figcaption className="border-t-2 border-foreground bg-linen-50 p-4">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div className="font-display text-lg font-semibold">Intro</div>
              <MotionButton action="replay">Replay</MotionButton>
            </div>
            <div className="text-sm text-charcoal-700">
              The canton, then the star turning in, then the stripes ranking in from the hoist. The header plays it
              once, on the first page of a visit.
            </div>
          </figcaption>
        </figure>
        <figure className="m-0 grid min-w-0 grid-rows-[220px_auto] bg-white">
          <div className="grid place-items-center">
            <Loader size="md" label="Loading 2025 spending" />
          </div>
          <figcaption className="border-t-2 border-foreground bg-linen-50 p-4">
            <div className="font-display text-lg font-semibold">Loading</div>
            <div className="text-sm text-charcoal-700">
              The edge ripples down the stripes while the star turns one point a beat. Page loads wait 300ms before it
              shows, so a fast page shows nothing.
            </div>
          </figcaption>
        </figure>
        <figure className="m-0 grid min-w-0 grid-rows-[220px_auto] bg-white">
          <div className="grid place-items-center">
            <span className="inline-flex min-h-11 items-center gap-3 bg-biru px-4 font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-white">
              <Loader size="sm" />
              Calculating
            </span>
          </div>
          <figcaption className="border-t-2 border-foreground bg-linen-50 p-4">
            <div className="font-display text-lg font-semibold">Small</div>
            <div className="text-sm text-charcoal-700">
              Under 24px the stripes blur, so the small loader is the icon, its star spinning. Beside visible text it
              carries no label of its own, so screen readers hear the button once.
            </div>
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
