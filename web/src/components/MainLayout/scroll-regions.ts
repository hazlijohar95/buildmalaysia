// Areas that scroll sideways (wide tables, the bar chart, the phone carousel) take keyboard focus while they overflow
// and hold nothing focusable of their own, so the arrow keys can scroll them. Elsewhere they stay out of the tab order.
// A ResizeObserver watches each area and its content, so a table revealed by a tab, or one that grows as its figures
// change, is measured when it actually appears, not only at load.

const SELECTOR = ".table-scroll, [data-carousel-track], [data-scroll-x]";
const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

/** A name for the area: the one it was given, its table's caption, its chart's label, or the heading it sits under. */
function label(area: HTMLElement): string {
  if (area.dataset.scrollLabel) return area.dataset.scrollLabel;
  const own =
    area.querySelector("caption")?.textContent ?? area.querySelector("svg[aria-label]")?.getAttribute("aria-label");
  if (own?.trim()) return own.trim();
  for (let node: Element | null = area; node && node !== document.body; node = node.parentElement) {
    for (let before = node.previousElementSibling; before; before = before.previousElementSibling) {
      const heading = before.matches("h2, h3") ? before : before.querySelector("h2, h3");
      if (heading?.textContent?.trim()) return heading.textContent.trim();
    }
  }
  return "Scrollable content";
}

function apply(area: HTMLElement): void {
  const needsFocus = area.scrollWidth > area.clientWidth + 1 && !area.querySelector(FOCUSABLE);
  if (needsFocus === area.hasAttribute("data-scroll-focus")) return;
  // A figure keeps its own role; anything else becomes a named region.
  const role = area.tagName === "FIGURE" ? null : "region";
  if (needsFocus) {
    area.dataset.scrollFocus = "";
    area.tabIndex = 0;
    if (role) area.setAttribute("role", role);
    area.setAttribute("aria-label", label(area));
  } else {
    delete area.dataset.scrollFocus;
    area.removeAttribute("tabindex");
    if (role) area.removeAttribute("role");
    area.removeAttribute("aria-label");
  }
}

const areaOf = new WeakMap<Element, HTMLElement>();
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const area = areaOf.get(entry.target);
    if (area) apply(area);
  }
});

function watch(area: HTMLElement): void {
  areaOf.set(area, area);
  observer.observe(area); // the viewport side of the overflow
  const content = area.firstElementChild; // and the content side, which a tab reveal or a redraw changes
  if (content) {
    areaOf.set(content, area);
    observer.observe(content);
  }
}

// After load, so mobile.ts has reshaped the tables it turns into phone views first.
addEventListener("load", () => {
  for (const area of document.querySelectorAll<HTMLElement>(SELECTOR)) watch(area);
});
