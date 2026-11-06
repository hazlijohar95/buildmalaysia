// Boxed navigation in the style of buildcanada.com: a white logo cell, bordered cells and a dark
// call-to-action cell. A cell is either a link or a menu that opens a boxed panel under the header, on
// hover with a mouse and on click or Enter otherwise. Below the lg breakpoint the menus move to MobileNav.
//
// Rendered on the server only. Every menu's panel is in the markup, hidden, and nav.ts opens and closes them by
// setting `aria-expanded` and `hidden`; the styles below key off those attributes, so the header needs no React
// in the browser.
import { LuChevronDown, LuSearch } from "react-icons/lu";
import { kicker } from "@/components/Boxed";
import { Logo } from "@/components/brand/Logo";
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
  "flex items-center whitespace-nowrap px-5 font-mono text-[0.75rem] font-medium uppercase leading-[1.3] tracking-[0.14em] no-underline transition-colors duration-150 ease-out";

// Slugged so any label makes a valid id.
const panelId = (label: string) => `nav-panel-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

export default function Header({ items, cta, pathname }: { items: NavItem[]; cta: NavLink; pathname: string }) {
  const isActive = (link: NavLink) => link.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <>
      {/* Dims the page under an open menu, so the panel reads as a layer above it. */}
      <div
        data-nav-backdrop
        hidden
        aria-hidden="true"
        className="fixed inset-0 z-40 hidden lg:block bg-charcoal-1000/15 backdrop-blur-[2px] motion-safe:animate-[nav-fade-in_200ms_ease-out]"
      />
      <header data-site-header className="sticky top-[var(--frame)] z-50 border-y-2 border-foreground bg-background">
        <div className="flex min-h-[var(--bar)] items-stretch">
          {/* At 1.5px a stripe the logo is 37.5px tall; an 11px top inset puts every stripe edge on a whole
              device pixel at 2x. The cell is white because the flag's white stripes need a white ground. */}
          <a
            href="/"
            className="flex items-start bg-white px-4 pt-[11px] no-underline"
            aria-label="Build Malaysia home"
          >
            <Logo unit={1.5} intro interactive decorative />
          </a>
          <nav className="hidden lg:flex items-stretch border-r border-foreground" aria-label="Main navigation">
            {items.map((item) => {
              if (item.kind === "link") {
                return (
                  <a
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
                  </a>
                );
              }
              const active = [...item.links, ...(item.years ?? [])].some(isActive);
              return (
                <div key={item.label} data-nav-menu className="flex border-l border-foreground">
                  <button
                    type="button"
                    aria-expanded="false"
                    aria-controls={panelId(item.label)}
                    className={cn(
                      cell,
                      "group gap-2 text-foreground cursor-pointer",
                      active && "bg-linen-200",
                      "not-aria-expanded:hover:bg-foreground not-aria-expanded:hover:text-background",
                      // The open button is the panel's tab: same paper, covering the bar's bottom rule beneath it.
                      "aria-expanded:relative aria-expanded:z-10 aria-expanded:bg-linen-50 aria-expanded:after:absolute aria-expanded:after:inset-x-0 aria-expanded:after:-bottom-[2px] aria-expanded:after:h-[2px] aria-expanded:after:bg-linen-50",
                    )}
                  >
                    {item.label}
                    <LuChevronDown
                      aria-hidden="true"
                      className="h-3 w-3 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out group-aria-expanded:rotate-180"
                    />
                  </button>
                  <MenuPanel id={panelId(item.label)} item={item} isActive={isActive} />
                </div>
              );
            })}
          </nav>
          <div className="flex-1" />
          <a
            href="/search"
            aria-label="Search"
            className={cn(
              cell,
              "hidden lg:flex border-l border-foreground text-foreground hover:bg-foreground hover:text-background",
            )}
          >
            <LuSearch className="h-4 w-4" aria-hidden="true" />
          </a>
          <a
            href={cta.href}
            className={cn(
              cell,
              "hidden lg:flex border-l border-foreground bg-foreground text-background hover:bg-merah-600",
            )}
          >
            {cta.label}
          </a>
        </div>
        {/* Runs along the bottom rule while a clicked page loads (nav.ts). */}
        <div data-nav-progress aria-hidden="true" className="nav-progress" />
      </header>
    </>
  );
}

function MenuPanel({
  id,
  item,
  isActive,
}: {
  id: string;
  item: Extract<NavItem, { kind: "menu" }>;
  isActive: (link: NavLink) => boolean;
}) {
  const count = item.links.length;
  return (
    // A sheet of lighter paper drawn from the bar. Its top rule is the bar's own, broken under the open button,
    // and its cells are ruled by hairline gaps over a tinted backing.
    // Each menu has its own panel, so moving between open menus would replay the entrance; it plays only when a
    // menu opens from closed.
    <div
      id={id}
      data-nav-panel
      hidden
      className="absolute inset-x-0 top-full -mt-[2px] border-y-2 border-foreground bg-linen-50 shadow-[0_28px_56px_-28px_rgb(39_39_39/0.45)] motion-safe:data-entering:animate-[nav-panel-in_240ms_cubic-bezier(0.2,0,0,1)]"
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
                <a
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className="group relative flex w-full flex-col bg-linen-50 px-7 py-7 xl:px-9 no-underline text-foreground transition-colors duration-150 ease-out hover:bg-linen-100"
                >
                  {/* A line that draws across the top on hover, and stays drawn for the current page. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-0 top-0 h-[2px] origin-left bg-biru-800 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out",
                      active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                    )}
                  />
                  <span className="flex items-baseline justify-between gap-4">
                    <span className="font-display text-xl font-semibold tracking-tight transition-colors duration-150 ease-out group-hover:text-biru-800">
                      {link.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-biru-800 opacity-0 -translate-x-1.5 transition-opacity motion-safe:transition-[opacity,translate] duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0"
                    >
                      →
                    </span>
                  </span>
                  {link.note && <span className="mt-1.5 text-sm leading-snug text-charcoal-700">{link.note}</span>}
                </a>
              </li>
            );
          })}
        </ul>
        {item.years?.length ? (
          <div className="bg-linen-50 px-7 py-7 xl:px-9">
            <div className={cn(kicker, "text-charcoal-600")}>By year</div>
            <ul className="m-0 mt-5 grid list-none grid-cols-5 gap-px border border-foreground/25 bg-foreground/25 p-0">
              {item.years.map((link) => (
                <li key={link.href} className="flex">
                  <a
                    href={link.href}
                    aria-current={isActive(link) ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-center font-mono text-[0.75rem] tabular-nums tracking-[0.08em] no-underline transition-colors duration-150 ease-out",
                      isActive(link)
                        ? "bg-biru-800 text-linen-50"
                        : "bg-linen-50 text-charcoal-800 hover:bg-foreground hover:text-background",
                    )}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
