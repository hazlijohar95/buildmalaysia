// The sheet's sections for people using the brand elsewhere: the name and voice, link previews, the files, and the
// terms for using the logo.
import { LuDownload } from "react-icons/lu";
import { kicker } from "@/components/Boxed";
import { PALETTE } from "@/brand/carta";
import { BRAND_ARTWORKS, BRAND_FILES, TOKEN_FILES, formatLabel, type BrandFile } from "@/brand/files";
import { SECONDARY, TERMS } from "@/brand/guide";
import { GROUND_STYLE, makeAspects, serverCaption } from "@/brand/make";
import { DEFAULT_SPEC, GROUNDS, LOCKUPS, WIDTHS, makeUrl, type MakeSpec } from "@/brand/make-spec";
import { BRAND_ZIP, brandFileUrl } from "@/brand/paths";
import { cn } from "@/lib/cn";
import { CONTACT_EMAIL } from "@/lib/contact";
import { previews } from "@/lib/previews";
import { Copy, DontMark, Section, cap, grid, h3, iconStroke } from "./section";

const NAME_RULES = [
  "Two words, both capitalised, every time.",
  "As an address, all lower case: buildmalaysia.com.",
  "In the logo the flag says Malaysia. In text, write both words.",
  "Carta is the logo's name, not the site's.",
];

const VOICE: { rule: string; why: string; write: string; not: string; lang?: "ms" }[] = [
  {
    rule: "Figures, not adjectives.",
    why: "The number carries the weight. Let the reader decide how big it is.",
    write: "Spent RM 1.14 bn, 6.0% more than its budget.",
    not: "A staggering billion-ringgit overspend.",
  },
  {
    rule: "Name the source.",
    why: "Every figure comes from a document, and the sentence says which.",
    write: "The audited statement prints RM 1.14 bn.",
    not: "Reports suggest about a billion.",
  },
  {
    rule: "Plain words, short sentences.",
    why: "Written for a reader who has never opened a budget book.",
    write: "What the government planned to spend.",
    not: "Budgetary allocations envisaged for expenditure.",
  },
  {
    rule: "Official names as printed.",
    why: "Ministries and programmes keep the Malay name the document uses, with English beside it where it helps.",
    write: "Kementerian Kesihatan",
    not: "MOH",
    lang: "ms",
  },
  {
    rule: "Malaysian English.",
    why: "British spelling, as the government writes in English.",
    write: "colour, programme, utilisation",
    not: "color, program, utilization",
  },
];

