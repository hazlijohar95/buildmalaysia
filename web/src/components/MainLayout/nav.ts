// The header's behaviour (Header.tsx renders the markup): menus that open on hover with a mouse and on click or
// Enter otherwise, and the progress bar while a clicked page loads.

const OPEN_DELAY = 80; // ms of hover before a menu opens, so passing the pointer across the bar opens nothing
const CLOSE_DELAY = 160; // ms of grace after the pointer leaves, so a diagonal move into the panel keeps it open
const PROGRESS_AFTER = 150; // ms before the bar shows: a cached or prefetched page arrives before this
const PROGRESS_GIVE_UP = 15_000; // a navigation the browser cancelled never unloads the page

function required<T extends Element>(root: Document | HTMLElement, selector: string, type: new () => T): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Header markup is missing ${selector}`);
  return found;
}

function setUpMenus(header: HTMLElement) {
  const backdrop = required(document, "[data-nav-backdrop]", HTMLElement);
  const menus = [...header.querySelectorAll<HTMLElement>("[data-nav-menu]")].map((cell) => ({
    cell,
    button: required(cell, "button", HTMLButtonElement),
    panel: required(cell, "[data-nav-panel]", HTMLElement),
  }));
  type Menu = (typeof menus)[number];

  let open: Menu | null = null;
  let openedByHover = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (fn: () => void, ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };

  const setOpen = (next: Menu | null) => {
    if (next === open) return;
    const fromClosed = open === null;
    if (open) {
      open.button.setAttribute("aria-expanded", "false");
      open.panel.hidden = true;
      open.panel.removeAttribute("data-entering");
    }
    if (next) {
      next.button.setAttribute("aria-expanded", "true");
      next.panel.toggleAttribute("data-entering", fromClosed);
      next.panel.hidden = false;
    }
    open = next;
    backdrop.hidden = next === null;
  };

  for (const menu of menus) {
    menu.cell.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      openedByHover = true;
      // Moving between open menus switches at once; opening from closed waits a beat.
      schedule(() => setOpen(menu), open ? 0 : OPEN_DELAY);
    });
    menu.cell.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") schedule(() => setOpen(null), CLOSE_DELAY);
    });
    menu.cell.addEventListener("focusout", (e) => {
      if (open === menu && !menu.cell.contains(e.relatedTarget instanceof Node ? e.relatedTarget : null)) setOpen(null);
    });
    menu.button.addEventListener("click", () => {
      clearTimeout(timer);
      // A click right after hover opened the menu keeps it open instead of closing it.
      const keep = open === menu && openedByHover;
      openedByHover = false;
      if (!keep) setOpen(open === menu ? null : menu);
    });
  }

  backdrop.addEventListener("click", () => setOpen(null));

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !open) return;
    open.button.focus();
    setOpen(null);
  });

  // Going back restores the page from the back/forward cache with whatever menu was open when it was left.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) setOpen(null);
  });
}

/** The same-origin page a click or submit will load, or null when it stays here or downloads a file. */
function destination(href: string): URL | null {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return null; // CSV downloads, images, the manifest
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url;
}

function startsNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return false;
  return destination(link.href) !== null;
}

function submitsNavigation(event: SubmitEvent): boolean {
  if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return false;
  const form = event.target;
  return form.method === "get" && (!form.target || form.target === "_self") && destination(form.action) !== null;
}

function setUpProgress(header: HTMLElement) {
  const bar = required(header, "[data-nav-progress]", HTMLElement);
  let timers: ReturnType<typeof setTimeout>[] = [];
  const reset = () => {
    timers.forEach(clearTimeout);
    timers = [];
    delete bar.dataset.state;
  };
  const start = () => {
    reset();
    timers.push(
      setTimeout(() => (bar.dataset.state = "pending"), PROGRESS_AFTER),
      setTimeout(reset, PROGRESS_GIVE_UP),
    );
  };
  // Bubbling, so a handler that cancels the click or submit has already run.
  document.addEventListener("click", (e) => startsNavigation(e) && start());
  document.addEventListener("submit", (e) => submitsNavigation(e) && start());
  window.addEventListener("pageshow", (e) => e.persisted && reset());
}

const header = document.querySelector<HTMLElement>("[data-site-header]");
if (header) {
  setUpMenus(header);
  setUpProgress(header);
}
