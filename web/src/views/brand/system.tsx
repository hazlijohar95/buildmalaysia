// The sheet's sections about the site the logo sits on: colour, type, numbers and charts. Specimens render with the
// site's own classes, formatters and series list, so they show what the site does rather than a description of it.
import { kicker, pageTitle, sectionTitle, statFigure } from "@/components/Boxed";
import { PALETTE, type FlagColour } from "@/brand/carta";
import { contrast, grade } from "@/brand/contrast";
import { PAIRINGS, SECONDARY, TYPEFACES, type Typeface } from "@/brand/guide";
import { cn } from "@/lib/cn";
import { formatRinggit } from "@/components/Figures";
import { formatDate } from "@/lib/dates";
import { formatSen, formatSenCompact, parseSen } from "@/lib/money";
import { REST, SERIES, TRACK } from "@/styles/charts/series";
import { colours } from "@/styles/colours";
import { Copy, DontMark, Section, cap, grid, h3 } from "./section";

const COLOUR_URL =
  "https://dbook.penerangan.gov.my/dbook/dmdocuments/bendera_kita_jalur_gemilang_2017/files/basic-html/page12.html";
const HEX_URL = "https://commons.wikimedia.org/wiki/File:Flag_of_Malaysia.svg";

/** The two scales generated from flag colours, with the step that is the flag's own. */
const SCALES = [
  { name: "Biru", family: "biru", flag: "800", role: "Brand and interaction: links, focus, navigation." },
  { name: "Merah", family: "merah", flag: "600", role: "Action and data: buttons, spending, overspend." },
] as const;

/** A ratio cut, never rounded, to two places: 4.497 shows as 4.49, so a failing pair never reads as passing. */
const ratioLabel = (r: number) => `${(Math.floor(r * 100) / 100).toFixed(2)} : 1`;

function Swatch({ colour }: { colour: FlagColour }) {
  const c = PALETTE[colour];
  return (
    <div className="min-w-0 bg-linen-50">
      <div className="h-28 border-b-2 border-foreground" style={{ background: c.hex }} />
      <div className="p-4">
        <div className="font-display text-xl font-semibold">{c.name}</div>
        <div className="text-sm text-charcoal-700">{c.role}</div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
          <dt className="text-charcoal-600">Pantone</dt>
          <dd className="m-0">
            {c.pantone ? <Copy value={`Pantone ${c.pantone}`}>{c.pantone}</Copy> : "none (paper)"}
          </dd>
          <dt className="text-charcoal-600">CMYK</dt>
          <dd className="m-0">
            <Copy value={c.cmyk} />
          </dd>
          <dt className="text-charcoal-600">Screen</dt>
          <dd className="m-0 uppercase">
            <Copy value={c.hex} />
          </dd>
        </dl>
      </div>
    </div>
  );
}

function Scale({ name, family, flag, role }: (typeof SCALES)[number]) {
  const steps = Object.entries(colours[family]);
  return (
    <figure className="m-0">
      <figcaption className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-display text-lg font-semibold">{name}</span>
        <span className="text-sm text-charcoal-700">{role}</span>
      </figcaption>
      <ol className="m-0 mt-3 grid list-none grid-cols-11 border-2 border-foreground p-0">
        {steps.map(([step, hex]) => (
          <li key={step} className="min-w-0">
            <Copy value={hex} className="block w-full">
              <span className="block h-14" style={{ background: hex }} />
              <span
                className={cn(
                  "block border-t-2 border-foreground px-1 py-1.5 text-center font-mono text-xs tabular-nums",
                  step === flag ? "bg-foreground text-background" : "bg-linen-50",
                )}
              >
                <span className="sr-only">
                  {name} {step},{" "}
                </span>
                {step}
              </span>
            </Copy>
          </li>
        ))}
      </ol>
      <p className="m-0 mt-2 font-mono text-xs text-charcoal-600">
        The marked step, {flag}, is the flag&apos;s own {colours[family][flag].toUpperCase()}.
      </p>
    </figure>
  );
}

