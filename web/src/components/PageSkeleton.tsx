import { Loader } from "@/components/brand/Loader";

const bar = "skeleton-bar";

/**
 * The page's shape while its figures load. The layout puts it first in <main>, ahead of the page, and it shows
 * only while nothing follows it (global.css): while a streamed page waits on the database, after 300ms of waiting.
 */
export default function PageSkeleton() {
  return (
    <div id="page-skeleton" aria-hidden="true">
      <section className="border-b-2 border-foreground px-5 py-12 sm:px-8 md:px-16 md:py-16">
        <div className="mx-auto max-w-7xl">
          <div className={`${bar} h-3 w-36`} />
          <div className={`${bar} mt-6 h-10 w-[min(34rem,85%)] md:h-14`} />
          <div className="mt-6 max-w-3xl space-y-3">
            <div className={`${bar} h-4 w-full`} />
            <div className={`${bar} h-4 w-11/12`} />
            <div className={`${bar} h-4 w-2/3`} />
          </div>
        </div>
      </section>
      <section className="grid min-h-[45vh] place-items-center border-b-2 border-foreground px-5">
        <Loader size="md" label="Reading the statements" />
      </section>
    </div>
  );
}
