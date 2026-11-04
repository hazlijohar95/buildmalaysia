"use client";

// Boxed navigation in the style of buildcanada.com: a solid wordmark cell, bordered link cells and a
// dark call-to-action cell, collapsing to a menu below the lg breakpoint.
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

export interface NavItem {
  href: string;
  label: string;
  match: string; // path prefix that marks the link active
}

const cell =
  "flex items-center px-6 xl:px-8 font-mono text-[13px] uppercase tracking-[0.22em] no-underline transition-colors";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold leading-[0.9] tracking-tight ${className}`}>
      Build
      <br />
      Malaysia
    </span>
  );
}

export default function Header({ items, cta }: { items: NavItem[]; cta: NavItem }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (item: NavItem) =>
    item.match === "/" ? pathname === "/" : pathname === item.match || pathname.startsWith(`${item.match}/`);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-foreground bg-background">
      <div className="flex min-h-[72px] lg:min-h-[84px] items-stretch">
        <Link
          href="/"
          className="flex items-center bg-auburn-800 px-5 text-linen-50 no-underline hover:bg-auburn-900"
          aria-label="Build Malaysia home"
        >
          <Wordmark className="text-[26px] lg:text-[30px]" />
        </Link>
        <nav className="hidden lg:flex items-stretch" aria-label="Main navigation">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className={cn(
                cell,
                "border-r-2 border-foreground first:border-l-2 text-foreground",
                isActive(item) ? "bg-linen-200" : "hover:bg-linen-200",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <Link
          href={cta.href}
          className={cn(cell, "hidden lg:flex bg-foreground text-background hover:bg-charcoal-800")}
        >
          {cta.label}
        </Link>
        <button
          type="button"
          className="lg:hidden flex items-center border-l-2 border-foreground px-5 text-foreground"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <nav className="lg:hidden border-t-2 border-foreground" aria-label="Mobile navigation">
          {[...items, cta].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                cell,
                "py-4 border-b border-foreground/20 last:border-b-0 text-foreground",
                isActive(item) && "bg-linen-200",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