export function VoiceSection() {
  return (
    <Section id="voice" title="Build Malaysia, in two words">
      <div className={cn(grid, "mt-8 grid-cols-1 md:grid-cols-[1.1fr_1fr]")}>
        <div className="grid min-w-0 place-content-center gap-3 bg-white px-6 py-14 text-center">
          <div className="font-display text-5xl font-semibold tracking-tight md:text-6xl">Build Malaysia</div>
          <div className="font-mono text-sm text-charcoal-700">buildmalaysia.com</div>
        </div>
        <div className="min-w-0 bg-linen-50 p-6">
          <ul className="m-0 grid list-disc gap-2 pl-5 marker:text-charcoal-400">
            {NAME_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <DontMark />
            <span className="font-mono text-sm text-charcoal-700">
              BuildMalaysia · Build MY · BM · Build M&apos;sia
            </span>
          </div>
        </div>
      </div>

      <h3 className={cn(h3, "mt-14")}>How the site writes</h3>
      <ol className="m-0 mt-6 list-none border-t-2 border-foreground p-0">
        {VOICE.map((v) => (
          <li
            key={v.rule}
            className="grid gap-x-8 gap-y-3 border-b border-foreground/15 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"
          >
            <div>
              <div className="font-display text-lg font-semibold">{v.rule}</div>
              <div className="mt-1 text-sm text-charcoal-700">{v.why}</div>
            </div>
            <dl className="m-0 grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2">
              <dt className={cn(kicker, "text-charcoal-700")}>Write</dt>
              <dd className="m-0 font-medium" lang={v.lang}>
                {v.write}
              </dd>
              <dt className={cn(kicker, "text-charcoal-600")}>Not</dt>
              <dd className="m-0 text-charcoal-600">{v.not}</dd>
            </dl>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const PREVIEWS = [
  { preview: previews.site, note: "With a headline figure, in Biru, from the latest audited year." },
  { preview: previews.tax, note: "Without one: the title alone, set larger." },
];

export function PreviewsSection() {
  return (
    <Section
      id="previews"
      title="What a shared link shows"
      intro="The home page and the spending, revenue, tax, budget, year and ministry pages each draw a preview card, with the latest figure where the page leads with one. Every other page shares the home page's."
    >
      <div className={cn(grid, "mt-8 grid-cols-1 lg:grid-cols-2")}>
        {PREVIEWS.map(({ preview, note }) => (
          <figure key={preview.path} className="m-0 min-w-0 bg-linen-50">
            <img
              src={preview.path}
              alt={preview.alt}
              width={1200}
              height={630}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full bg-white"
            />
            <figcaption className="border-t-2 border-foreground p-4 text-sm text-charcoal-700">{note}</figcaption>
          </figure>
        ))}
      </div>
      <p className={cn(cap, "mt-4")}>
        1200 × 630. The stacked logo at the top right, a label, the page&apos;s title and, where it has one, its figure,
        over a Biru rule. Set in Cal Sans throughout.
      </p>
    </Section>
  );
}

const seg =
  "flex min-h-11 cursor-pointer items-center gap-2 border border-foreground/25 bg-white px-3 font-mono text-xs peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring,var(--color-biru-800))] peer-disabled:cursor-not-allowed peer-disabled:opacity-40";

function Choice({
  name,
  value,
  checked,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="relative">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className={seg}>{children}</span>
    </label>
  );
}

function Field({ legend, children, id }: { legend: string; children: React.ReactNode; id?: string }) {
  return (
    <fieldset id={id} className="m-0 min-w-0 border-0 p-0">
      <legend className={cn(kicker, "mb-2 p-0 text-charcoal-700")}>{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/**
 * The logo builder. Without JavaScript it is a form whose submission redirects to the file; with it, the preview,
 * the file name and the download follow every choice as it is made.
 */
function Builder() {
  const spec = DEFAULT_SPEC;
  const preview: MakeSpec = { lockup: spec.lockup, ground: spec.ground, format: "svg" };
  return (
    <form
      action="/brand/make"
      method="get"
      data-builder
      data-aspects={JSON.stringify(makeAspects())}
      className="mt-8 grid border-2 border-foreground md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <div
        data-builder-stage
        data-ground={spec.ground}
        className="builder-stage grid min-h-64 place-items-center border-b-2 border-foreground p-6 md:border-r-2 md:border-b-0"
      >
        <img
          data-builder-preview
          src={makeUrl(preview)}
          alt="Preview of the file"
          className="block max-h-56 max-w-full"
        />
      </div>
      <div className="grid min-w-0 content-start gap-5 bg-linen-50 p-5">
        <Field legend="Lockup">
          {LOCKUPS.map((l) => (
            <Choice key={l.id} name="lockup" value={l.id} checked={l.id === spec.lockup}>
              {l.label}
            </Choice>
          ))}
        </Field>
        <Field legend="Ground">
          {GROUNDS.map((g) => (
            <Choice key={g.id} name="ground" value={g.id} checked={g.id === spec.ground}>
              <span
                aria-hidden="true"
                className={cn("size-3.5 border border-foreground/30", g.id === "clear" && "builder-clear")}
                style={g.id === "clear" ? undefined : { background: GROUND_STYLE[g.id].hex ?? undefined }}
              />
              {g.label}
            </Choice>
          ))}
        </Field>
        <Field legend="Format">
          <Choice name="format" value="png" checked={spec.format === "png"}>
            PNG
          </Choice>
          <Choice name="format" value="svg" checked={spec.format === "svg"}>
            SVG
          </Choice>
        </Field>
        <Field legend="Width" id="builder-width">
          {WIDTHS.map((w) => (
            <label key={w} className="relative">
              <input
                type="radio"
                name="width"
                value={w}
                defaultChecked={spec.format === "png" && w === spec.width}
                className="peer sr-only"
              />
              <span className={cn(seg, "tabular-nums")}>{w} px</span>
            </label>
          ))}
        </Field>
        <div className="grid gap-2 border-t border-foreground/15 pt-5">
          <button
            type="submit"
            className={cn(
              kicker,
              "tap inline-flex min-h-12 items-center justify-center gap-3 justify-self-start bg-biru-800 pr-6 pl-[22px] text-linen-50 hover:bg-biru-700",
            )}
          >
            <DownloadIcon />
            Download this file
          </button>
          <output data-builder-name className="block break-all font-mono text-xs text-charcoal-700">
            {serverCaption(spec)}
          </output>
          <p className="m-0 text-xs text-charcoal-600">
            A ground adds the four stripes of clear space around the logo. None crops to the logo, on transparency.
          </p>
        </div>
      </div>
    </form>
  );
}

function DownloadIcon() {
  return <LuDownload aria-hidden="true" className="size-4" strokeWidth={iconStroke(16)} />;
}

function FileRow({
  title,
  note,
  preview,
  ground,
  files,
}: {
  title: string;
  note: string;
  preview: React.ReactNode;
  ground?: "biru";
  files: readonly BrandFile[];
}) {
  return (
    <li className="grid min-w-0 bg-linen-50 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div
        className={cn(
          "grid min-h-32 place-items-center border-b-2 border-foreground p-5 md:border-r-2 md:border-b-0",
          ground === "biru" ? "bg-biru" : "bg-white",
        )}
      >
        {preview}
      </div>
      <div className="grid min-w-0 content-center gap-4 p-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:items-center">
        <div>
          <div className="font-display text-lg font-semibold">{title}</div>
          <div className="text-sm text-charcoal-700">{note}</div>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {files.map((f) => (
            <li key={f.name}>
              <a
                href={brandFileUrl(f.name)}
                download
                title={f.name}
                className="tap flex min-h-11 flex-col justify-center border border-foreground/25 bg-white px-3 py-1.5 font-mono text-xs text-foreground no-underline hover:border-foreground"
              >
                <span>
                  <span className="sr-only">{title}, </span>
                  {formatLabel(f)}
                </span>
                {f.note && <span className="text-charcoal-600">{f.note}</span>}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function FilesSection() {
  return (
    <Section
      id="files"
      title="Download the logo"
      intro="Make the exact file you need, or take a ready-made one. “Build” is drawn as outlines in every file, so it looks the same without the font installed."
    >
      <Builder />

      <h3 className={cn(h3, "mt-14")}>Ready-made files</h3>
      <p className={cn(cap, "mt-2")}>
        The PDF is for print: it carries the flag&apos;s official CMYK, where a printer converting an SVG would have to
        guess. The tokens put every colour on this page into code or Figma in one paste.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <a
          href={brandFileUrl(BRAND_ZIP)}
          download
          className={cn(
            kicker,
            "tap inline-flex min-h-12 items-center gap-3 bg-biru-800 pr-6 pl-[22px] text-linen-50 no-underline hover:bg-biru-700",
          )}
        >
          <DownloadIcon />
          Download everything
        </a>
        <span className="font-mono text-sm text-charcoal-700">ZIP · {BRAND_FILES.length} files and a README</span>
      </div>
      <ul className={cn(grid, "m-0 mt-6 list-none grid-cols-1 p-0")}>
        {BRAND_ARTWORKS.map((a) => (
          <FileRow
            key={a.title}
            title={a.title}
            note={a.note}
            ground={a.ground}
            files={a.files}
            preview={<img src={brandFileUrl(a.files[0].name)} alt="" className="max-h-20 max-w-full" />}
          />
        ))}
        <FileRow
          title="Colour tokens"
          note="Every flag, site, scale and chart colour, named as on this page."
          files={TOKEN_FILES}
          preview={
            <span aria-hidden="true" className="grid grid-cols-4 border border-foreground/20">
              {[...Object.values(PALETTE), ...SECONDARY].map((c) => (
                <span key={c.hex} className="size-7" style={{ background: c.hex }} />
              ))}
            </span>
          }
        />
      </ul>
    </Section>
  );
}

export function UseSection() {
  return (
    <Section id="use" title="Use it as drawn, and ask for the rest">
      <div className={cn(grid, "mt-8 grid-cols-1 md:grid-cols-2")}>
        <div className="min-w-0 bg-linen-50 p-6">
          <div className={cn(kicker, "text-charcoal-700")}>Without asking, you may</div>
          <ul className="m-0 mt-4 grid list-disc gap-2 pl-5 marker:text-charcoal-400">
            {TERMS.may.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 bg-linen-50 p-6">
          <div className={cn(kicker, "text-charcoal-700")}>Please don&apos;t</div>
          <ul className="m-0 mt-4 grid list-disc gap-2 pl-5 marker:text-charcoal-400">
            {TERMS.mayNot.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Using the Build Malaysia logo")}`}
          className={cn(kicker, "tap inline-flex min-h-12 items-center border-2 border-foreground px-6 no-underline")}
        >
          Ask about anything else
        </a>
        <Copy value={CONTACT_EMAIL} className="font-mono text-sm text-charcoal-700" />
      </div>
      <p className={cn(cap, "mt-8")}>{TERMS.flag}</p>
    </Section>
  );
}
