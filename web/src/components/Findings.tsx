import { Band, H2, kicker } from "@/components/Boxed";
import Carousel, { carouselItem } from "@/components/Carousel";
import CitationLink from "@/components/CitationLink";
import { cn } from "@/lib/cn";
import { FINDINGS, type Finding } from "@/lib/findings";

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <div className={cn("bg-background flex flex-col gap-2 px-6 py-10 md:px-8 max-md:py-7", carouselItem)}>
      <div className={cn(kicker, "text-charcoal-700")}>{finding.kicker}</div>
      <a href={finding.href} className="font-display text-2xl font-semibold tracking-tight hover:underline">
        {finding.headline}
      </a>
      <p className="m-0 mt-1 text-charcoal-800">{finding.body}</p>
      {finding.source && (
        <div className="mt-auto pt-3">
          <CitationLink
            year={finding.source.year}
            docUrl={finding.source.docUrl}
            pdfPage={finding.source.pdfPage}
            bookPage={finding.source.bookPage}
            spread={finding.source.spread}
          />
        </div>
      )}
    </div>
  );
}

export default async function Findings({ year }: { year: number }) {
  const loaded = (await Promise.all(FINDINGS.map((def) => def.load(year)))).filter((f): f is Finding => f !== null);

  if (loaded.length === 0) return null;

  return (
    <section className="border-b-2 border-foreground">
      <Band className="border-b-0 py-10 md:py-12">
        <H2>What the numbers show</H2>
        <p className="mt-3 m-0 text-charcoal-700">
          Computed from the FY{year} audited statements. Every figure links to its source.
        </p>
      </Band>
      <Carousel
        count={loaded.length}
        label="Findings"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[2px] bg-foreground"
      >
        {loaded.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </Carousel>
    </section>
  );
}
