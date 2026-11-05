// The public brand sheet: how the logo is drawn, its colours, lockups, motion and files. Every drawing on the page
// renders from src/brand/carta.ts, so the sheet cannot disagree with the logo.
import type { Metadata } from "next";
import { Band, H2, PageHeader, kicker } from "@/components/Boxed";
import { Flag, Logo } from "@/components/brand/Logo";
import { Loader } from "@/components/brand/Loader";
import { FLAG, PALETTE, SHEET, STRIPE, type FlagColour } from "@/brand/carta";
import { BRAND_FILES, brandFileUrl } from "@/brand/files";
import { cn } from "@/lib/cn";
import { colours } from "@/styles/colours";

export const metadata: Metadata = {
  title: "Brand",
  description: "The Build Malaysia logo: the Jalur Gemilang drawn to the official sheet, its stripes cut as a chart.",
};

const SHEET_URL = "https://www.asean.org/wp-content/uploads/2012/05/NATIONAL-FLAG-OF-MALAYSIA.pdf";
const COLOUR_URL =
  "https://dbook.penerangan.gov.my/dbook/dmdocuments/bendera_kita_jalur_gemilang_2017/files/basic-html/page12.html";
const HEX_URL = "https://commons.wikimedia.org/wiki/File:Flag_of_Malaysia.svg";

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

const SECONDARY = [
  { name: "Dakwat", hex: colours.charcoal["1000"], token: "charcoal-1000", role: "Rules and text" },
  { name: "Kertas", hex: colours.linen["50"], token: "linen-50", role: "Panels and menus" },
  { name: "Linen", hex: colours.linen["100"], token: "linen-100", role: "Page ground" },
  { name: "Abu", hex: colours.charcoal["600"], token: "charcoal-600", role: "Captions and notes" },
];

const MISUSE = [
  ["Mirror it.", "The canton stays at the hoist and the crescent opens toward the fly."],
  ["Cut the stripes any other way.", "The 45° edge is the only cut; other lengths read as a chart of made-up data."],
  ["Recolour it.", "There is no one-colour flag. Where only one colour prints, write “Build Malaysia” alone."],
  ["Set it on red.", "The red stripes vanish. Use white, Kertas or Biru."],
  ["Stretch, tilt or wave it.", "Carta is a chart, and charts sit level at 1 : 2."],
];

