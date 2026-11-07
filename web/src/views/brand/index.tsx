// The public brand sheet: the logo, its construction, lockups, misuse and motion; the colour, type, numbers and
// charts of the site it sits on; and the name, previews, files and terms for using it elsewhere.
import { PageHeader } from "@/components/Boxed";
import { Logo } from "@/components/brand/Logo";
import type { Page } from "@/lib/route";
import { ConstructionSection, LockupsSection, MisuseSection, MotionSection } from "./logo";
import { FilesSection, PreviewsSection, UseSection, VoiceSection } from "./outward";
import { Contents, PrintButton, SectionBar, Status } from "./section";
import { ChartsSection, ColourSection, NumbersSection, TypeSection } from "./system";

export default async function brandPage(): Promise<Page> {
  return {
    head: {
      title: "Brand",
      description:
        "The Build Malaysia logo, drawn to the official flag sheet with its stripes cut as a chart, and the colour, type, figures and charts of the site around it. With files to download.",
    },
    body: (
      <div data-brand-sheet>
        <SectionBar />
        <Status />
        <PageHeader
          eyebrow="Brand"
          title="Carta"
          intro={
            <p>
              The Jalur Gemilang, drawn to the government&apos;s construction sheet, with one change: its fourteen
              stripes are a bar chart. Each stripe is one unit shorter than the one above, so the fly edge runs at
              exactly 45°. Read fast, it is the flag. Read again, it is what this site does: public money, ranked.
            </p>
          }
        >
          <Contents />
          <PrintButton />
        </PageHeader>

        <section
          data-brand-hero
          className="grid grid-cols-1 gap-[2px] border-b-2 border-foreground bg-foreground md:grid-cols-[1.25fr_1fr]"
        >
          <div className="grid place-items-center bg-white px-6 py-16">
            <Logo unit={9} />
          </div>
          <div className="grid place-items-center bg-biru px-6 py-16">
            <Logo unit={7} tone="dark" />
          </div>
        </section>

        <ConstructionSection />
        <LockupsSection />
        <MisuseSection />
        <MotionSection />
        <ColourSection />
        <TypeSection />
        <NumbersSection />
        <ChartsSection />
        <VoiceSection />
        <PreviewsSection />
        <FilesSection />
        <UseSection />
      </div>
    ),
  };
}
