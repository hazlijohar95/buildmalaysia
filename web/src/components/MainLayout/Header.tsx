"use client";

// Boxed navigation in the style of buildcanada.com: a solid wordmark cell, bordered cells and a dark
// call-to-action cell. A cell is either a link or a menu that opens a boxed panel under the header, on
// hover with a mouse and on click or Enter otherwise. Below the lg breakpoint it collapses to one menu.
import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { kicker } from "@/components/Boxed";
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
      years?: NavLink[]; // a compact "By year" grid beside the main links
    };

// Sizes from buildcanada.com's nav: a 60px bar, 12px labels at 0.14em, 20px cell padding, 1px dividers,
// and hover that inverts the cell.
const cell =
  "flex items-center whitespace-nowrap px-5 font-mono text-[12px] font-medium uppercase leading-[1.3] tracking-[0.14em] no-underline transition-colors";

const OPEN_DELAY = 80; // ms of hover before a menu opens, so passing the pointer across the bar opens nothing
const CLOSE_DELAY = 160; // ms of grace after the pointer leaves, so a diagonal move into the panel keeps it open

// Slugged so any label makes a valid id, and a safe attribute selector for restoring focus on Escape.
const panelId = (label: string) => `nav-panel-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold leading-[0.9] tracking-tight ${className}`}>
      Build
      <br />
      Malaysia
    </span>
  );
}

export default function Header({ items, cta }: { items: NavItem[]; cta: NavLink }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const openedByHover = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isActive = (link: NavLink) => link.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

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
      if (openMenu) document.querySelector<HTMLButtonElement>(`[aria-controls="${panelId(openMenu)}"]`)?.focus();
      setOpenMenu(null);
      setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenu, mobileOpen]);

  // Each menu mounts its own panel, so without this the panel would replay its entrance when moving between
  // menus. It animates in only when a menu opens from closed.
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
          className="fixed inset-0 z-40 hidden lg:block bg-charcoal-1000/15 backdrop-blur-[2px] motion-safe:animate-[nav-fade-in_200ms_ease-out]"
          onClick={() => setOpenMenu(null)}
        />
      )}
      <header className="sticky top-[var(--frame)] z-50 border-y-2 border-foreground bg-background">
        <div className="flex min-h-[var(--bar)] items-stretch">
          <Link
            href="/"
            className="flex items-center bg-auburn-800 px-4 py-3 text-linen-50 no-underline hover:bg-auburn-900"
            aria-label="Build Malaysia home"
          >
            <Wordmark className="text-[20px]" />
          </Link>
          <nav className="hidden lg:flex items-stretch border-r border-foreground" aria-label="Main navigation">
            {items.map((item) => {
              if (item.kind === "link") {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={isActive(item) ? "page" : undefined}
                    className={cn(
                      cell,
                      "border-l border-foreground text-foreground",
                      isActive(item) ? "bg-linen-200" : "hover:bg-foreground hover:text-background",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              }
              const open = openMenu === item.label;
              const active = [...item.links, ...(item.years ?? [])].some(isActive);
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
                    aria-expanded={open}
                    aria-controls={panelId(item.label)}
                    onClick={() => {
                      clearTimeout(timer.current);
                      // A click right after hover opened the menu keeps it open instead of closing it.
                      const keep = open && openedByHover.current;
                      openedByHover.current = false;
                      if (!keep) setOpenMenu(open ? null : item.label);
                    }}
                    className={cn(
                      cell,
                      "gap-2 text-foreground cursor-pointer",
                      open
                        ? // The open button is the panel's tab: same paper, covering the bar's bottom rule beneath it.
                          "relative z-10 bg-linen-50 after:absolute after:inset-x-0 after:-bottom-[2px] after:h-[2px] after:bg-linen-50"
                        : active
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
                  {open && <MenuPanel id={panelId(item.label)} item={item} isActive={isActive} entering={entering} />}
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
  const count = item.links.length;
  return (
    // A sheet of lighter paper drawn from the bar. Its top rule is the bar's own, broken under the open button,
    // and its cells are ruled by hairline gaps over a tinted backing.
    <div
      id={id}
      className={cn(
        "absolute inset-x-0 top-full -mt-[2px] border-y-2 border-foreground bg-linen-50 shadow-[0_28px_56px_-28px_rgb(39_39_39/0.45)]",
        entering && "motion-safe:animate-[nav-panel-in_240ms_cubic-bezier(0.2,0,0,1)]",
      )}
    >
      <div
        className={cn(
          "grid gap-px bg-foreground/15",
          item.years?.length && "grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]",
        )}
      >
        <ul className="m-0 grid list-none grid-cols-3 gap-px p-0">
          {item.links.map((link, i) => {
            const active = isActive(link);
            return (
              <li
                key={link.href}
                // Over three links the first widens to fill the last row, so no cell is left empty.
                className={cn("flex", i === 0 && count > 3 && count % 3 === 2 && "col-span-2")}
              >
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className="group relative flex w-full flex-col bg-linen-50 px-7 py-7 xl:px-9 no-underline text-foreground transition-colors duration-200 hover:bg-linen-100"
                >
                  {/* A line that draws across the top on hover, and stays drawn for the current page. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-0 top-0 h-[2px] origin-left bg-auburn-700 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                      active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                    )}
                  />
                  <span className="flex items-baseline justify-between gap-4">
                    <span className="font-display text-xl font-semibold tracking-tight transition-colors duration-200 group-hover:text-auburn-800">
                      {link.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-auburn-800 opacity-0 -translate-x-1.5 transition-[opacity,transform] duration-300 ease-out group-hover:opacity-100 group-hover:translate-x-0"
                    >
                      →
                    </span>
                  </span>
                  {link.note && <span className="mt-1.5 text-sm leading-snug text-charcoal-700">{link.note}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        {item.years?.length ? (
          <div className="bg-linen-50 px-7 py-7 xl:px-9">
            <div className={cn(kicker, "text-[11px] text-charcoal-600")}>By year</div>
            <ul className="m-0 mt-5 grid list-none grid-cols-5 gap-px border border-foreground/25 bg-foreground/25 p-0">
              {item.years.map((link) => (
                <li key={link.href} className="flex">
                  <Link
                    href={link.href}
                    aria-current={isActive(link) ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-center font-mono text-[12px] tabular-nums tracking-[0.08em] no-underline transition-colors duration-150",
                      isActive(link)
                        ? "bg-auburn-800 text-linen-50"
                        : "bg-linen-50 text-charcoal-800 hover:bg-foreground hover:text-background",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
            {item.years?.length ? (
              <ul className="m-0 flex list-none flex-wrap gap-0 px-3.5 py-4 pl-[calc(0.875rem+2px)]">
                {item.years.map((link) => (
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
            ) : null}
          </div>
        ),
      )}
      {row(cta)}
    </nav>
  );
}