export function ColourSection() {
  return (
    <Section id="colour" title="The flag's four, and the site's paper and ink">
      <div className={cn(grid, "mt-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4")}>
        {(Object.keys(PALETTE) as FlagColour[]).map((c) => (
          <Swatch key={c} colour={c} />
        ))}
      </div>
      <p className={cn(cap, "mt-4")}>
        Pantone and CMYK: Jabatan Penerangan,{" "}
        <a href={COLOUR_URL}>
          <i lang="ms">Bendera Kita: Jalur Gemilang</i> (2017), Jadual 1
        </a>
        . The government publishes no screen values; the hex codes are those of{" "}
        <a href={HEX_URL}>Wikimedia&apos;s reference drawing</a>. In code they are the Tailwind colours{" "}
        <code>biru</code>, <code>merah</code> and <code>kuning</code>.
      </p>
      <div className={cn(grid, "mt-8 grid-cols-2 lg:grid-cols-4")}>
        {SECONDARY.map((c) => (
          <div key={c.name} className="min-w-0 bg-linen-50">
            <div className="h-14 border-b-2 border-foreground" style={{ background: c.hex }} />
            <div className="p-4">
              <div className="font-display text-lg font-semibold">{c.name}</div>
              <div className="text-sm text-charcoal-700">{c.role}</div>
              <div className="mt-2 font-mono text-xs">
                <Copy value={c.hex} className="uppercase" />
                <br />
                <Copy value={c.token} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <h3 className={cn(h3, "mt-14")}>Biru and Merah, 50 to 950</h3>
      <p className={cn(cap, "mt-2")}>
        Each scale is generated from its flag colour, so a lighter or darker step is still the flag&apos;s hue. Kuning
        has no scale: it appears only in the flag and as a highlight on dark grounds.
      </p>
      <div className="mt-6 grid gap-8">
        {SCALES.map((s) => (
          <Scale key={s.family} {...s} />
        ))}
      </div>

      <h3 className={cn(h3, "mt-14")}>Text and ground</h3>
      <p className={cn(cap, "mt-2")}>
        The pairings most of the site&apos;s text is set in, with their contrast under WCAG 2.2. Body text needs AA, 4.5
        : 1, and the test suite fails if a text pairing listed here drops under it.
      </p>
      <ul className="m-0 mt-6 list-none border-t-2 border-foreground p-0">
        {PAIRINGS.map((p) => {
          const ratio = contrast(p.fg, p.bg);
          const g = grade(ratio);
          return (
            <li
              key={p.label}
              className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-foreground/15 py-3"
            >
              <span
                aria-hidden="true"
                className="grid h-12 place-items-center border border-foreground/15 font-display text-xl font-semibold"
                style={{ color: p.fg, background: p.bg }}
              >
                Aa
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{p.label}</span>
                <span className="block text-sm text-charcoal-700">{p.use}</span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-sm tabular-nums">{ratioLabel(ratio)}</span>
                {p.kind === "never" ? (
                  <DontMark className="mt-1" />
                ) : (
                  <span className={cn(kicker, "block text-charcoal-600")}>{g}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

const FAMILY_CLASS: Record<Typeface["family"], string> = {
  display: "font-display font-semibold tracking-tight",
  sans: "font-sans",
  mono: "font-mono",
};

const SAMPLES: Record<Typeface["family"], string> = {
  display: "Every ringgit should be easy to follow.",
  sans: "How the Malaysian federal government budgets and spends public money, from the audited statements and the budget books.",
  mono: "RM 13,532,772.40",
};

/** The site's type, largest first, each set with the class the site sets it with. */
const SCALE: { role: string; spec: string; className: string; sample: string; container?: boolean }[] = [
  {
    role: "Page title",
    spec: "Cal Sans 600 · 36px, 60px from md · tracking −0.025em",
    className: pageTitle,
    sample: "Where the money went",
  },
  {
    role: "Headline figure",
    spec: "Cal Sans 600 · up to 48px, fitted to its box · tabular",
    className: statFigure,
    sample: formatSenCompact(parseSen(114_000_000_000)),
    container: true,
  },
  {
    role: "Section heading",
    spec: "Cal Sans 600 · 30px, 36px from md · tracking −0.025em",
    className: sectionTitle,
    sample: "Drawn on the official sheet",
  },
  {
    role: "Lead",
    spec: "Geist 400 · 18px",
    className: "text-lg text-charcoal-800",
    sample: "How the Malaysian federal government budgets and spends public money.",
  },
  {
    role: "Body",
    spec: "Geist 400 · 16px · 1.5",
    className: "text-base",
    sample:
      "Every total a document prints is recomputed from the rows beneath it, and the result of each check is shown live on the methodology page.",
  },
  {
    role: "Caption",
    spec: "Geist 400 · 14px · Charcoal 700",
    className: "text-sm text-charcoal-700",
    sample: "Every figure links to the page it came from.",
  },
  {
    role: "Label",
    spec: "Paper Mono 400 · 12px · capitals · tracking 0.22em",
    className: cn(kicker, "text-charcoal-700"),
    sample: "Federal spending",
  },
];

function TypefaceCard({ face }: { face: Typeface }) {
  const host = face.source.replace(/^https:\/\/github\.com\//, "github.com/");
  return (
    <div className="flex min-w-0 flex-col bg-linen-50">
      <div className="flex min-h-56 flex-col justify-between gap-6 bg-white p-5">
        <div className={cn(FAMILY_CLASS[face.family], "text-7xl leading-none")} aria-hidden="true">
          Aa
        </div>
        <p className={cn(FAMILY_CLASS[face.family], "m-0", face.family === "display" ? "text-2xl" : "text-base")}>
          {SAMPLES[face.family]}
        </p>
      </div>
      <div className="flex-1 border-t-2 border-foreground p-4">
        <div className="font-display text-lg font-semibold">{face.name}</div>
        <div className="text-sm text-charcoal-700">{face.role}</div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
          <dt className="text-charcoal-600">Weights</dt>
          <dd className="m-0">{face.weights}</dd>
          <dt className="text-charcoal-600">Licence</dt>
          <dd className="m-0">SIL OFL 1.1</dd>
          <dt className="text-charcoal-600">Source</dt>
          <dd className="m-0 min-w-0 break-words">
            <a href={face.source}>{host}</a>
          </dd>
        </dl>
      </div>
    </div>
  );
}

export function TypeSection() {
  return (
    <Section
      id="type"
      title="Three faces, each with one job"
      intro="All three are free under the SIL Open Font License, so anyone writing about the site can set it the same way."
    >
      <div className={cn(grid, "mt-8 grid-cols-1 lg:grid-cols-3")}>
        {TYPEFACES.map((f) => (
          <TypefaceCard key={f.name} face={f} />
        ))}
      </div>

      <h3 className={cn(h3, "mt-14")}>The scale</h3>
      <ol className="m-0 mt-6 list-none border-t-2 border-foreground p-0">
        {SCALE.map((s) => (
          <li
            key={s.role}
            className="grid gap-x-8 gap-y-2 border-b border-foreground/15 py-5 md:grid-cols-[14rem_minmax(0,1fr)]"
          >
            <div>
              <div className={cn(kicker, "text-charcoal-700")}>{s.role}</div>
              <div className="mt-1 font-mono text-xs text-charcoal-600">{s.spec}</div>
            </div>
            <div className={cn("min-w-0 max-w-[65ch]", s.container && "@container max-w-sm")}>
              <div className={s.className}>{s.sample}</div>
            </div>
          </li>
        ))}
      </ol>
      <ul className={cn(cap, "mt-6 grid list-disc gap-1.5 pl-5 marker:text-charcoal-400")}>
        <li>
          Headings are in sentence case and balance their lines. Capitals are for labels: Paper Mono kickers and Cal
          Sans table headers.
        </li>
        <li>Figures use tabular numerals, so a column of amounts lines up digit for digit.</li>
        <li>
          Running text is 12px or larger. Only compact labels on phones go smaller: 11px on tabs and switches, 10px in
          the tab bar.
        </li>
        <li>
          Cal Sans and Paper Mono are cut to Latin, which covers Malay and English; other scripts fall back to the
          system&apos;s fonts.
        </li>
      </ul>
    </Section>
  );
}

const sen = (rm: number) => parseSen(Math.round(rm * 100));

const NUMBER_RULES = [
  {
    label: "Exact",
    example: formatSen(sen(13_532_772.4)),
    note: "RM, a space, a comma every three digits, and always two decimal places.",
  },
  {
    label: "Compact",
    example: formatSenCompact(sen(1_140_000_000)),
    note: `From a million up: ${formatSenCompact(sen(120_000_000))}, ${formatSenCompact(sen(1_140_000_000))}. Past a thousand billion it stays in billions: ${formatSenCompact(sen(1_179_750_000_000))}.`,
  },
  {
    label: "As the budget books print",
    example: formatRinggit(sen(2_000_000_000)),
    note: "Budget-book figures are whole ringgit, so they keep no sen.",
  },
  {
    label: "Percentages",
    example: "87.4%",
    note: "One decimal place, no space. A change carries its sign: +4.2%. Spending past 100% of its budget is Merah.",
  },
  {
    label: "Nothing printed",
    example: "–",
    note: "An en dash where the document prints no figure. A blank is never written as zero.",
  },
  { label: "Dates", example: formatDate("2020-03-10"), note: "Day, short month, year." },
];

const NUMBER_PAIRS = [
  [formatSenCompact(sen(1_140_000_000)), "RM1.14b · RM 1.1 billion · MYR 1.14bn"],
  [formatSen(sen(13_532_772.4)), "RM13532772.4 · RM 13.5 million"],
  ["87.4%", "87.40 % · 87%"],
  [formatDate("2020-03-10"), "10/3/2020 · March 10, 2020"],
] as const;

export function NumbersSection() {
  return (
    <Section
      id="numbers"
      title="Every figure, one way"
      intro={
        <>
          <p className="m-0">
            Amounts are in ringgit as printed in that year&apos;s document, never adjusted for inflation. In stat boxes,
            ranked lists and tables, a rounded figure keeps the exact one close: under it, on hover, and read aloud to
            screen readers.
          </p>
          <p className="m-0">The amounts and dates below are the output of the site&apos;s own formatters.</p>
        </>
      }
    >
      <div className={cn(grid, "mt-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
        {NUMBER_RULES.map((r) => (
          <div key={r.label} className="@container min-w-0 bg-linen-50 p-5">
            <div className={cn(kicker, "text-charcoal-700")}>{r.label}</div>
            <div className="mt-3 font-display text-[min(2.5rem,8cqi)] leading-tight font-semibold tracking-tight tabular-nums whitespace-nowrap">
              {r.example}
            </div>
            <div className="mt-2 text-sm text-charcoal-700">{r.note}</div>
          </div>
        ))}
      </div>
      <table className="mt-8 max-w-3xl">
        <thead>
          <tr>
            <th scope="col">Write</th>
            <th scope="col">Not</th>
          </tr>
        </thead>
        <tbody>
          {NUMBER_PAIRS.map(([write, not]) => (
            <tr key={write}>
              <td className="font-medium tabular-nums whitespace-nowrap">{write}</td>
              <td className="text-charcoal-600">{not}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** A specimen ranked list: three bars, labelled with what each part of the chart is. */
const SPECIMEN = [
  { name: "Largest first", amount: sen(1_140_000_000) },
  { name: "Scaled to the largest", amount: sen(820_000_000) },
  { name: "Then the rest, in order", amount: sen(120_000_000) },
];

const CHART_RULES = [
  ["Bars run from the hoist.", "They grow from the left like Carta's stripes, ranked largest first and numbered."],
  [
    "One measure, one colour.",
    "A ranked list's bars are Merah 600. A bar in a table is Dakwat, and turns Merah past 100% of its budget.",
  ],
  ["Spending leads in Merah, revenue in Lake.", "Breakdowns of spending start from Merah; revenue's start from Lake."],
  [
    "Square, flat and level.",
    "No rounded ends, gradients, shadows or 3D. Stacked parts are split by a hairline of page.",
  ],
  [
    "Round on the bar, exact on request.",
    "A ranked list shows the compact figure, with the exact one on hover and for screen readers.",
  ],
] as const;

export function ChartsSection() {
  const max = Math.max(...SPECIMEN.map((s) => s.amount));
  return (
    <Section
      id="charts"
      title="Charts read like the logo"
      intro="Carta is a ranked bar chart, so the site's charts are drawn the same way: from one edge, in order, in the flag's red."
    >
      <figure className="m-0 mt-8 border-2 border-foreground bg-linen-50 p-5 md:p-8">
        <div className={cn(kicker, "text-charcoal-600")}>Specimen</div>
        <ol className="m-0 mt-4 list-none border-t-2 border-foreground p-0">
          {SPECIMEN.map((s, i) => (
            <li
              key={s.name}
              className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-foreground/15 py-3.5 md:grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1fr)_7.5rem]"
            >
              <span className={cn(kicker, "text-charcoal-600")}>{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 font-medium">
                {s.name}
                <span className="mt-2 block h-1 bg-linen-200 md:hidden" aria-hidden="true">
                  <span className="block h-full bg-merah-600" style={{ width: `${(s.amount / max) * 100}%` }} />
                </span>
              </span>
              <span className="hidden h-2.5 bg-linen-200 md:block" aria-hidden="true">
                <span className="block h-full bg-merah-600" style={{ width: `${(s.amount / max) * 100}%` }} />
              </span>
              <span
                className="relative text-right font-display text-lg font-semibold tabular-nums"
                title={formatSen(s.amount)}
              >
                <span aria-hidden="true">{formatSenCompact(s.amount)}</span>
                <span className="sr-only">{formatSen(s.amount)}</span>
              </span>
            </li>
          ))}
        </ol>
      </figure>
      <ul
        className={cn(
          grid,
          // An odd last rule spans the row, so no empty cell shows the grid's ink.
          "m-0 mt-6 list-none grid-cols-1 p-0 sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2 lg:grid-cols-5 lg:[&>li:last-child:nth-child(odd)]:col-span-1",
        )}
      >
        {CHART_RULES.map(([rule, why]) => (
          <li key={rule} className="min-w-0 bg-linen-50 p-4">
            <div className="font-display text-lg font-semibold leading-snug">{rule}</div>
            <div className="mt-1 text-sm text-charcoal-700">{why}</div>
          </li>
        ))}
      </ul>

      <h3 className={cn(h3, "mt-14")}>More than one series</h3>
      <p className={cn(cap, "mt-2")}>
        A breakdown of spending gives its parts these colours in order, the largest first; past the seventh, the rest
        are gathered into one grey. Revenue has its own set, led by Lake. Each of the seven holds at least 4 : 1 against
        the Linen 200 track, so none fades into the empty part of a bar; the grey for the rest is meant to recede.
      </p>
      <ol className={cn(grid, "m-0 mt-6 list-none grid-cols-2 p-0 sm:grid-cols-4 lg:grid-cols-8")}>
        {[...SERIES, REST].map((s, i) => (
          <li key={s.token} className="min-w-0 bg-linen-50">
            <div className="h-16" style={{ background: s.hex }} />
            <div className="border-t-2 border-foreground p-2">
              <div className="font-mono text-xs text-charcoal-600">{i < SERIES.length ? i + 1 : "Rest"}</div>
              <div className="font-mono text-xs">
                <Copy value={s.token} />
                <br />
                <Copy value={s.hex} className="uppercase text-charcoal-700" />
              </div>
              <div className="font-mono text-xs tabular-nums text-charcoal-600">
                {(Math.floor(contrast(s.hex, TRACK.hex) * 10) / 10).toFixed(1)} : 1
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