/** The construction drawing: the unit grid, the flag, the sheet's circles and the 45° cut, from carta.ts. */
function Construction() {
  const S = STRIPE;
  const { crescent, star } = SHEET;
  const grid = [
    ...Array.from({ length: 29 }, (_, i) => `M${i * S} 0V${FLAG.height}`),
    ...Array.from({ length: 15 }, (_, i) => `M0 ${i * S}H${FLAG.width}`),
  ].join("");
  const ticks = [0, 2.75, 5.75, 8.75, 11.25, 14];
  const spans = ["2¾", "3", "3", "2½", "2¾"];
  return (
    <svg viewBox="-44 -40 372 228" className="block w-full min-w-[620px]" role="img" aria-label="Construction drawing">
      <path d={grid} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />
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

function Swatch({ colour }: { colour: FlagColour }) {
  const c = PALETTE[colour];
  return (
    <div className="min-w-0 bg-linen-50">
      <div className="h-28 border-b-2 border-foreground" style={{ background: c.hex }} />
      <div className="p-4">
        <div className="font-display text-xl font-semibold">{c.name}</div>
        <div className="text-sm text-charcoal-700">{c.role}</div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[12px]">
          <dt className="text-charcoal-600">Pantone</dt>
          <dd className="m-0">{c.pantone ?? "none (paper)"}</dd>
          <dt className="text-charcoal-600">CMYK</dt>
          <dd className="m-0">{c.cmyk}</dd>
          <dt className="text-charcoal-600">Screen</dt>
          <dd className="m-0 uppercase">{c.hex}</dd>
        </dl>
      </div>
    </div>
  );
}

const grid = "grid gap-[2px] border-2 border-foreground bg-foreground";
const cap = "text-sm text-charcoal-700 max-w-3xl";

export default function BrandPage() {
  return (
    <>
      <PageHeader
        eyebrow="Brand"
        title="Carta"
        intro={
          <p>
            The Jalur Gemilang, drawn to the government&apos;s construction sheet, with one change: its fourteen stripes
            are a bar chart. Each stripe is one unit shorter than the one above, so the fly edge runs at exactly 45°.
            Read fast, it is the flag. Read again, it is what this site does: public money, ranked.
          </p>
        }
      />

      <section className="grid grid-cols-1 gap-[2px] border-b-2 border-foreground bg-foreground md:grid-cols-[1.25fr_1fr]">
        <div className="grid place-items-center bg-white px-6 py-16">
          <Logo unit={9} />
        </div>
        <div className="grid place-items-center bg-biru px-6 py-16">
          <Logo unit={7} tone="dark" />
        </div>
      </section>

      <Band>
        <div className={cn(kicker, "text-charcoal-700")}>Construction</div>
        <H2 className="mt-3">Drawn on the official sheet</H2>
        <p className={cn(cap, "mt-3")}>
          Every flag dimension comes from the government construction sheet. The only departure is the fly edge.
        </p>
        <div className="mt-8 overflow-x-auto border-2 border-foreground bg-linen-50 p-5">
          <Construction />
        </div>
        <div className={cn(grid, "mt-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
          {FACTS.map((f) => (
            <div key={f.label} className="min-w-0 bg-linen-50 p-4">
              <div className={cn(kicker, "text-[11px] text-charcoal-600")}>{f.label}</div>
              <div className="mt-1 font-display text-2xl font-semibold">{f.value}</div>
              <div className="mt-1 text-sm text-charcoal-700">{f.note}</div>
            </div>
          ))}
        </div>
        <p className={cn(cap, "mt-4")}>
          Source: the construction sheet in <a href={SHEET_URL}>ASEAN&apos;s copy of the national flag specification</a>
          . It dimensions the outer crescent and the star; the inner crescent circle is dimensioned only at its hoist
          edge, and its Ø5½ follows{" "}
          <a href="https://www.crwflags.com/fotw/flags/my'.html">Flags of the World&apos;s reading</a> of the same
          sheet, which lands its horns where the sheet draws them.
        </p>
      </Band>

      <Band>
        <div className={cn(kicker, "text-charcoal-700")}>Colour</div>
        <H2 className="mt-3">The flag&apos;s four, and the site&apos;s paper and ink</H2>
        <div className={cn(grid, "mt-8 grid-cols-2 lg:grid-cols-4")}>
          {(Object.keys(PALETTE) as FlagColour[]).map((c) => (
            <Swatch key={c} colour={c} />
          ))}
        </div>
        <p className={cn(cap, "mt-4")}>
          Pantone and CMYK: Jabatan Penerangan,{" "}
          <a href={COLOUR_URL}>
            <i>Bendera Kita: Jalur Gemilang</i> (2017), Jadual 1
          </a>
          . The government publishes no screen values; the hex codes are those of{" "}
          <a href={HEX_URL}>Wikimedia&apos;s reference drawing</a>. In code they are the Tailwind colours{" "}
          <code>biru</code>, <code>merah</code> and <code>kuning</code>, with full 50–950 scales for the first two.
          Across the site Biru carries the brand and interaction (links, focus, navigation) and Merah carries action and
          data (buttons, spending, overspend).
        </p>
        <div className={cn(grid, "mt-8 grid-cols-2 lg:grid-cols-4")}>
          {SECONDARY.map((c) => (
            <div key={c.name} className="min-w-0 bg-linen-50">
              <div className="h-14 border-b-2 border-foreground" style={{ background: c.hex }} />
              <div className="p-4">
                <div className="font-display text-lg font-semibold">{c.name}</div>
                <div className="text-sm text-charcoal-700">{c.role}</div>
                <div className="mt-2 font-mono text-[12px] uppercase">
                  {c.hex} · <span className="normal-case">{c.token}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Band>

      <Band id="lockups">
        <div className={cn(kicker, "text-charcoal-700")}>Lockups</div>
        <H2 className="mt-3">Four arrangements, one drawing</H2>
        <div className={cn(grid, "mt-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4")}>
          {(
            [
              ["Stacked", "The primary lockup: “Build” exactly as wide as the flag.", <Logo key="s" unit={4} />],
              [
                "Inline",
                "For one-line spaces: email signatures, slide footers.",
                <Logo key="i" lockup="inline" unit={2.5} />,
              ],
              ["Flag", "Where “Build Malaysia” is written nearby.", <Logo key="f" lockup="flag" unit={4} />],
              [
                "Icon",
                "Favicon and avatar: the canton, squared on its own blue.",
                <Logo key="c" lockup="icon" unit={7} />,
              ],
            ] as const
          ).map(([name, note, logo]) => (
            <figure key={name} className="m-0 grid min-w-0 grid-rows-[200px_auto] bg-white">
              <div className="grid place-items-center">{logo}</div>
              <figcaption className="border-t-2 border-foreground bg-linen-50 p-4">
                <div className="font-display text-lg font-semibold">{name}</div>
                <div className="text-sm text-charcoal-700">{note}</div>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className={cn(cap, "mt-4")}>
          Clear space is four stripes on every side. The smallest stacked logo is 1.5px a stripe, as in the header;
          below that, use the icon. Sizes at whole or half pixels a stripe keep every stripe edge sharp.
        </p>
      </Band>

      <Band>
        <div className={cn(kicker, "text-charcoal-700")}>Motion</div>
        <H2 className="mt-3">It moves like a chart</H2>
        <p className={cn(cap, "mt-3")}>
          Stripes only grow or shrink from the hoist, the way bars do. The star only turns in whole points: a
          fourteen-point star turned one point looks exactly as it started, so the flag is never left off-spec. With
          reduced motion on, nothing moves.
        </p>
        <div className={cn(grid, "mt-8 grid-cols-1 lg:grid-cols-3")}>
          <figure className="m-0 grid min-w-0 grid-rows-[220px_auto] bg-white">
            <a href="#lockups" className="grid place-items-center no-underline" aria-label="Hover to see the logo move">
              <Logo unit={5} interactive decorative />
            </a>
            <figcaption className="border-t-2 border-foreground bg-linen-50 p-4">
              <div className="font-display text-lg font-semibold">Hover</div>
              <div className="text-sm text-charcoal-700">
                The 45° edge steps out one stripe and the star turns one point. Mouse and trackpad only.
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
        <p className={cn(cap, "mt-4")}>
          The header logo plays its intro once, on the first page of a visit: the canton, then the star turning in, then
          the stripes ranking in from the hoist.
        </p>
      </Band>

      <Band id="files">
        <div className={cn(kicker, "text-charcoal-700")}>Files</div>
        <H2 className="mt-3">Download the logo</H2>
        <p className={cn(cap, "mt-3")}>
          “Build” is drawn as outlines in every file, so it looks the same without the font installed.
        </p>
        <ul className={cn(grid, "m-0 mt-8 list-none grid-cols-1 p-0 sm:grid-cols-2 lg:grid-cols-5")}>
          {BRAND_FILES.map((f) => (
            <li key={f.name} className="grid min-w-0 grid-rows-[130px_auto] bg-linen-50">
              <div className={cn("grid place-items-center p-4", f.ground === "biru" ? "bg-biru" : "bg-white")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG and PNG, already sized */}
                <img src={brandFileUrl(f.name)} alt="" className="max-h-[90px] max-w-full" />
              </div>
              <div className="border-t-2 border-foreground p-3">
                <a href={brandFileUrl(f.name)} download className="font-mono text-[12px] break-all">
                  {f.name}
                </a>
                <div className="mt-1 text-[13px] text-charcoal-700">
                  {f.label}. {f.note}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Band>

      <Band>
        <div className={cn(kicker, "text-charcoal-700")}>Use</div>
        <H2 className="mt-3">Don&apos;t</H2>
        <ul className="mt-6 grid max-w-3xl gap-2 pl-5">
          {MISUSE.map(([rule, why]) => (
            <li key={rule}>
              <strong>{rule}</strong> {why}
            </li>
          ))}
        </ul>
        <p className={cn(cap, "mt-6")}>The design is Build Malaysia&apos;s; the flag in it belongs to everyone.</p>
      </Band>
    </>
  );
}
