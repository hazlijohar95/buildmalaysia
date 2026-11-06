import type { Metadata } from "next";
import Link from "next/link";
import { kicker } from "@/components/Boxed";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Page not found",
};

const LINKS = [
  { href: "/spending", label: "Where the money went", note: "Federal spending, year by year" },
  { href: "/ministries", label: "Ministries", note: "What each ministry spent" },
  { href: "/tax", label: "Your taxes", note: "Where your income tax goes" },
];

export default function NotFound() {
  return (
    <>
      <section className="border-b-2 border-foreground px-5 py-16 sm:px-8 md:px-16 md:py-24">
        <div className="mx-auto max-w-6xl">
          {/* The flag with every stripe at zero: nothing to rank. */}
          <Logo lockup="flag" unit={5} ghost decorative className="mb-10 text-charcoal-1000" />
          <div className={cn(kicker, "text-charcoal-700")}>Error 404</div>
          <h1 className="mt-4 m-0 font-display text-4xl md:text-6xl font-semibold tracking-tight">
            Nothing ranked here.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-charcoal-800">
            We couldn&apos;t find that page. The link may be out of date, or the year or vote may not be loaded. These
            are good places to start.
          </p>
        </div>
      </section>
      <nav
        className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-foreground border-b-2 border-foreground"
        aria-label="Start here"
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="bg-background px-6 py-10 md:px-10 no-underline text-foreground hover:bg-linen-200"
          >
            <span className="block font-display text-2xl font-semibold tracking-tight">{l.label} →</span>
            <span className="mt-1 block text-charcoal-700">{l.note}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
