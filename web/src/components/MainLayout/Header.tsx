"use client";

// Boxed navigation in the style of buildcanada.com: a solid wordmark cell, bordered cells and a dark
// call-to-action cell. A cell is either a link or a menu that opens a boxed panel under the header, on
// hover with a mouse and on click or Enter otherwise. Below the lg breakpoint it collapses to one menu.
import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface NavLink {
  href: string;
  label: string;
  note?: string; // one line under the label in a menu panel
  match: string[]; // path prefixes that mark the link active
}

export type NavItem =
  | ({ kind: "link" } & NavLink)
  | {
      kind: "menu";
      label: string;
      links: NavLink[];
      years?: { title: string; links: NavLink[] }; // a compact grid of year links beside the main links
    };

// Sizes from buildcanada.com's nav: a 60px bar, 12px labels at 0.14em, 20px cell padding, 1px dividers,
// and hover that inverts the cell.
const cell =
  "flex items-center whitespace-nowrap px-5 font-mono text-[12px] font-medium uppercase leading-[1.3] tracking-[0.14em] no-underline transition-colors";
const kicker = "font-mono text-[12px] uppercase tracking-[0.22em]";

const OPEN_DELAY = 80; // ms of hover before a menu opens, so passing the pointer across the bar opens nothing
const CLOSE_DELAY = 160; // ms of grace after the pointer leaves, so a diagonal move into the panel keeps it open

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold leading-[0.9] tracking-tight ${className}`}>
      Build
      <br />
      Malaysia
    </span>
  );
}

const menuLinks = (item: NavItem): NavLink[] =>
  item.kind === "link" ? [item] : [...item.links, ...(item.years?.links ?? [])];

export default function Header({ items, cta }: { items: NavItem[]; cta: NavLink }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const openedByHover = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const triggers = useRef(new Map<string, HTMLButtonElement>());

  const isActive = (link: NavLink) => link.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
  const itemActive = (item: NavItem) => menuLinks(item).some(isActive);

  const schedule = (fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  const hoverOpen = (label: string) => {
    openedByHover.current = true;
    // Moving between open menus switches at once; opening from closed waits a beat.
    schedule(() => setOpenMenu(label), openMenu ? 0 : OPEN_DELAY);
  };
  const hoverClose = () => schedule(() => setOpenMenu(null), CLOSE_DELAY);

  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!openMenu && !mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openMenu) triggers.current.get(openMenu)?.focus();
      setOpenMenu(null);
      setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenu, mobileOpen]);

  // The panel animates in only when a menu opens from closed, not when moving between menus.
  const wasOpen = useRef(false);
  const entering = openMenu !== null && !wasOpen.current;
  useEffect(() => {
    wasOpen.current = openMenu !== null;
  }, [openMenu]);

  return (
    <>
      {openMenu && (
        // Dims the page under an open menu, so the panel reads as a layer above it.
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 hidden lg:block bg-charcoal-1000/20 motion-safe:animate-[nav-fade-in_200ms_ease-out]"
          onClick={() => setOpenMenu(null)}
        />
      )}
      <header className="sticky top-[10px] z-50 border-y-2 border-foreground bg-background">
        <div className="flex min-h-[60px] items-stretch">
          <Link
            href="/"
            className="flex items-center bg-auburn-800 px-4 py-3 text-linen-50 no-underline hover:bg-auburn-900"
            aria-label="Build Malaysia home"
          >
            <Wordmark className="text-[20px]" />
          </Link>
          <nav className="hidden lg:flex items-stretch border-r border-foreground" aria-label="Main navigation">
            {items.map((item) => {
              const base = cn(cell, "border-l border-foreground text-foreground");
              if (item.kind === "link") {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={isActive(item) ? "page" : undefined}
                    className={cn(base, isActive(item) ? "bg-linen-200" : "hover:bg-foreground hover:text-background")}
                  >
                    {item.label}
                  </Link>
                );
              }
              const open = openMenu === item.label;
              const panelId = `nav-panel-${item.label.toLowerCase()}`;
              return (
                <div
                  key={item.label}
                  className="flex border-l border-foreground"
                  onPointerEnter={(e) => e.pointerType === "mouse" && hoverOpen(item.label)}
                  onPointerLeave={(e) => e.pointerType === "mouse" && hoverClose()}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setOpenMenu((m) => (m === item.label ? null : m));
                  }}
                >
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) triggers.current.set(item.label, el);
                    }}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => {
                      clearTimeout(timer.current);
                      // A click right after hover opened the menu keeps it open instead of closing it.
                      if (open && openedByHover.current) openedByHover.current = false;
                      else {
                        openedByHover.current = false;
                        setOpenMenu(open ? null : item.label);
                      }
                    }}
                    className={cn(
                      cell,
                      "gap-2 text-foreground cursor-pointer",
                      open
                        ? "bg-charcoal-1000 text-linen-50"
                        : itemActive(item)
                          ? "bg-linen-200 hover:bg-foreground hover:text-background"
                          : "hover:bg-foreground hover:text-background",
                    )}
                  >
                    {item.label}
                    <ChevronDown
                      aria-hidden="true"
                      className={cn("h-3 w-3 transition-transform duration-150", open && "rotate-180")}
                    />
                  </button>
                  {open && <MenuPanel id={panelId} item={item} isActive={isActive} entering={entering} />}
                </div>
              );
            })}
          </nav>
          <div className="flex-1" />
          <Link
            href={cta.href}
            className={cn(
              cell,
              "hidden lg:flex border-l border-foreground bg-foreground text-background hover:bg-auburn-800",
            )}
          >
            {cta.label}
          </Link>
          <button
            type="button"
            className="lg:hidden flex items-center border-l border-foreground px-5 text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            <span className="sr-only">{mobileOpen ? "Close menu" : "Open menu"}</span>
            {mobileOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>
        {mobileOpen && <MobileMenu items={items} cta={cta} isActive={isActive} />}
      </header>
    </>
  );
}

function MenuPanel({
  id,
  item,
  isActive,
  entering,
}: {
  id: string;
  item: Extract<NavItem, { kind: "menu" }>;
  isActive: (link: NavLink) => boolean;
  entering: boolean;
}) {
  return (
    // The same dark as its open button, so the two read as one shape dropping from the bar.
    <div
      id={id}
      className={cn(
        "absolute inset-x-0 top-full bg-charcoal-1000 text-linen-50 shadow-[0_24px_48px_-32px_rgb(0_0_0/0.6)]",
        entering && "motion-safe:animate-[nav-panel-in_220ms_cubic-bezier(0.2,0,0,1)]",
      )}
    >
      <div className="flex gap-16 px-10 py-10 xl:px-14 xl:py-12">
        <ul className="m-0 grid flex-1 list-none grid-cols-3 gap-x-12 gap-y-9 p-0">
          {item.links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive(link) ? "page" : undefined}
                className="group block no-underline text-linen-50"
              >
                <span className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
                  {link.label}
                  {isActive(link) && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-auburn-500" />}
                  <span
                    aria-hidden="true"
                    className="text-linen-50/60 opacity-0 -translate-x-1 transition-[opacity,transform] duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0"
                  >
                    →
                  </span>
                </span>
                {link.note && (
                  <span className="mt-1 block text-sm leading-snug text-linen-50/50 transition-colors duration-200 group-hover:text-linen-50/75">
                    {link.note}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        {item.years && (
          <div className="w-64 shrink-0 border-l border-linen-50/10 pl-12">
            <div className={cn(kicker, "text-[11px] text-linen-50/40")}>{item.years.title}</div>
            <ul className="m-0 mt-4 grid list-none grid-cols-5 gap-x-4 gap-y-3 p-0">
              {item.years.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive(link) ? "page" : undefined}
                    className={cn(
                      "font-mono text-[13px] tabular-nums no-underline underline-offset-[6px] transition-colors duration-150",
                      isActive(link)
                        ? "text-linen-50 underline decoration-auburn-500 decoration-2"
                        : "text-linen-50/50 hover:text-linen-50",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileMenu({
  items,
  cta,
  isActive,
}: {
  items: NavItem[];
  cta: NavLink;
  isActive: (link: NavLink) => boolean;
}) {
  const row = (link: NavLink) => (
    <Link
      key={link.href}
      href={link.href}
      aria-current={isActive(link) ? "page" : undefined}
      className={cn(cell, "py-4 border-b border-foreground/20 text-foreground", isActive(link) && "bg-linen-200")}
    >
      {link.label}
    </Link>
  );
  return (
    <nav id="mobile-menu" className="lg:hidden border-t-2 border-foreground" aria-label="Mobile navigation">
      {items.map((item) =>
        item.kind === "link" ? (
          row(item)
        ) : (
          <div key={item.label} className="border-b-2 border-foreground">
            <div className={cn(kicker, "px-3.5 pt-5 pb-2 text-charcoal-700")}>{item.label}</div>
            <div className="pl-4">{item.links.map(row)}</div>
            {item.years && (
              <ul className="m-0 flex list-none flex-wrap gap-0 px-3.5 py-4 pl-[calc(0.875rem+2px)]">
                {item.years.links.map((link) => (
                  <li key={link.href} className="-ml-[2px] -mt-[2px]">
                    <Link
                      href={link.href}
                      aria-current={isActive(link) ? "page" : undefined}
                      className={cn(
                        kicker,
                        "inline-flex min-h-11 items-center px-3 border-2 border-foreground no-underline",
                        isActive(link) ? "bg-foreground text-background" : "text-foreground",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ),
      )}
      {row(cta)}
    </nav>
  );
}
