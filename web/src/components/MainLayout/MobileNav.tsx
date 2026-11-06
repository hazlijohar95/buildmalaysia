// Below lg the header's menus move to the bottom of the screen, where a thumb reaches them: a tab bar for the
// sections people come for, and a bottom sheet with everything else. mobile.ts opens, closes and drags the sheets.
import type { ReactNode } from "react";
import { LuChartPie, LuMenu, LuReceipt, LuSearch, LuWallet, LuX } from "react-icons/lu";
import { kicker } from "@/components/Boxed";
import type { NavItem, NavLink } from "@/components/MainLayout/Header";
import { cn } from "@/lib/cn";
import { CONTACT_EMAIL } from "@/lib/contact";

const tabCell =
  "tap flex h-[var(--tabbar)] w-full flex-col items-center justify-center gap-1 font-mono text-[0.625rem] font-medium uppercase tracking-[0.12em] no-underline text-foreground";

function Tab({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(tabCell, "relative", active && "bg-linen-200")}
    >
      {/* The current section is marked by a rule along the top edge, like the open tab in the desktop header. */}
      {active && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-merah-600" />}
      <span aria-hidden="true" className="text-[1.25rem] leading-none">
        {icon}
      </span>
      {label}
    </a>
  );
}

const starts = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** The tab bar pinned to the bottom of the screen below lg. */
export function TabBar({ pathname, budgetYear }: { pathname: string; budgetYear?: number }) {
  const inSpending = starts(pathname, ["/spending", "/ministries"]) || /^\/\d{4}(\/|$)/.test(pathname);
  return (
    <nav
      aria-label="Sections"
      className="lg:hidden fixed inset-x-0 bottom-0 z-50 border-t-2 border-foreground bg-background pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
    >
      <ul className="m-0 grid list-none grid-cols-5 divide-x divide-foreground/20 p-0">
        <li>
          <Tab href="/spending" label="Spending" icon={<LuChartPie />} active={inSpending} />
        </li>
        <li>
          <Tab
            href={budgetYear ? `/budget/${budgetYear}` : "/budget"}
            label="Budget"
            icon={<LuReceipt />}
            active={starts(pathname, ["/budget"])}
          />
        </li>
        <li>
          <Tab href="/tax" label="Taxes" icon={<LuWallet />} active={starts(pathname, ["/tax"])} />
        </li>
        <li>
          <Tab href="/search" label="Search" icon={<LuSearch />} active={starts(pathname, ["/search"])} />
        </li>
        <li>
          <button
            type="button"
            data-sheet-open="menu-sheet"
            aria-haspopup="dialog"
            className={cn(tabCell, "cursor-pointer")}
          >
            <span aria-hidden="true" className="text-[1.25rem] leading-none">
              <LuMenu />
            </span>
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}

/**
 * A sheet that slides up from the bottom: a modal <dialog>, so focus, Escape and the backdrop come from the browser.
 * Drag the handle down, tap the backdrop or the close button to dismiss it.
 */
export function Sheet({
  id,
  title,
  children,
  labelledBy,
}: {
  id: string;
  title: ReactNode;
  children?: ReactNode;
  labelledBy?: string;
}) {
  const headingId = labelledBy ?? `${id}-title`;
  return (
    <dialog id={id} data-sheet aria-labelledby={headingId} className="sheet">
      <div className="sheet-body">
        <div data-sheet-grip className="sheet-grip">
          <span aria-hidden="true" className="sheet-handle" />
          <div className="flex items-center justify-between gap-4 px-5 pb-3">
            <h2 id={headingId} className="m-0 font-display text-xl font-semibold tracking-tight">
              {title}
            </h2>
            <button type="button" data-sheet-close aria-label="Close" className="tap -mr-2 p-2 text-foreground">
              <LuX aria-hidden="true" className="h-6 w-6" />
            </button>
          </div>
        </div>
        <div className="sheet-scroll">{children}</div>
      </div>
    </dialog>
  );
}

const row = (link: NavLink, isActive: (l: NavLink) => boolean) => (
  <a
    key={link.href}
    href={link.href}
    aria-current={isActive(link) ? "page" : undefined}
    className={cn(
      "tap flex min-h-12 items-center justify-between gap-4 border-b border-foreground/15 px-5 py-3 no-underline text-foreground",
      isActive(link) && "bg-linen-200",
    )}
  >
    <span>
      <span className="block font-medium">{link.label}</span>
      {link.note && <span className="block text-sm text-charcoal-700">{link.note}</span>}
    </span>
    <span aria-hidden="true" className="text-charcoal-600">
      →
    </span>
  </a>
);

/** Everything the desktop header and footer link to, as a bottom sheet behind the Menu tab. */
export function MenuSheet({ items, pathname, extra }: { items: NavItem[]; pathname: string; extra: NavLink[] }) {
  const isActive = (link: NavLink) => link.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
  return (
    <Sheet id="menu-sheet" title="Menu">
      <nav aria-label="Menu">
        {items.map((item) =>
          item.kind === "link" ? null : (
            <section key={item.label} className="border-t-2 border-foreground">
              <h3 className={cn(kicker, "m-0 px-5 pt-5 pb-2 text-charcoal-700")}>{item.label}</h3>
              {item.links.map((l) => row(l, isActive))}
              {item.years?.length ? (
                <div className="px-5 py-4">
                  <div className={cn(kicker, "mb-3 text-charcoal-700")}>By year</div>
                  <div className="year-strip -mx-5 px-5">
                    {item.years.map((y) => (
                      <a
                        key={y.href}
                        href={y.href}
                        aria-current={isActive(y) ? "page" : undefined}
                        className={cn(
                          kicker,
                          "tap inline-flex min-h-11 shrink-0 items-center border-2 border-foreground px-4 no-underline -ml-[2px]",
                          isActive(y) ? "bg-foreground text-background" : "text-foreground",
                        )}
                      >
                        {y.label}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ),
        )}
        <section className="border-t-2 border-foreground">
          {items.flatMap((item) => (item.kind === "link" ? [row(item, isActive)] : []))}
          {extra.map((l) => row(l, isActive))}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="tap flex min-h-12 items-center px-5 py-3 font-medium no-underline text-foreground"
          >
            Contact
          </a>
        </section>
      </nav>
    </Sheet>
  );
}
